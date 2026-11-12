// 管钱钱 - 智能记账页面
const termHelper = require('../../utils/termExplain.js')
const app = getApp()

let recorderManager = null
let recordTimer = null
let _moneyVoiceInited = false

try {
  recorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null
} catch (e) {
  recorderManager = null
}

function cleanDisplayText(value, fallback = '') {
  if (Array.isArray(value)) {
    value = value.filter(Boolean).map(item => cleanDisplayText(item, '')).filter(Boolean).join('、')
  }
  if (value && typeof value === 'object') {
    value = value.name || value.title || value.label || value.value || ''
  }
  let text = String(value == null ? '' : value).trim()
  text = text
    .replace(/\uFEFF|ï»¿|�/g, '')
    .replace(/\[object Object\]/g, '')
    .replace(/undefined|null|NaN/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*\d+[、.]\s*/gm, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return text || fallback
}

function cleanAssistantText(value, fallback = '小享暂时没有看清完整信息，请稍后再问一次。') {
  let text = value
  if (text && typeof text === 'object') text = text.reply || text.answer || text.content || text.message || ''
  text = String(text == null ? '' : text)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(?:Traceback|Exception|Internal Server Error|statusCode|provider_error|调试信息)[:：]?[\s\S]*/gi, '')
    .replace(/\{\s*["']text["']\s*:[\s\S]*?["']score["']\s*:[\s\S]*?\}/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || fallback
}

// 收入分类
const INCOME_CATEGORIES = [
  { id: 'salary', name: '养老金', icon: '💰' },
  { id: 'subsidy', name: '补贴', icon: '🎁' },
  { id: 'investment', name: '理财收益', icon: '📈' },
  { id: 'gift', name: '子女补贴', icon: '💝' },
  { id: 'rent', name: '房租收入', icon: '🏠' },
  { id: 'other_income', name: '其他收入', icon: '📥' }
]

// 支出分类
const EXPENSE_CATEGORIES = [
  { id: 'food', name: '餐饮', icon: '🍜' },
  { id: 'fresh_veg', name: '蔬菜生鲜', icon: '🥬' },
  { id: 'fresh_fruit', name: '水果生鲜', icon: '🍎' },
  { id: 'shopping', name: '购物', icon: '🛍️' },
  { id: 'transport', name: '交通', icon: '🚗' },
  { id: 'medical', name: '医疗', icon: '🏥' },
  { id: 'utilities', name: '水电煤', icon: '💡' },
  { id: 'entertainment', name: '娱乐', icon: '🎮' },
  { id: 'education', name: '教育', icon: '📚' },
  { id: 'finance', name: '理财投资', icon: '💹' },
  { id: 'other_expense', name: '其他支出', icon: '📤' }
]

Page({
  data: {
    summary: {},
    ledgerTotals: null,
    records: [],
    dailyRecords: [],
    financeRecords: [],
    positions: [],
    pocketCards: [],
    pocketsSummary: null,
    selectedPocket: null,
    selectedPosition: null,
    positionAskOpen: false,
    positionAskInput: '',
    positionAskMessages: [],
    positionAskLoading: false,
    pocketAskOpen: false,
    pocketAskInput: '',
    pocketAskMessages: [],
    pocketAskLoading: false,
    financeParseAskOpen: false,
    financeParseAskInput: '',
    financeParseAskMessages: [],
    financeParseAskLoading: false,
    financeParseAskProductIndex: -1,
    showPocketDetail: false,
    showPositionDetail: false,
    moneyMode: 'daily',
    detailRecord: null,
    showDetailPanel: false,
    lastParse: null,
    showParsePanel: false,
    lastFinanceParse: null,
    showFinanceParsePanel: false,
    ledgerScope: 'own',
    familyLedgerOptions: [],
    selectedFamilyIndex: 0,
    selectedFamilyElderId: '',
    globalFontPageClass: 'font-global-normal',
    termExplainPopups: [],
    
    // 记账表单
    showAddPanel: false,
    recordType: 'expense', // 'income' | 'expense'
    categories: EXPENSE_CATEGORIES,
    selectedCategory: '',
    amount: '',
    description: '',
    editingRecordId: '',
    editingDate: '',
    
    // 语音相关
    recording: false,
    recordingSeconds: 0,
    recordingMax: 30
  },

  onLoad(options = {}) {
    if (String(options.family || '') === '1') this.setData({ ledgerScope: 'family' })
  },

  onShow() {
    this.syncGlobalFont()
    this.loadFamilyLedgerOptions()
    this.load()
  },

  onUnload() {
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
  },

  syncGlobalFont() {
    const font = app.getGlobalFontSetting()
    this.setData({ globalFontPageClass: font.pageClass })
  },

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    termHelper.handleDoubleTap(this, e, {
      term,
      nearbyText: () => JSON.stringify(this.data.summary || {}),
      scene: 'money'
    })
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  switchMoneyMode(e) {
    const mode = e.currentTarget.dataset.mode || 'daily'
    const labels = { daily: '日常收支', finance: '理财记录' }
    this.setData({ moneyMode: mode })
    this.speak(labels[mode] || mode)
  },

  switchLedgerScope(e) {
    const scope = e.currentTarget.dataset.scope === 'family' ? 'family' : 'own'
    this.setData({ ledgerScope: scope })
    this.load()
  },

  onFamilyLedgerChange(e) {
    const index = Number(e.detail.value || 0)
    const item = (this.data.familyLedgerOptions || [])[index]
    this.setData({ selectedFamilyIndex: index, selectedFamilyElderId: item ? item.elderId : '' })
    if (this.data.ledgerScope === 'family') this.load()
  },

  loadFamilyLedgerOptions() {
    app.request({ url: '/family/members', loading: false }).then(res => {
      const role = wx.getStorageSync('role') || 'elder'
      const user = wx.getStorageSync('user') || {}
      const seen = {}
      const options = (res.items || res.members || []).map(item => {
        const elderId = role === 'child' ? (item.family_id || item.peer_id || item.id) : (item.family_id || user.id)
        return { elderId, label: item.display_name || item.name || item.nickname || '家庭账本' }
      }).filter(item => item.elderId && !seen[item.elderId] && (seen[item.elderId] = true))
      if (role === 'elder' && user.id && !options.length) options.push({ elderId: user.id, label: '我的家庭' })
      this.setData({
        familyLedgerOptions: options,
        selectedFamilyIndex: 0,
        selectedFamilyElderId: options[0] ? options[0].elderId : ''
      })
    }).catch(() => {})
  },

  openRecordDetail(e) {
    const id = e.currentTarget.dataset.id
    const record = this.findRecordById(id)
    if (!record) return
    this.setData({
      detailRecord: record,
      showDetailPanel: true
    })
  },

  closeRecordDetail() {
    this.setData({
      detailRecord: null,
      showDetailPanel: false
    })
  },

  openPocketDetail(e) {
    const key = e.currentTarget.dataset.key
    const selectedPocket = (this.data.pocketCards || []).find(item => String(item.key) === String(key))
    if (!selectedPocket) return
    this.setData({
      selectedPocket,
      showPocketDetail: true,
      showDetailPanel: false
    })
  },

  closePocketDetail() {
    this.setData({
      selectedPocket: null,
      showPocketDetail: false,
      pocketAskOpen: false,
      pocketAskInput: '',
      pocketAskMessages: [],
      pocketAskLoading: false
    })
  },

  openPositionDetail(e) {
    const id = e.currentTarget.dataset.id
    const selectedPosition = (this.data.positions || []).find(item => String(item.id) === String(id))
    if (!selectedPosition) return
    this.setData({
      selectedPosition,
      showPositionDetail: true,
      showDetailPanel: false,
      showPocketDetail: false,
      positionAskOpen: false,
      positionAskInput: '',
      positionAskMessages: []
    })
  },

  closePositionDetail() {
    this.setData({
      selectedPosition: null,
      showPositionDetail: false,
      positionAskOpen: false,
      positionAskInput: '',
      positionAskMessages: [],
      positionAskLoading: false
    })
  },

  load() {
    const familyQuery = this.data.ledgerScope === 'family'
      ? `?scope=family${this.data.selectedFamilyElderId ? '&elder_id=' + encodeURIComponent(this.data.selectedFamilyElderId) : ''}`
      : ''
    app.request({ url: '/ledger/summary' + familyQuery }).then(res => {
      const records = res.records || []
      const dailyRecords = res.daily_records || records.filter(item => item.record_kind !== 'finance')
      const financeRecords = res.finance_records || records.filter(item => item.record_kind === 'finance')
      this.setData({
        ...res,
        records,
        dailyRecords,
        financeRecords,
        ledgerTotals: this.buildLedgerTotals(records, dailyRecords, financeRecords)
      })
    }).catch(() => {
      this.setData({
        records: [],
        dailyRecords: [],
        financeRecords: [],
        ledgerTotals: this.buildLedgerTotals([], [], []),
        summary: { income_text: '0', expense_text: '0', balance_text: '0' }
      })
      wx.showToast({ title: '账本暂时没有读取成功', icon: 'none' })
    })

    app.request({ url: '/wealth/positions' }).then(res => {
      this.setData({ positions: (res.items || []).map(item => this.decoratePosition(item)) })
    }).catch(() => {})

    app.request({ url: '/pockets/summary' }).then(res => {
      this.setData({
        pocketsSummary: res,
        pocketCards: res.pockets || res.cards || []
      })
    }).catch(() => {
      this.setData({ pocketsSummary: null, pocketCards: [] })
    })
  },

  decoratePosition(item) {
    item = Object.assign({}, item || {})
    const raw = item.raw_info || {}
    const product = raw.product || {}
    const removeReviewWords = value => String(value || '').replace(/[（(]?待核验[）)]?/g, '').replace(/pending_review/ig, '').trim()
    item.product_name = removeReviewWords(item.product_name) || '理财记录'
    item.institution = removeReviewWords(item.institution)
    item.source_label = removeReviewWords(item.source_label || (item.source === 'image_recognition' ? '图片识别' : (item.source || '手动记录')))
    const rawStatus = String(item.status_label || raw.status || '已记录')
    item.status_label = /待核验|pending|review/i.test(rawStatus) ? '已记录' : rawStatus
    item.risk_summary = item.risk_summary || raw.risk_summary || ''
    item.elder_explanation = item.elder_explanation || raw.elder_explanation || raw.remark || ''
    item.risk_level = item.risk_level || raw.risk_level_label || product.risk_level || ''
    item.benchmark = item.benchmark || raw.benchmark || product.yield_expression || ''
    item.term = item.term || raw.term || product.term || ''
    item.min_amount = item.min_amount || raw.min_amount || product.min_buy || ''
    item.redeem_rule = item.redeem_rule || raw.redeem_rule || product.redemption_rule || ''
    item.service_phone = item.service_phone || raw.service_phone || product.customer_service || ''
    item.detailFields = (raw.recognized_fields || []).filter(field => !/^(识别文字|文字|text|field|字段)\s*\d+$/i.test(String(field.label || ''))).map(field => ({
      label: cleanDisplayText(field.label, ''),
      value: cleanDisplayText(field.value, ''),
      labelSegments: termHelper.buildTermSegments(cleanDisplayText(field.label, '')),
      valueSegments: termHelper.buildTermSegments(cleanDisplayText(field.value, ''))
    })).filter(field => field.label && field.value)
    return item
  },

  togglePositionAsk() {
    const open = !this.data.positionAskOpen
    this.setData({
      positionAskOpen: open,
      positionAskMessages: open && !this.data.positionAskMessages.length
        ? [{ role: 'assistant', text: '您好，我会结合这条理财记录为您解释。您可以问“这是什么产品”“风险高不高”或“期限合适吗”。' }]
        : this.data.positionAskMessages
    })
  },

  onPositionAskInput(e) {
    this.setData({ positionAskInput: e.detail.value })
  },

  sendPositionAsk() {
    const question = String(this.data.positionAskInput || '').trim()
    const item = this.data.selectedPosition
    if (!question || !item || this.data.positionAskLoading) return
    const messages = (this.data.positionAskMessages || []).concat([{ role: 'user', text: question }])
    this.setData({ positionAskMessages: messages, positionAskInput: '', positionAskLoading: true })
    const context = [
      `产品名称：${item.product_name || '未识别'}`,
      `发行机构：${item.institution || '未识别'}`,
      `记录金额：${item.amount_text || item.amount || 0}元`,
      `风险等级：${item.risk_level || '未识别'}`,
      `收益基准：${item.benchmark || '未识别'}`,
      `产品期限：${item.term || '未识别'}`,
      `赎回规则：${item.redeem_rule || '未识别'}`
    ].join('；')
    app.request({
      url: '/assistant/chat',
      method: 'POST',
      data: {
        message: `${question}\n请结合这条理财记录，用适合长辈理解的白话回答，不要臆造缺失信息。\n${context}`,
        mode: 'finance_record_explain',
        history: messages.slice(-8).map(msg => ({ role: msg.role, text: msg.text }))
      },
      loading: false
    }).then(res => {
      const reply = res.reply || res.answer || '这条信息暂时还不够完整，建议查看银行官方产品说明书后再判断。'
      this.setData({ positionAskMessages: this.data.positionAskMessages.concat([{ role: 'assistant', text: reply }]) })
    }).catch(() => {
      this.setData({ positionAskMessages: this.data.positionAskMessages.concat([{ role: 'assistant', text: '小享暂时没有连上服务，请稍后再问。' }]) })
    }).finally(() => this.setData({ positionAskLoading: false }))
  },

  rebalancePockets() {
    app.request({
      url: '/pockets/rebalance',
      method: 'POST',
      data: {},
      loading: true
    }).then(res => {
      this.setData({
        pocketsSummary: res,
        pocketCards: res.pockets || res.cards || []
      })
      wx.showToast({ title: '已更新分账建议', icon: 'none' })
    }).catch(() => {
      wx.showToast({ title: '分账建议暂时不可用', icon: 'none' })
    })
  },

  askPocketAnalysis() {
    const pocket = this.data.selectedPocket
    const summary = this.data.pocketsSummary || {}
    if (!pocket) return
    this.setData({
      pocketAskOpen: true,
      pocketAskInput: '',
      pocketAskMessages: [{
        role: 'assistant',
        text: `我会在这里解释“${pocket.name}”的分账依据。这个金额是根据总资产、月收入和月支出计算出的建议标签，不会替您转账。您还可以继续问我。`
      }]
    })
    this.sendPocketAsk(true, summary)
  },

  closePocketAsk() {
    this.setData({ pocketAskOpen: false, pocketAskInput: '', pocketAskLoading: false })
  },

  onPocketAskInput(e) { this.setData({ pocketAskInput: e.detail.value }) },

  sendPocketAsk(initial = false, suppliedSummary = null) {
    const pocket = this.data.selectedPocket
    if (!pocket || this.data.pocketAskLoading) return
    const isInitial = initial === true
    const summary = suppliedSummary || this.data.pocketsSummary || {}
    const question = isInitial
      ? `请用白话解释我的“${pocket.name}”为什么建议金额为${pocket.amount_text}元、占比${pocket.ratio}%。总资产约${summary.total_asset_text || 0}元，月收入${summary.monthly_income || 0}元，月支出${summary.monthly_expense || 0}元。说明计算依据、风险边界和下一步，不要建议真实转账。`
      : String(this.data.pocketAskInput || '').trim()
    if (!question) return
    const visibleMessages = isInitial
      ? this.data.pocketAskMessages
      : this.data.pocketAskMessages.concat([{ role: 'user', text: question }])
    this.setData({ pocketAskMessages: visibleMessages, pocketAskInput: '', pocketAskLoading: true })
    app.request({
      url: '/assistant/chat', method: 'POST', loading: false,
      data: {
        message: `${question}\n分账名称：${pocket.name}；用途：${pocket.purpose || ''}；建议金额：${pocket.amount_text || 0}元；建议比例：${pocket.ratio || 0}%。`,
        mode: 'pocket_explain',
        history: visibleMessages.slice(-8).map(item => ({ role: item.role, text: item.text }))
      }
    }).then(res => {
      const reply = cleanAssistantText(res.reply || res.answer || res.content)
      this.setData({ pocketAskMessages: this.data.pocketAskMessages.concat([{ role: 'assistant', text: reply }]) })
    }).catch(() => {
      this.setData({ pocketAskMessages: this.data.pocketAskMessages.concat([{ role: 'assistant', text: '这项金额只是结合您当前资料生成的分账建议，不会实际划转资金。资料变化后可以重新分析。' }]) })
    }).finally(() => this.setData({ pocketAskLoading: false }))
  },

  buildLedgerTotals(records, dailyRecords, financeRecords) {
    const summarize = (list) => {
      let income = 0
      let expense = 0
      ;(list || []).forEach(record => {
        const amount = Math.abs(Number(String(record.amount || record.amount_text || 0).replace(/,/g, ''))) || 0
        const typeText = String(record.type || '').toLowerCase()
        if (typeText === '收入' || typeText === 'income' || typeText === 'in') {
          income += amount
        } else {
          expense += amount
        }
      })
      return {
        income,
        expense,
        balance: income - expense,
        income_text: income.toLocaleString(),
        expense_text: expense.toLocaleString(),
        balance_text: (income - expense).toLocaleString()
      }
    }
    return {
      overall: summarize(records),
      daily: summarize(dailyRecords),
      finance: summarize(financeRecords)
    }
  },

  // 计算汇总数据
  calculateSummary(records) {
    let income = 0
    let expense = 0
    
    records.forEach(record => {
      const amount = parseFloat(record.amount) || 0
      if (record.type === '收入') {
        income += amount
      } else {
        expense += amount
      }
    })

    return {
      income_text: income.toLocaleString(),
      expense_text: expense.toLocaleString(),
      balance_text: (income - expense).toLocaleString()
    }
  },

  // ========== 基础记账 ==========
  add() {
    this.speak('记一笔，请选择收入或支出')
    wx.showActionSheet({
      itemList: ['记录收入', '记录支出'],
      success: (res) => {
        const isIncome = res.tapIndex === 0
        this.openAddPanel(isIncome ? 'income' : 'expense')
      }
    })
  },

  openAddPanel(type) {
    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    this.setData({
      showDetailPanel: false,
      showAddPanel: true,
      recordType: type,
      categories,
      selectedCategory: '',
      amount: '',
      description: '',
      editingRecordId: '',
      editingDate: ''
    })
  },

  closeAddPanel() {
    this.setData({ showAddPanel: false, editingRecordId: '', editingDate: '' })
  },

  stopTap() {},

  findCategoryId(record, categories) {
    const categoryText = String(record.category_name || record.category || '').trim()
    const matched = categories.find(item => item.id === categoryText || item.name === categoryText)
    if (matched) return matched.id
    if (/水果|苹果|香蕉|橙子|梨|葡萄/.test(categoryText + record.title)) return 'fresh_fruit'
    if (/买菜|菜市场|蔬菜|生鲜|青菜|白菜|土豆|番茄/.test(categoryText + record.title)) return 'fresh_veg'
    if (/餐饮|吃饭|外卖/.test(categoryText + record.title)) return 'food'
    if (/购物|超市|日用品|淘宝|京东/.test(categoryText + record.title)) return 'shopping'
    if (/医疗|医院|药|门诊/.test(categoryText + record.title)) return 'medical'
    if (/理财|基金|国债|存款|收益|赎回/.test(categoryText + record.title)) {
      return record.type === '收入' ? 'investment' : 'finance'
    }
    return categories[0] ? categories[0].id : ''
  },

  findRecordById(id) {
    return (this.data.records || []).find(item => String(item.id) === String(id)) ||
      (this.data.dailyRecords || []).find(item => String(item.id) === String(id)) ||
      (this.data.financeRecords || []).find(item => String(item.id) === String(id))
  },

  editRecord(e) {
    const id = e.currentTarget.dataset.id
    const record = this.findRecordById(id)
    if (!record) {
      wx.showToast({ title: '没有找到这条记录', icon: 'none' })
      return
    }
    this.speak('正在修改记录：' + (record.title || '') + '，金额' + (record.amount_text || record.amount) + '元')
    const type = record.type === '收入' ? 'income' : 'expense'
    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    const selectedCategory = this.findCategoryId(record, categories)
    this.setData({
      showAddPanel: true,
      recordType: type,
      categories,
      selectedCategory,
      amount: String(record.amount || '').replace(/,/g, ''),
      description: record.description || record.title || '',
      editingRecordId: id,
      editingDate: record.date || this.formatDate(new Date())
    })
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    const record = this.findRecordById(id)
    if (!record) return
    wx.showModal({
      title: '删除这条记录？',
      content: `${record.title || '账本记录'}，金额 ${record.amount_text || record.amount} 元。删除后将不再参与分析。`,
      confirmText: '删除',
      confirmColor: '#c05a32',
      success: (res) => {
        if (!res.confirm) return
        app.request({
          url: '/ledger/records/' + id,
          method: 'DELETE',
          loading: true
        }).then(() => {
          this.closeRecordDetail()
          this.speak('已删除记录：' + (record.title || '') + '，金额' + (record.amount_text || record.amount) + '元')
          wx.showToast({ title: '已删除', icon: 'success' })
          this.load()
        }).catch(() => {
          wx.showToast({ title: '暂时没有删除成功，请稍后再试', icon: 'none' })
        })
      }
    })
  },

  // 选择分类
  selectCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedCategory: id })
  },

  // 输入金额
  onAmountInput(e) {
    // 只允许数字和小数点
    let value = e.detail.value.replace(/[^\d.]/g, '')
    // 只允许一个小数点
    const dotCount = value.split('.').length - 1
    if (dotCount > 1) {
      value = value.slice(0, value.lastIndexOf('.'))
    }
    // 小数点后最多两位
    const dotIndex = value.indexOf('.')
    if (dotIndex > -1 && value.length - dotIndex > 3) {
      value = value.slice(0, dotIndex + 3)
    }
    this.setData({ amount: value })
  },

  // 输入备注
  onDescriptionInput(e) {
    this.setData({ description: e.detail.value })
  },

  // 提交记账
  submitRecord() {
    const { recordType, selectedCategory, amount, description, editingRecordId, editingDate } = this.data
    
    if (!selectedCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }
    
    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' })
      return
    }

    const category = this.data.categories.find(c => c.id === selectedCategory)
    const typeText = recordType === 'income' ? '收入' : '支出'
    const title = description || category.name

    const recordData = {
      type: typeText,
      category: selectedCategory,
      category_name: category.name,
      amount: amountNum.toFixed(2),
      title,
      description,
      date: editingDate || this.formatDate(new Date()),
      source: editingRecordId ? 'manual_edit' : 'manual'
    }

    // 提交到后端
    app.request({
      url: editingRecordId ? `/ledger/records/${editingRecordId}` : '/ledger/records',
      method: editingRecordId ? 'PUT' : 'POST',
      data: recordData,
      loading: true
    }).then(res => {
      this.finishSubmit(res.record || Object.assign({ id: editingRecordId }, recordData), !!editingRecordId)
    }).catch(() => {
      wx.showToast({ title: '暂时没有保存成功，请稍后再试', icon: 'none' })
    })
  },

  saveLocalRecord(record, editingId = '') {
    const records = wx.getStorageSync('ledger_records') || []
    if (editingId) {
      const next = records.map(item => String(item.id) === String(editingId) ? Object.assign({}, item, record, { id: editingId }) : item)
      wx.setStorageSync('ledger_records', next)
      return
    }
    const saved = Object.assign({}, record, { id: Date.now() })
    records.unshift(saved)
    wx.setStorageSync('ledger_records', records)
  },

  deleteLocalRecord(id) {
    const records = wx.getStorageSync('ledger_records') || []
    wx.setStorageSync('ledger_records', records.filter(item => String(item.id) !== String(id)))
  },

  finishSubmit(record, isEdit = false) {
    this.closeAddPanel()
    this.load()
    const type = record.type === '收入' ? '收入' : '支出'
    app.readText(`${isEdit ? '已修改' : '已记录'}${type}：${record.title}，金额${record.amount}元`)
    wx.showToast({ title: isEdit ? '修改成功' : '记录成功', icon: 'success' })
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // ========== 智能记账 ==========
  smartAdd() {
    this.speak('智能记理财，请选择识别方式')
    wx.showActionSheet({
      itemList: ['文字智能识别', '拍照/图片识别', '语音记账', '手动添加理财持仓'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.smartTextInput()
        } else if (res.tapIndex === 1) {
          this.chooseLedgerImage('smart')
        } else if (res.tapIndex === 2) {
          this.startSmartVoiceInput()
        } else {
          this.manualTrackPosition()
        }
      }
    })
  },

  smartTextInput() {
    wx.showModal({
      title: '智能记账',
      editable: true,
      placeholderText: '如：买了工行稳健理财 20000',
      success: (res) => {
        if (!res.confirm || !res.content) return
        this.doSmartInput('text', res.content)
      }
    })
  },

  startSmartVoiceInput() {
    if (!recorderManager) {
      wx.showToast({ title: '当前设备不支持语音', icon: 'none' })
      return
    }
    if (this.data.recording) return

    wx.vibrateShort({ type: 'medium' })

    wx.getSetting({
      success: (settingRes) => {
        const auth = settingRes.authSetting || {}
        if (auth['scope.record'] === false) {
          wx.showModal({
            title: '需要麦克风权限',
            content: '您之前拒绝了麦克风权限，请在右上角「设置 > 权限管理」中开启麦克风。',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) wx.openSetting()
            }
          })
          return
        }
        // 已授权 → 直接开始录音
        if (auth['scope.record'] === true) {
          this.setData({ recording: true, recordingSeconds: 0 })
          recorderManager.start({
            duration: 30000,
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000,
            format: 'wav'
          })
          const that = this
          recordTimer = setInterval(() => {
            const sec = that.data.recordingSeconds + 1
            that.setData({ recordingSeconds: sec })
            if (sec >= 28) recorderManager.stop()
          }, 1000)
          return
        }
        // 未询问 → 发起授权
        wx.authorize({
          scope: 'scope.record',
          success: () => {
            recorderManager.start({
              duration: 30000,
              sampleRate: 16000,
              numberOfChannels: 1,
              encodeBitRate: 48000,
              format: 'wav'
            })

            const that = this
            recordTimer = setInterval(() => {
              const sec = that.data.recordingSeconds + 1
              that.setData({ recordingSeconds: sec })
              if (sec >= 28) recorderManager.stop()
            }, 1000)

            // 只注册一次，避免重复监听
            if (!_moneyVoiceInited) {
              _moneyVoiceInited = true

              recorderManager.onStop((res) => {
                if (recordTimer) {
                  clearInterval(recordTimer)
                  recordTimer = null
                }
                this.setData({ recording: false, recordingSeconds: 0 })

                const tempFilePath = res.tempFilePath
                if (!tempFilePath) {
                  wx.showToast({ title: '录音文件获取失败', icon: 'none' })
                  return
                }

                wx.showLoading({ title: '识别中…' })
                const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
                const token = wx.getStorageSync('token') || ''

                wx.uploadFile({
                  url: baseUrl + '/assistant/voice-to-text?format=wav',
                  timeout: 70000,
                  filePath: tempFilePath,
                  name: 'file',
                  header: { Authorization: token ? 'Bearer ' + token : '' },
                  success: (uploadRes) => {
                    wx.hideLoading()
                    try {
                      const data = JSON.parse(uploadRes.data)
                      if (data.ok && data.text) {
                        this.doSmartInput('voice', data.text)
                      } else {
                        wx.showModal({
                          title: '没有听清楚',
                          content: '请靠近手机再说一遍，您也可以改用文字输入。',
                          showCancel: false
                        })
                      }
                    } catch (e) {
                      wx.showModal({
                        title: '语音暂时没有识别成功',
                        content: '请再说一遍，或改用文字输入。',
                        showCancel: false
                      })
                    }
                  },
                  fail: () => {
                    wx.hideLoading()
                    wx.showModal({
                      title: '语音暂时不可用',
                      content: '请检查网络后再试，您也可以改用文字输入。',
                      showCancel: false
                    })
                  }
                })
              })

              recorderManager.onError(() => {
                if (recordTimer) {
                  clearInterval(recordTimer)
                  recordTimer = null
                }
                this.setData({ recording: false, recordingSeconds: 0 })
                wx.showToast({ title: '录音失败', icon: 'none' })
              })
            }
          },
          fail: (authErr) => {
            console.error('[语音] authorize失败:', JSON.stringify(authErr))
            this.setData({ recording: false, recordingSeconds: 0 })
            wx.showModal({
              title: '需要麦克风权限',
              content: '请在右上角「设置 > 权限管理」中开启麦克风权限。',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) wx.openSetting()
              }
            })
          }
        })
      },
      fail: () => {
        wx.authorize({
          scope: 'scope.record',
          success: () => {
            recorderManager.start({
              duration: 30000,
              sampleRate: 16000,
              numberOfChannels: 1,
              encodeBitRate: 48000,
              format: 'wav'
            })
            const that = this
            recordTimer = setInterval(() => {
              const sec = that.data.recordingSeconds + 1
              that.setData({ recordingSeconds: sec })
              if (sec >= 28) recorderManager.stop()
            }, 1000)

            if (!_moneyVoiceInited) {
              _moneyVoiceInited = true
              recorderManager.onStop((res) => {
                if (recordTimer) { clearInterval(recordTimer); recordTimer = null }
                this.setData({ recording: false, recordingSeconds: 0 })
                const tempFilePath = res.tempFilePath
                if (!tempFilePath) { wx.showToast({ title: '录音文件获取失败', icon: 'none' }); return }
                wx.showLoading({ title: '识别中…' })
                const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
                const token = wx.getStorageSync('token') || ''
                wx.uploadFile({
                  url: baseUrl + '/assistant/voice-to-text?format=wav',
                  timeout: 70000,
                  filePath: tempFilePath,
                  name: 'file',
                  header: { Authorization: token ? 'Bearer ' + token : '' },
                  success: (uploadRes) => {
                    wx.hideLoading()
                    try {
                      const data = JSON.parse(uploadRes.data)
                      if (data.ok && data.text) this.doSmartInput('voice', data.text)
                      else wx.showToast({ title: data.message || data.hint || '没有听清楚', icon: 'none' })
                    } catch (e) { wx.showToast({ title: '识别解析失败', icon: 'none' }) }
                  },
                  fail: () => { wx.hideLoading(); wx.showToast({ title: '语音识别网络错误', icon: 'none' }) }
                })
              })
              recorderManager.onError(() => {
                if (recordTimer) { clearInterval(recordTimer); recordTimer = null }
                this.setData({ recording: false, recordingSeconds: 0 })
                wx.showToast({ title: '录音失败', icon: 'none' })
              })
            }
          },
          fail: () => {
            this.setData({ recording: false, recordingSeconds: 0 })
            wx.showModal({ title: '需要麦克风权限', content: '请在设置中开启麦克风权限。', showCancel: false })
          }
        })
      }
    })
  },

  doSmartInput(inputType, text) {
    app.request({
      url: '/ledger/smart-input',
      method: 'POST',
      data: {
        input_type: inputType,
        text,
        recognized_text: text
      },
      loading: true
    }).then(res => {
      const count = res.imported_count || (res.record_ids || []).length || 0
      if (res.analysis && !count) {
        const analysis = res.analysis || {}
        wx.showModal({
          title: analysis.title || '理财咨询说明',
          content: analysis.answer || res.message || '这段内容更像理财咨询，还缺少可入账金额。请先核验风险等级、期限、收益来源和官方渠道。',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }
      if (!count) {
        wx.showModal({
          title: '没有可入账记录',
          content: res.hint || res.message || '请补充金额、商户或产品名称后再试。',
          showCancel: false
        })
        return
      }
      wx.showToast({ title: res.position_id ? '已记账并跟踪' : '已记账', icon: 'success' })
      this.load()
    }).catch(() => {
      // 尝试本地解析
      const parsed = this.parseSmartInput(text)
      if (parsed) {
        this.openAddPanel(parsed.type)
        this.setData({
          amount: parsed.amount,
          description: parsed.description,
          selectedCategory: parsed.category
        })
      } else {
        wx.showToast({ title: '解析失败，请手动输入', icon: 'none' })
      }
    })
  },

  importWechatText() {
    this.speak('导入账单，请选择粘贴文字或上传图片')
    wx.showActionSheet({
      itemList: ['粘贴账单文字', '上传账单/小票图片'],
      success: (res) => {
        if (res.tapIndex === 0) this.importWechatTextModal()
        else this.chooseLedgerImage('import')
      }
    })
  },

  importWechatTextModal() {
    wx.showModal({
      title: '导入微信账单',
      editable: true,
      placeholderText: '可多条输入，如：超市购物56.8；养老金5000；买入国债2万',
      success: (res) => {
        if (!res.confirm || !res.content) return
        app.request({
          url: '/ledger/import/wechat-text',
          method: 'POST',
          data: { text: res.content },
          loading: true
        }).then(parsed => {
          this.showParsedImport(parsed)
        })
      }
    })
  },

  chooseLedgerImage(mode) {
    const doUpload = (filePath) => this.uploadLedgerImage(filePath, mode)
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = (res.tempFiles || [])[0]
          if (file && file.tempFilePath) doUpload(file.tempFilePath)
        }
      })
      return
    }
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = (res.tempFilePaths || [])[0]
        if (filePath) doUpload(filePath)
      }
    })
  },

  uploadLedgerImage(filePath, mode) {
    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    if (mode === 'smart') {
      this.uploadFinanceProductImage(filePath)
      return
    }
    wx.showLoading({ title: '识别图片中…', mask: true })
    wx.uploadFile({
      url: baseUrl + '/ledger/import/wechat-image',
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (uploadRes) => {
        wx.hideLoading()
        let parsed = null
        try {
          parsed = JSON.parse(uploadRes.data || '{}')
        } catch (e) {
          wx.showToast({ title: '图片识别结果异常', icon: 'none' })
          return
        }
        if (mode === 'smart') {
          this.showParsedImport(parsed)
        } else {
          this.showParsedImport(parsed)
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '图片上传失败', icon: 'none' })
      }
    })
  },

  uploadFinanceProductImage(filePath) {
    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    wx.showLoading({ title: '识别理财截图中…', mask: true })
    wx.uploadFile({
      url: baseUrl + '/money/parse-finance-image',
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (uploadRes) => {
        wx.hideLoading()
        let data = null
        try {
          data = JSON.parse(uploadRes.data || '{}')
        } catch (e) {
          wx.showToast({ title: '理财识别结果异常', icon: 'none' })
          return
        }
          const normalized = this.normalizeFinanceParse(data)
          if (!data.ok) {
            wx.showModal({
              title: '没有识别清楚',
              content: data.message || '请换一张文字更清晰、内容更完整的截图。',
              showCancel: false
            })
            return
          }
        this.setData({
          lastFinanceParse: normalized,
          showFinanceParsePanel: true,
          showParsePanel: false,
          moneyMode: 'finance'
        })
        app.readText(normalized.message || '已按图片实际内容完成识别，请选择是否添加记录。')
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '图片上传失败', icon: 'none' })
      }
    })
  },

  normalizeFinanceParse(data) {
    data = data || {}
    const product = Object.assign({}, (data && data.product) || {})
    const dynamicFields = (data.recognized_fields || []).map((item, index) => ({
      key: `dynamic_${index}`,
      label: cleanDisplayText(item.label, ''),
      value: cleanDisplayText(item.value, ''),
      section: cleanDisplayText(item.section, '')
    })).filter(item => item.label && item.value)
    const knownFields = [
      { key: 'product_name', label: '产品名称', value: data.product_name || product.name },
      { key: 'issuer', label: '发行机构', value: data.issuer || product.institution },
      { key: 'product_type', label: '产品类型', value: data.product_type || product.product_type },
      { key: 'risk_level', label: '风险等级', value: data.risk_level_label || product.risk_level },
      { key: 'benchmark', label: '收益/业绩比较基准', value: data.benchmark || product.yield_expression },
      { key: 'term', label: '期限', value: data.term || product.term },
      { key: 'min_amount', label: '起购金额', value: data.min_amount || product.min_buy },
      { key: 'redeem_rule', label: '赎回规则', value: data.redeem_rule || product.redemption_rule },
      { key: 'service_phone', label: '客服电话', value: data.service_phone || product.customer_service },
      { key: 'principal_guarantee', label: '是否保本', value: data.principal_guarantee || product.capital_guarantee }
    ].filter(item => cleanDisplayText(item.value, ''))
    const seen = {}
    const cleanFields = dynamicFields.concat(knownFields).filter(item => {
      const key = `${item.label}|${item.value}`
      if (seen[key]) return false
      seen[key] = true
      return true
    }).map(item => ({
      ...item,
      labelSegments: termHelper.buildTermSegments(item.label),
      valueSegments: termHelper.buildTermSegments(item.value)
    }))
    const fieldLabels = {
      name: '产品名称', product_name: '产品名称', institution: '发行机构', issuer: '发行机构',
      product_type: '产品类型', type: '产品类型', risk_level: '风险等级', risk_level_label: '风险等级',
      amount: '持有金额', buy_amount: '买入金额', income: '相关收益', profit: '相关收益',
      yield: '收益率', yield_expression: '收益/业绩比较基准', benchmark: '收益/业绩比较基准',
      term: '期限', duration: '期限', min_buy: '起购金额', min_amount: '起购金额',
      redemption_rule: '赎回规则', redeem_rule: '赎回规则', expected_maturity_date: '预计到期日',
      expected_due_date: '预计到期日', purchase_time: '申购时间', date: '日期',
      registration_code: '登记编码', product_code: '登记编码', customer_service: '客服电话',
      service_phone: '客服电话', capital_guarantee: '是否保本', principal_guarantee: '是否保本'
    }
    const ignoredKeys = { source_section: true, raw: true, status: true, expanded: true }
    let productRows = Array.isArray(data.products) ? data.products.slice() : []
    if (!productRows.length && Array.isArray(data.holdings)) productRows = data.holdings.slice()
    if (!productRows.length && Object.keys(product).length) productRows = [product]
    const products = productRows.map((row, index) => {
      const raw = Object.assign({}, row || {})
      const fields = []
      const seenFields = {}
      Object.keys(raw).forEach(key => {
        if (ignoredKeys[key] || raw[key] === '' || raw[key] === null || raw[key] === undefined) return
        const label = fieldLabels[key] || cleanDisplayText(key, '')
        const value = cleanDisplayText(raw[key], '')
        if (!label || !value || /^(识别文字|文字|text|field|字段)\s*\d+$/i.test(label)) return
        const fieldKey = `${label}|${value}`
        if (seenFields[fieldKey]) return
        seenFields[fieldKey] = true
        fields.push({
          key: `${index}_${key}`,
          sourceKey: key,
          label,
          value,
          labelSegments: termHelper.buildTermSegments(label),
          valueSegments: termHelper.buildTermSegments(value)
        })
      })
      let title = cleanDisplayText(raw.name || raw.product_name || raw.title, '')
      if (/^(金额(?:\(元\)|（元）)?|日期|类型|产品名称|全部记录|相关收益)$/i.test(title)) title = ''
      title = title || cleanDisplayText(raw.product_type || raw.institution, '')
      return {
        key: `product_${index}`,
        title,
        raw,
        fields,
        expanded: fields.length <= 6,
        savedFinance: false,
        savedLedger: false
      }
    }).filter(item => item.title && item.fields.length)
    const ledgerCards = (Array.isArray(data.ledger_items) ? data.ledger_items : []).map((row, index) => {
      const raw = Object.assign({}, row || {})
      const amount = Number(raw.amount || 0)
      const title = cleanDisplayText(raw.title || raw.category, raw.type === '收入' ? '收入记录' : '支出记录')
      const category = cleanDisplayText(raw.category || raw.category_name, raw.record_kind === 'finance' ? '理财记录' : '其他收支')
      return {
        key: `ledger_${index}`,
        title,
        titleSegments: termHelper.buildTermSegments(title),
        category,
        categorySegments: termHelper.buildTermSegments(category),
        type: raw.type === '收入' ? '收入' : '支出',
        recordKind: raw.record_kind === 'finance' ? 'finance' : 'daily',
        kindLabel: raw.record_kind === 'finance' ? '理财收支' : '日常收支',
        amount,
        amountText: amount.toLocaleString('zh-CN', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 }),
        date: cleanDisplayText(raw.date || (raw.time || '').slice(0, 10), ''),
        sourceText: cleanDisplayText(raw.source_text || raw.detail, ''),
        raw,
        saved: false
      }
    }).filter(item => item.amount > 0 && item.title)
    const riskSummary = cleanDisplayText(data.risk_summary, '')
    return Object.assign({}, data, {
      product,
      fields: cleanFields,
      products,
      ledgerCards,
      suspicious_words: (data.suspicious_words || []).map(item => cleanDisplayText(item, '')).filter(Boolean),
      risk_summary: riskSummary,
      risk_tips: riskSummary ? [riskSummary] : [],
      elder_explanation: cleanDisplayText(data.elder_explanation, ''),
      next_action: data.next_action || (data.next_steps || data.suggested_actions || ['添加到收支', '添加到理财记录', '问小享解释'])
    })
  },

  editRecognizedLedgerItem(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.lastFinanceParse && (this.data.lastFinanceParse.ledgerCards || [])[index]
    if (!item) return
    wx.showActionSheet({
      itemList: ['修改名称', '修改金额', '修改分类', '切换收入/支出'],
      success: res => {
        if (res.tapIndex === 3) {
          this.setData({ [`lastFinanceParse.ledgerCards[${index}].type`]: item.type === '收入' ? '支出' : '收入' })
          return
        }
        const keys = ['title', 'amount', 'category']
        const labels = ['名称', '金额', '分类']
        const key = keys[res.tapIndex]
        wx.showModal({
          title: `修改${labels[res.tapIndex]}`,
          editable: true,
          placeholderText: String(item[key] || ''),
          success: inputRes => {
            if (!inputRes.confirm) return
            const value = cleanDisplayText(inputRes.content, '')
            if (!value) return wx.showToast({ title: '内容不能为空', icon: 'none' })
            if (key === 'amount') {
              const amount = Number(value.replace(/[,，￥¥元\s]/g, ''))
              if (!(amount > 0)) return wx.showToast({ title: '请输入正确金额', icon: 'none' })
              this.setData({
                [`lastFinanceParse.ledgerCards[${index}].amount`]: amount,
                [`lastFinanceParse.ledgerCards[${index}].amountText`]: amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
              })
              return
            }
            this.setData({ [`lastFinanceParse.ledgerCards[${index}].${key}`]: value })
            if (key === 'title') this.setData({ [`lastFinanceParse.ledgerCards[${index}].titleSegments`]: termHelper.buildTermSegments(value) })
            if (key === 'category') this.setData({ [`lastFinanceParse.ledgerCards[${index}].categorySegments`]: termHelper.buildTermSegments(value) })
          }
        })
      }
    })
  },

  deleteRecognizedLedgerItem(e) {
    const index = Number(e.currentTarget.dataset.index)
    const ledgerCards = (this.data.lastFinanceParse && this.data.lastFinanceParse.ledgerCards || []).filter((item, itemIndex) => itemIndex !== index)
    this.setData({ 'lastFinanceParse.ledgerCards': ledgerCards })
  },

  saveRecognizedLedgerItem(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.lastFinanceParse && (this.data.lastFinanceParse.ledgerCards || [])[index]
    if (!item || item.saved) return
    app.request({
      url: '/ledger/records',
      method: 'POST',
      data: {
        type: item.type,
        title: item.title,
        amount: item.amount,
        date: item.date || undefined,
        category: item.category,
        description: item.sourceText,
        source: 'money_image_confirmed'
      },
      loading: true
    }).then(() => {
      this.setData({ [`lastFinanceParse.ledgerCards[${index}].saved`]: true })
      wx.showToast({ title: '已加入收支记录', icon: 'success' })
      this.load()
    })
  },

  toggleFinanceProduct(e) {
    const index = Number(e.currentTarget.dataset.index)
    const products = (this.data.lastFinanceParse && this.data.lastFinanceParse.products || []).slice()
    if (!products[index]) return
    products[index] = Object.assign({}, products[index], { expanded: !products[index].expanded })
    this.setData({ 'lastFinanceParse.products': products })
  },

  editRecognizedField(e) {
    const productIndex = Number(e.currentTarget.dataset.productIndex)
    const fieldIndex = Number(e.currentTarget.dataset.fieldIndex)
    const products = (this.data.lastFinanceParse && this.data.lastFinanceParse.products || []).slice()
    const card = products[productIndex]
    const field = card && card.fields && card.fields[fieldIndex]
    if (!field) return
    wx.showModal({
      title: `修改${field.label}`,
      editable: true,
      placeholderText: field.value,
      success: res => {
        if (!res.confirm) return
        const value = cleanDisplayText(res.content, '')
        if (!value) return wx.showToast({ title: '内容不能为空', icon: 'none' })
        const fields = card.fields.slice()
        fields[fieldIndex] = Object.assign({}, field, {
          value,
          valueSegments: termHelper.buildTermSegments(value)
        })
        const raw = Object.assign({}, card.raw, { [field.sourceKey]: value })
        const title = field.sourceKey === 'name' || field.sourceKey === 'product_name' ? value : card.title
        products[productIndex] = Object.assign({}, card, { fields, raw, title })
        this.setData({ 'lastFinanceParse.products': products })
      }
    })
  },

  editRecognizedProduct(e) {
    const productIndex = Number(e.currentTarget.dataset.index)
    const card = this.data.lastFinanceParse && (this.data.lastFinanceParse.products || [])[productIndex]
    if (!card || !card.fields || !card.fields.length) return
    wx.showActionSheet({
      itemList: card.fields.slice(0, 6).map(item => `修改${item.label}`),
      success: res => this.editRecognizedField({ currentTarget: { dataset: { productIndex, fieldIndex: Number(res.tapIndex) } } })
    })
  },

  deleteRecognizedProduct(e) {
    const productIndex = Number(e.currentTarget.dataset.index)
    const card = this.data.lastFinanceParse && (this.data.lastFinanceParse.products || [])[productIndex]
    if (!card) return
    wx.showModal({
      title: '删除识别结果',
      content: `确定删除“${card.title}”这项识别结果吗？`,
      confirmText: '删除',
      confirmColor: '#c75d3a',
      success: res => {
        if (!res.confirm) return
        const products = (this.data.lastFinanceParse.products || []).filter((item, index) => index !== productIndex)
        this.setData({
          'lastFinanceParse.products': products,
          financeParseAskOpen: false,
          financeParseAskMessages: [],
          financeParseAskProductIndex: -1
        })
      }
    })
  },

  markFinanceProductState(index, key) {
    const products = (this.data.lastFinanceParse && this.data.lastFinanceParse.products || []).slice()
    if (!products[index]) return
    products[index] = Object.assign({}, products[index], { [key]: true })
    this.setData({ 'lastFinanceParse.products': products })
  },

  editPositionRecord() {
    const item = this.data.selectedPosition
    if (!item) return
    wx.showModal({
      title: '修改理财记录名称',
      editable: true,
      placeholderText: item.product_name,
      success: nameRes => {
        if (!nameRes.confirm) return
        const productName = String(nameRes.content || item.product_name || '').trim()
        if (!productName) return wx.showToast({ title: '名称不能为空', icon: 'none' })
        wx.showModal({
          title: '修改记录金额',
          editable: true,
          placeholderText: String(item.amount || 0),
          success: amountRes => {
            if (!amountRes.confirm) return
            const amount = Number(String(amountRes.content || item.amount || 0).replace(/,/g, '')) || 0
            app.request({
              url: `/wealth/positions/${item.id}`,
              method: 'PUT',
              data: { product_name: productName, buy_amount: amount },
              loading: true
            }).then(() => {
              this.closePositionDetail()
              this.load()
              wx.showToast({ title: '已修改', icon: 'success' })
            })
          }
        })
      }
    })
  },

  deletePositionRecord() {
    const item = this.data.selectedPosition
    if (!item) return
    wx.showModal({
      title: '删除理财记录',
      content: `确定删除“${item.product_name}”吗？`,
      confirmText: '删除',
      confirmColor: '#c44b32',
      success: res => {
        if (!res.confirm) return
        app.request({ url: `/wealth/positions/${item.id}`, method: 'DELETE', loading: true }).then(() => {
          this.closePositionDetail()
          this.load()
          wx.showToast({ title: '已删除', icon: 'success' })
        })
      }
    })
  },

  saveFinanceParseRecord(e) {
    const data = this.data.lastFinanceParse
    if (!data) return
    const index = Number(e && e.currentTarget && e.currentTarget.dataset.index || 0)
    const card = (data.products || [])[index]
    if (!card) return wx.showToast({ title: '没有可保存的理财信息', icon: 'none' })
    this.speak('正在保存理财记录')
    app.request({
      url: '/finance/track-from-analysis',
      method: 'POST',
      data: Object.assign({}, data, {
        product: card.raw,
        product_name: card.raw.name || card.raw.product_name || card.title,
        record_amount: card.raw.amount || card.raw.buy_amount || 0,
        recognized_fields: card.fields.map(item => ({ label: item.label, value: item.value }))
      }),
      loading: true
    }).then(() => {
      this.markFinanceProductState(index, 'savedFinance')
      this.setData({ moneyMode: 'finance' })
      wx.showToast({ title: '已添加理财记录', icon: 'success' })
      this.load()
    }).catch(() => {
      wx.showToast({ title: '暂时没有保存成功，请稍后再试', icon: 'none' })
    })
  },

  saveFinanceParseToLedger(e) {
    const data = this.data.lastFinanceParse
    if (!data) return
    const index = Number(e && e.currentTarget && e.currentTarget.dataset.index || 0)
    const card = (data.products || [])[index]
    if (!card) return wx.showToast({ title: '没有可添加的记录', icon: 'none' })
    const transaction = (data.transactions || [])[index] || (data.transactions || [])[0] || {}
    wx.showActionSheet({
      itemList: ['记为支出/买入', '记为收入/收益或赎回'],
      success: directionRes => {
        const type = directionRes.tapIndex === 1 ? '收入' : '支出'
        wx.showModal({
          title: '填写实际收支金额',
          content: '只填写实际发生的金额，不要把起购金额或总资产当成本次收支。',
          editable: true,
          placeholderText: transaction.amount ? String(transaction.amount) : (card.raw.amount ? String(card.raw.amount) : '例如：2000'),
          confirmText: '添加',
          success: amountRes => {
            if (!amountRes.confirm) return
            const amount = Number(String(amountRes.content || '').replace(/[,，￥¥元\s]/g, ''))
            if (!(amount > 0)) return wx.showToast({ title: '请输入正确金额', icon: 'none' })
            const title = cleanDisplayText(transaction.title || card.raw.name || card.raw.product_name || card.title, '')
            if (!title) return wx.showToast({ title: '请先识别或输入名称', icon: 'none' })
            app.request({
              url: '/ledger/records',
              method: 'POST',
              data: {
                type,
                title,
                amount,
                category: type === '收入' ? '理财收益' : '理财买入',
                description: data.extracted_text || data.image_summary || '',
                source: 'finance_image_confirmed'
              },
              loading: true
            }).then(() => {
              this.markFinanceProductState(index, 'savedLedger')
              wx.showToast({ title: '已添加到收支', icon: 'success' })
              this.load()
            })
          }
        })
      }
    })
  },

  askFinanceParse() {
    const data = this.data.lastFinanceParse
    if (!data) return
    this.setData({
      financeParseAskOpen: true,
      financeParseAskInput: '',
      financeParseAskProductIndex: -1,
      financeParseAskMessages: [{ role: 'assistant', text: '我会留在这个识别结果里解释，不会跳走。您可以继续问收益、期限、赎回和风险。' }]
    })
    this.sendFinanceParseAsk(true)
  },

  askRecognizedProduct(e) {
    const index = Number(e.currentTarget.dataset.index)
    const product = (this.data.lastFinanceParse && this.data.lastFinanceParse.products || [])[index]
    if (!product) return
    this.setData({
      financeParseAskOpen: true,
      financeParseAskInput: '',
      financeParseAskProductIndex: index,
      financeParseAskMessages: [{ role: 'assistant', text: `我会只结合“${product.title || '这条产品'}”已经识别出的信息来解释，没看清的地方不会猜。` }]
    })
    this.sendFinanceParseAsk(true)
  },

  closeFinanceParseAsk() {
    this.setData({ financeParseAskOpen: false, financeParseAskInput: '', financeParseAskLoading: false })
  },

  onFinanceParseAskInput(e) { this.setData({ financeParseAskInput: e.detail.value }) },

  sendFinanceParseAsk(initial = false) {
    const parsed = this.data.lastFinanceParse
    if (!parsed || this.data.financeParseAskLoading) return
    const isInitial = initial === true
    const question = isInitial
      ? '请只依据图片实际识别内容，用长辈能听懂的话说明这些产品，重点讲风险、收益是否承诺、期限和赎回。缺失内容要明确说未识别，不要猜。'
      : String(this.data.financeParseAskInput || '').trim()
    if (!question) return
    const visibleMessages = isInitial
      ? this.data.financeParseAskMessages
      : this.data.financeParseAskMessages.concat([{ role: 'user', text: question }])
    this.setData({ financeParseAskMessages: visibleMessages, financeParseAskInput: '', financeParseAskLoading: true })
    const sourceProducts = this.data.financeParseAskProductIndex >= 0
      ? [(parsed.products || [])[this.data.financeParseAskProductIndex]].filter(Boolean)
      : (parsed.products || [])
    const products = sourceProducts.map(item => ({
      title: item.title,
      fields: (item.fields || []).reduce((acc, field) => { acc[field.label] = field.value; return acc }, {})
    }))
    app.request({
      url: '/assistant/chat', method: 'POST', loading: false,
      data: {
        message: `${question}\n图片识别结果：${JSON.stringify(products)}`,
        mode: 'finance_image_explain',
        history: visibleMessages.slice(-8).map(item => ({ role: item.role, text: item.text }))
      }
    }).then(res => {
      const reply = cleanAssistantText(res.reply || res.answer || res.content)
      this.setData({ financeParseAskMessages: this.data.financeParseAskMessages.concat([{ role: 'assistant', text: reply }]) })
    }).catch(() => {
      this.setData({ financeParseAskMessages: this.data.financeParseAskMessages.concat([{ role: 'assistant', text: '目前只能确认页面上已经列出的字段。没有识别到的内容请以银行官方说明书为准，不要只看收益数字。' }]) })
    }).finally(() => this.setData({ financeParseAskLoading: false }))
  },

  closeFinanceParsePanel() {
    this.setData({
      showFinanceParsePanel: false,
      lastFinanceParse: null,
      financeParseAskOpen: false,
      financeParseAskInput: '',
      financeParseAskMessages: [],
      financeParseAskLoading: false,
      financeParseAskProductIndex: -1
    })
  },

  showParsedImport(parsed) {
    const normalized = this.normalizeParsedPayload(parsed || {})
    const items = normalized.items || []
    if (!items.length) {
      wx.showModal({
        title: normalized.irrelevant ? '这张图不能入账' : '未识别到账单',
        content: normalized.hint || normalized.message || '没有识别到金额、商户或理财产品，请换一张更清晰的账单截图。',
        showCancel: false
      })
      return
    }
    this.setData({
      lastParse: normalized,
      showParsePanel: true
    })
    app.readText(normalized.message || `识别到${items.length}条记录，请确认后导入。`)
  },

  normalizeParsedPayload(parsed) {
    const rawItems = (parsed.items && parsed.items.length)
      ? parsed.items
      : [].concat(parsed.daily_items || [], parsed.finance_items || [])
    const items = rawItems
      .map((item, index) => this.normalizeParsedItem(item, index))
      .filter(item => item.amount > 0 && this.isMeaningfulParsedItem(item))
    const dailyItems = (parsed.daily_items && parsed.daily_items.length ? parsed.daily_items : items.filter(item => item.record_kind !== 'finance'))
      .map((item, index) => this.normalizeParsedItem(item, index))
      .filter(item => item.amount > 0 && this.isMeaningfulParsedItem(item))
    const financeItems = (parsed.finance_items && parsed.finance_items.length ? parsed.finance_items : items.filter(item => item.record_kind === 'finance'))
      .map((item, index) => this.normalizeParsedItem(item, index))
      .filter(item => item.amount > 0 && this.isMeaningfulParsedItem(item))
    const summary = Object.assign({
      daily_count: dailyItems.length,
      finance_count: financeItems.length,
      daily_income: 0,
      daily_expense: 0,
      finance_income: 0,
      finance_expense: 0
    }, parsed.summary || {})
    summary.daily_count = dailyItems.length
    summary.finance_count = financeItems.length
    return Object.assign({}, parsed, {
      items,
      daily_items: dailyItems,
      finance_items: financeItems,
      summary,
      message: parsed.message || `识别到 ${dailyItems.length} 条日常收支、${financeItems.length} 条理财记录。请确认后写入账本。`
    })
  },

  isMeaningfulParsedItem(item) {
    const title = String(item.title || '')
    const category = String(item.category || '')
    const source = String(item.source_text || '')
    const detail = String(item.detail || '')
    const text = `${title} ${category} ${source} ${detail}`
    const hasHumanText = /[\u4e00-\u9fa5]/.test(text.replace(/金额|分类|类别|支出|收入|记录|其他/g, ''))
    const technicalOnly = /\b(amount|money|items?|record_kind|category|type)\b\s*[:：]/i.test(text) && !hasHumanText
    const genericOnly = /^(其他支出|其他收入|记录\d+)?$/.test(title) && /^其他支出|其他收入|日常$/.test(category || '日常') && !source
    return !technicalOnly && !genericOnly
  },

  normalizeParsedItem(item, index) {
    const text = String(item.source_text || item.raw_text || item.description || item.title || '')
    let rawTitle = String(item.title || item.name || item.merchant || item.payee || item.product_name || '').trim()
    const looseTitle = this.extractLooseField(text || rawTitle, ['title', '标题', '用途', '项目', '商品', '商户', 'name'])
    if (/items?\s*[:：]|amount\s*[:：]|category\s*[:：]|record_kind\s*[:：]/i.test(rawTitle) && looseTitle) {
      rawTitle = looseTitle
    }
    const cleanedTitle = rawTitle
      .replace(/["'“”‘’{}【】\[\]]/g, '')
      .replace(/(金额|实付|合计|总计|支付金额|付款金额|收款金额)\s*[：:]/g, '')
      .replace(/\b(items?|amount|type|category|record_kind|money|date|time)\s*[:：]/ig, '')
      .replace(/[+-]?\d+(?:\.\d+)?\s*(万|元|块)?/g, '')
      .replace(/[,，;；]+$/g, '')
      .trim()
    const looseCategory = this.extractLooseField(text, ['category', '分类', '类别'])
    const category = item.category || looseCategory || this.inferLocalCategory(text || rawTitle, item.type || '支出')
    const title = cleanedTitle && !/^金额|元$/.test(cleanedTitle)
      ? cleanedTitle
      : (this.cleanLocalTitle(text, category) || category || `记录${index + 1}`)
    const amount = Number(String(item.amount || item.money || item['金额'] || 0).replace(/,/g, '')) || 0
    const kind = item.record_kind || (/理财|基金|国债|存款|收益|赎回|净值|年化|R[1-5]/.test(text + rawTitle + category) ? 'finance' : 'daily')
    const sourceText = item.source_text || text || title
    const cleanSourceText = /\b(amount|money|items?|record_kind|category)\b\s*[:：]/i.test(sourceText) && !/[\u4e00-\u9fa5]/.test(sourceText.replace(/金额|分类|类别/g, ''))
      ? ''
      : sourceText
    return Object.assign({}, item, {
      title,
      amount: Math.abs(amount),
      type: item.type === '收入' ? '收入' : '支出',
      category,
      category_name: category,
      detail: item.detail || `${item.type === '收入' ? '收入' : '消费'}明细：${title}，类别为${category}，金额${Math.abs(amount)}元。`,
      detail_items: item.detail_items || [title],
      record_kind: kind,
      source_text: cleanSourceText
    })
  },

  cleanLocalTitle(text, category) {
    return String(text || '')
      .replace(/\bitems?\s*[:：]\s*/ig, '')
      .replace(/\btitle\s*[:：]\s*/ig, '')
      .replace(/(金额|实付|合计|总计|支付金额|付款金额|收款金额)\s*[：:]/g, '')
      .replace(/\b(amount|money|type|category|record_kind|date|time)\s*[:：][^,，;；]*/ig, '')
      .replace(/[+-]?\d+(?:\.\d+)?\s*(万|元|块)?/g, '')
      .replace(/[，,。.！!？?、：:\s]/g, '')
      .trim() || category
  },

  extractLooseField(text, keys) {
    const raw = String(text || '')
    const keyPattern = keys.join('|')
    const stop = 'items?|title|标题|用途|项目|商品|商户|name|amount|money|金额|type|收支|direction|category|分类|类别|record_kind|kind|date|time'
    const reg = new RegExp('(?:^|[,，;；\\n\\s])(?:' + keyPattern + ')\\s*[:：]\\s*(.*?)(?=(?:[,，;；\\n\\s]+(?:' + stop + ')\\s*[:：])|$)', 'i')
    const match = raw.match(reg)
    return match ? match[1].replace(/[,，;；。]+$/g, '').trim() : ''
  },

  inferLocalCategory(text, typeText) {
    if (typeText === '收入') {
      if (/养老金|退休金/.test(text)) return '养老金'
      if (/工资/.test(text)) return '工资'
      if (/补贴|津贴/.test(text)) return '补贴'
      if (/收益|利息|分红/.test(text)) return '理财收益'
      return '其他收入'
    }
    if (/苹果|香蕉|橙子|梨|葡萄|西瓜|草莓|桃子|水果/.test(text)) return '水果生鲜'
    if (/买菜|菜市场|蔬菜|青菜|白菜|土豆|番茄|肉|鱼|生鲜/.test(text)) return '蔬菜生鲜'
    if (/餐饮|吃饭|外卖|早餐|午餐|晚餐/.test(text)) return '餐饮'
    if (/超市|购物|日用品|淘宝|京东|衣服|鞋/.test(text)) return '购物'
    if (/医院|药|医疗|门诊|挂号/.test(text)) return '医疗'
    if (/公交|地铁|打车|交通|加油|停车/.test(text)) return '交通'
    if (/水费|电费|燃气|煤气|物业|话费|网费/.test(text)) return '水电煤'
    if (/理财|基金|国债|存款|申购|买入/.test(text)) return '理财买入'
    return '其他支出'
  },

  confirmParsedImport() {
    if(this._importSubmitting)return
    const parsed = this.data.lastParse
    if (!parsed) return
    this._importSubmitting=true
    app.request({
      url: '/ledger/import/confirm',
      method: 'POST',
      data: {
        import_id: parsed.import_id,
        items: parsed.items,
        source: parsed.source || 'miniapp_confirm'
      },
      loading: true
    }).then(res => {
      this.setData({ showParsePanel: false, lastParse: null })
      this.speak(res.already_imported?'这批记录已经导入':('已导入'+(res.imported_count||0)+'条记录'))
      wx.showToast({ title: `已导入${res.imported_count || 0}条`, icon: 'success' })
      this.load()
    }).catch(() => {
      wx.showToast({ title: '暂时没有导入成功，请稍后再试', icon: 'none' })
    }).finally(()=>{this._importSubmitting=false})
  },

  cancelParsedImport() {
    this.speak('已取消导入')
    this.setData({ showParsePanel: false, lastParse: null })
  },

  manualTrackPosition() {
    wx.showModal({
      title: '添加理财持仓',
      editable: true,
      placeholderText: '如：三年期储蓄国债 20000',
      success: (res) => {
        if (!res.confirm || !res.content) return
        const parsed = this.parseSmartInput(res.content)
        app.request({
          url: '/wealth/search-and-track',
          method: 'POST',
          data: {
            product_name: parsed ? parsed.description : res.content,
            amount: parsed ? parsed.amount : 10000
          },
          loading: true
        }).then(() => {
          wx.showToast({ title: '已加入持仓', icon: 'success' })
          this.load()
        })
      }
    })
  },

  // 本地解析智能输入
  parseSmartInput(text) {
    const trimmed = text.trim()
    
    // 提取金额（支持数字和中文数字）
    const numMatch = trimmed.match(/(\d+(?:\.\d+)?)(万|元)?/)
    if (!numMatch) return null
    
    const amountValue = parseFloat(numMatch[1]) * (numMatch[2] === '万' ? 10000 : 1)
    const amount = String(amountValue)
    
    // 判断收入/支出
    let type = 'expense'
    if (/(收入|收到|工资|养老金|补贴|收益)/i.test(trimmed)) {
      type = 'income'
    }
    
    // 匹配分类
    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    let category = type === 'income' ? 'other_income' : 'other_expense'
    
    const inferredCategory = this.inferLocalCategory(trimmed, type === 'income' ? '收入' : '支出')
    const inferred = categories.find(cat => cat.name === inferredCategory)
    if (inferred) category = inferred.id
    for (const cat of categories) {
      if (text.includes(cat.name)) category = cat.id
    }
    
    // 提取描述
    const description = this.cleanLocalTitle(trimmed, inferredCategory)
    
    return { type, amount, category, description }
  },

  // ========== 持仓刷新 ==========
  refreshPosition(e) {
    const id = e.currentTarget.dataset.id
    this.speak('正在刷新持仓信息')
    app.request({
      url: '/wealth/positions/' + id + '/refresh',
      method: 'POST',
      loading: true
    }).then(res => {
      const item = res.item || {}
      wx.showModal({
        title: item.profit_status || '已刷新',
        content: item.refresh_note || '已更新持仓信息',
        showCancel: false
      })
      this.load()
    })
  },

  // ========== 语音播报 ==========
  // 通用语音播报
  speak(text) {
    app.readText(text)
  },

  // 点击收支总览播报详细汇总
  speakTotals() {
    const t = this.data.ledgerTotals
    if (!t) return
    const ov = t.overall
    const dy = t.daily
    const fi = t.finance
    app.readText(
      `收支总览。总体：收入${ov.income_text}元，支出${ov.expense_text}元，结余${ov.balance_text}元。` +
      `日常：收入${dy.income_text}元，支出${dy.expense_text}元，结余${dy.balance_text}元。` +
      `理财：收益赎回${fi.income_text}元，买入支出${fi.expense_text}元，净变化${fi.balance_text}元。`
    )
  },

  readPage() {
    const summary = this.data.summary
    app.readText(`管钱钱页面。本月收入${summary.income_text || 0}元，本月支出${summary.expense_text || 0}元，本月可结余${summary.balance_text || 0}元。您可以点击记一笔添加收入或支出，也可以用智能记账记录理财信息。`)
  },

  // ========== 导航 ==========
  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  back() {
    this.goBack()
  },

  // ---- 语音输入：一键语音记账 ----
  onVoiceInputResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    // 复用已有的智能记账逻辑（内部已含loading和toast提示）
    this.doSmartInput('voice', text)
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})
