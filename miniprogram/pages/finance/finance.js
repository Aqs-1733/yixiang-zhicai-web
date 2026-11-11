const termHelper = require('../../utils/termExplain.js')

function riskAnswersKey() {
  const user = wx.getStorageSync('user') || {}
  return `risk_answers_${user.id || user.user_id || user.phone || 'current'}`
}
const api = require('../../utils/api.js')

// 正规理财渠道数据
const FINANCE_CHANNELS = [
  {
    id: 'icbc',
    name: '中国工商银行',
    shortName: '工商银行',
    icon: '🏦',
    desc: '存款、国债、理财、保险',
    category: 'bank',
    riskLevel: 'R1-R3',
    url: 'https://m.icbc.com.cn',
    miniAppId: '',  // 工商银行小程序
    features: ['存款产品丰富', '国债发行网点', '老年优先服务'],
    tips: '建议到附近网点咨询，工作人员会帮您操作'
  },
  {
    id: 'abc',
    name: '中国农业银行',
    shortName: '农业银行',
    icon: '🌾',
    desc: '惠农理财、乡村振兴存款',
    category: 'bank',
    riskLevel: 'R1-R2',
    url: 'https://e.abchina.com',
    miniAppId: '',
    features: ['农村金融专家', '惠农理财产品', '国债销售网点多'],
    tips: '适合农村地区的长辈就近办理'
  },
  {
    id: 'ccb',
    name: '中国建设银行',
    shortName: '建设银行',
    icon: '🏗️',
    desc: '乾元理财、大额存单',
    category: 'bank',
    riskLevel: 'R1-R3',
    url: 'https://m.ccb.com',
    miniAppId: '',
    features: ['理财品种齐全', '网上银行便捷', '国债销售主力'],
    tips: '有网上银行可以直接在家操作'
  },
  {
    id: 'cmb',
    name: '招商银行',
    shortName: '招商银行',
    icon: '⛵',
    desc: '朝朝盈、稳健理财',
    category: 'bank',
    riskLevel: 'R1-R2',
    url: 'https://mobile.cmbchina.com',
    miniAppId: '',
    features: ['界面友好', '灵活存取', '适合退休人员'],
    tips: '天天理财功能，随时可用，不耽误花'
  },
  {
    id: 'alipay',
    name: '支付宝',
    shortName: '支付宝理财',
    icon: '💙',
    desc: '余额宝、稳健理财、基金',
    category: 'internet',
    riskLevel: 'R1-R5',
    url: 'https://render.alipay.com/p/s/finance/index',
    miniAppId: 'wxd45e3b85013e81a3',
    features: ['操作方便', '产品多样', '收益透明'],
    tips: '需要先学会用手机支付，建议让子女帮忙设置'
  },
  {
    id: 'tenpay',
    name: '微信理财通',
    shortName: '理财通',
    icon: '💚',
    desc: '稳健理财、基金、保险',
    category: 'internet',
    riskLevel: 'R1-R3',
    url: 'https://ft.qq.com',
    miniAppId: '',
    features: ['微信里直接用', '资金进出方便', '安全有保障'],
    tips: '和微信一起用，不用单独下载软件'
  },
  {
    id: 'tiantian',
    name: '天天基金',
    shortName: '天天基金',
    icon: '📈',
    desc: '基金销售、基金筛选工具',
    category: 'internet',
    riskLevel: 'R2-R5',
    url: 'https://fund.eastmoney.com',
    miniAppId: '',
    features: ['基金数据全面', '筛选功能强', '适合学习基金知识'],
    tips: '基金有风险，投资需谨慎，建议先学习再操作'
  },
  {
    id: 'chinawealth',
    name: '中国理财网',
    shortName: '理财信息登记',
    icon: '📋',
    desc: '银行理财产品信息登记查询',
    category: 'official',
    riskLevel: '官方信息',
    url: 'https://www.chinawealth.com.cn',
    miniAppId: '',
    features: ['官方权威信息', '产品登记查询', '核验正规渠道'],
    tips: '买理财前先来这里查查，看是不是正规产品'
  }
]

function buildLearnModules() {
  const modules = [
    {
      title: '买前三步核验',
      items: ['先看发行机构和官方渠道', '再看风险等级和产品说明书', '最后确认登记编码和到账方式']
    },
    {
      title: '养老钱分层',
      items: ['生活备用金要随时能用', '医疗备用金不要买封闭期长的产品', '长期不用的钱再考虑期限匹配']
    },
    {
      title: '收益话术提醒',
      items: ['业绩比较基准不是承诺收益', '七日年化会变化', '保本高收益和私人二维码要警惕']
    }
  ]
  return modules.map(item => ({
    ...item,
    titleSegments: termHelper.buildTermSegments(item.title),
    itemSegments: item.items.map(text => ({ text, segments: termHelper.buildTermSegments(text) }))
  }))
}

function cleanDisplayText(value, fallback = '') {
  if (Array.isArray(value)) {
    value = value.filter(Boolean).map(item => cleanDisplayText(item, '')).filter(Boolean).join('、')
  }
  if (value && typeof value === 'object') {
    value = value.name || value.title || value.label || value.value || ''
  }
  let text = String(value == null ? '' : value).trim()
  if (/["']score["']\s*:/.test(text) && /["']text["']\s*:/.test(text)) {
    const tokens = []
    text.replace(/["']text["']\s*:\s*["']([^"']+)["']/g, (all, token) => {
      if (token && !tokens.includes(token.trim())) tokens.push(token.trim())
      return all
    })
    if (tokens.length) text = tokens.join('、')
  }
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

Page({
  data: {
    advice: {},
    ratioList: [],
    products: [],
    articles: [],
    dataSource: '',
    realTime: false,
    financeMode: 'recognize',
    learnTab: 'modules',
    learnModules: buildLearnModules(),
    disclaimer: '这里只做理财知识学习和正规渠道核验，不提供购买入口。',
    adviceTextSegments: [],
    disclaimerSegments: [],
    globalFontPageClass: 'font-global-normal',
    productText: '',
    analysis: null,
    trackedPositions: [],
    selectedPosition: null,
    showPositionDetail: false,
    positionAskOpen: false,
    positionAskInput: '',
    positionAskMessages: [],
    positionAskLoading: false,
    analysisAskOpen: false,
    analysisAskInput: '',
    analysisAskMessages: [],
    analysisAskLoading: false,
    analysisAskProductIndex: -1,
    termExplainPopups: [],
    termChips: ['业绩比较基准', '七日年化', '净值', '风险等级', '流动性', '登记编码', '官方渠道'],
    
    // 正规理财渠道
    channels: FINANCE_CHANNELS,
    channelCategories: [
      { key: 'bank', label: '银行渠道', icon: '🏦' },
      { key: 'internet', label: '互联网平台', icon: '💻' },
      { key: 'official', label: '官方信息', icon: '📋' }
    ],
    selectedChannel: null,
    showChannelDetail: false,
    selectedCategory: 'all',
    
    // 产品核验功能
    verifyTab: 'channels',  // channels 或 verify
    verifyInput: '',        // 核验输入的编码
    showProductVerification: false,
    verifyResult: null,     // 核验结果
    verifyLoading: false,   // 加载状态
    verifyHistory: [],      // 核验历史（本地存储）
    exampleCodes: []        // 示例编码
  },

  onProductText(e) {
    this.setData({ productText: e.detail.value })
  },

  switchFinanceMode(e) {
    this.setData({ financeMode: e.currentTarget.dataset.mode || 'recognize' })
  },

  switchLearnTab(e) {
    this.setData({ learnTab: e.currentTarget.dataset.tab || 'modules' })
  },

  parseProductText() {
    if (!this.data.productText) return wx.showToast({ title: '请先输入产品文字', icon: 'none' })
    getApp().request({
      url: '/finance/parse-input',
      method: 'POST',
      data: { text: this.data.productText, source: 'text' },
      loading: true
    }).then(res => {
      const analysis = this.normalizeAnalysis(res)
      this.setData({ analysis })
      this.refreshTermChips(this.data.productText + ' ' + JSON.stringify(analysis))
      wx.showToast({ title: '已识别', icon: 'success' })
    })
  },

  chooseProductImage() {
    const upload = (filePath) => this.uploadProductImage(filePath)
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = (res.tempFiles || [])[0]
          if (file && file.tempFilePath) upload(file.tempFilePath)
        }
      })
      return
    }
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = (res.tempFilePaths || [])[0]
        if (filePath) upload(filePath)
      }
    })
  },

  uploadProductImage(filePath) {
    const baseUrl = (getApp().globalData && getApp().globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    wx.showLoading({ title: '分析截图中…', mask: true })
    wx.uploadFile({
      url: baseUrl + '/finance/parse-image',
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (uploadRes) => {
        wx.hideLoading()
        try {
          const data = JSON.parse(uploadRes.data || '{}')
          if (!data.ok) {
            this.setData({ analysis: null, productText: '' })
            wx.showModal({
              title: '没有识别清楚',
              content: data.message || '请换一张文字更清晰、内容更完整的截图，或使用文字识别。',
              showCancel: false
            })
            return
          }
          const analysis = this.normalizeAnalysis(data)
          this.setData({ analysis, productText: '小享正在整理图片里的收支和理财信息…' })
          this.explainImageRecognition(analysis)
          this.refreshTermChips((data.extracted_text || '') + ' ' + JSON.stringify(analysis))
          wx.showToast({ title: '已分析截图', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: '截图分析结果异常', icon: 'none' })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '图片上传失败', icon: 'none' })
      }
    })
  },

  explainImageRecognition(analysis) {
    if (!analysis) return
    const ledgerText = (analysis.ledgerCards || []).map(item => `${item.title}，${item.type}${item.amountText}元，分类${item.category}`).join('；')
    const productText = (analysis.productCards || []).map(item => `${item.title}：${item.fields.map(field => `${field.label}${field.value}`).join('，')}`).join('；')
    const rawText = cleanDisplayText(analysis.extracted_text, '').slice(0, 1400)
    const context = [ledgerText, productText].filter(Boolean).join('；') || rawText
    getApp().request({
      url: '/assistant/chat',
      method: 'POST',
      data: {
        session_id: `finance-image-${Date.now()}`,
        message: `请整理下面图片识别结果。先说明识别到几笔日常收支、几笔理财收支或几个产品，再用简短白话概括重点。不要罗列OCR碎片、时间数字或字段序号；看不清的地方明确说看不清，不要编造。\n识别结果：${context}`,
        mode: 'finance_recognition_summary',
        profile: Object.assign({}, wx.getStorageSync('profile') || {}, wx.getStorageSync('user') || {}),
        history: []
      },
      loading: false
    }).then(res => {
      const explanationText = cleanDisplayText(res.reply || res.answer, analysis.elder_explanation || analysis.message || '图片内容已整理，请核对下方明细。')
      this.setData({ productText: explanationText, 'analysis.explanationText': explanationText })
    }).catch(() => {
      const explanationText = cleanDisplayText(analysis.elder_explanation || analysis.message, '图片内容已整理，请核对下方明细。')
      this.setData({ productText: explanationText, 'analysis.explanationText': explanationText })
    })
  },

  trackAnalysis(e) {
    if (!this.data.analysis) return
    const index = Number(e && e.currentTarget && e.currentTarget.dataset.index || 0)
    const card = (this.data.analysis.productCards || [])[index]
    const payload = card ? Object.assign({}, this.data.analysis, {
      product: card.raw,
      product_name: card.raw.name || card.raw.product_name || card.title,
      record_amount: card.raw.amount || card.raw.buy_amount || 0,
      recognized_fields: card.fields.map(item => ({ label: item.label, value: item.value }))
    }) : this.data.analysis
    getApp().request({
      url: '/finance/track-from-analysis',
      method: 'POST',
      data: payload,
      loading: true
    }).then(() => {
      if (card) this.setData({ [`analysis.productCards[${index}].savedFinance`]: true })
      this.loadTrackedPositions()
      wx.showToast({ title: '已添加理财记录', icon: 'success' })
    })
  },

  saveAnalysisToLedger(e) {
    const analysis = this.data.analysis
    if (!analysis) return
    const index = Number(e && e.currentTarget && e.currentTarget.dataset.index || 0)
    const card = (analysis.productCards || [])[index]
    const selectedProduct = card ? card.raw : (analysis.product || {})
    const transaction = (analysis.transactions || [])[index] || (analysis.transactions || [])[0] || {}
    wx.showActionSheet({
      itemList: ['记为支出/买入', '记为收入/收益或赎回'],
      success: directionRes => {
        const type = directionRes.tapIndex === 1 ? '收入' : '支出'
        wx.showModal({
          title: '填写实际收支金额',
          content: '请填写本次实际发生的金额。起购金额、总资产和持仓金额不会自动当成收支。',
          editable: true,
          placeholderText: transaction.amount ? String(transaction.amount) : (selectedProduct.amount ? String(selectedProduct.amount) : '例如：2000'),
          confirmText: '添加',
          success: amountRes => {
            if (!amountRes.confirm) return
            const amount = Number(String(amountRes.content || '').replace(/[,，￥¥元\s]/g, ''))
            if (!(amount > 0)) {
              wx.showToast({ title: '请输入正确金额', icon: 'none' })
              return
            }
            const product = selectedProduct
            const title = cleanDisplayText(transaction.title || product.name || analysis.image_summary, '')
            if (!title) {
              wx.showToast({ title: '请先识别或输入记录名称', icon: 'none' })
              return
            }
            getApp().request({
              url: '/ledger/records',
              method: 'POST',
              data: {
                type,
                title,
                amount,
                category: type === '收入' ? '理财收益' : '理财买入',
                description: analysis.extracted_text || analysis.image_summary || '',
                source: 'finance_image_confirmed'
              },
              loading: true
            }).then(() => {
              if (card) this.setData({ [`analysis.productCards[${index}].savedLedger`]: true })
              wx.showToast({ title: '已添加到收支', icon: 'success' })
            })
          }
        })
      }
    })
  },

  onShow() {
    this.syncGlobalFont()
    this.load()
  },

  syncGlobalFont() {
    const font = getApp().getGlobalFontSetting()
    this.setData({
      globalFontPageClass: font.pageClass
    })
  },

  load() {
    this.loadTrackedPositions()

    // 先从本地画像立即渲染理财建议，确保与问卷一致（不等后端）
    const localAdvice = this.buildLocalAdvice()
    this.setData({
      advice: {
        ...this.data.advice,
        level: localAdvice.level,
        recommendation: localAdvice.recommendation,
        focus: localAdvice.focus,
        ratio: localAdvice.ratio
      },
      ratioList: Object.keys(localAdvice.ratio || {}).map(key => ({ key, value: localAdvice.ratio[key] })),
      adviceTextSegments: termHelper.buildTermSegments(localAdvice.recommendation || '请先完成画像问卷或补充真实数据。')
    })

    // 获取当前画像，发送给后端以获取个性化推荐
    const profile = wx.getStorageSync('profile') || wx.getStorageSync('userProfile') || {}
    const riskAnswers = wx.getStorageSync(riskAnswersKey()) || {}
    getApp().request({
      url: '/finance/advice',
      method: 'POST',
      data: {
        profile: {
          age: profile.age,
          monthly_income: profile.monthly_income,
          monthly_expense: profile.monthly_expense,
          liquid_asset: profile.liquid_asset,
          fixed_asset: profile.fixed_asset,
          risk_preference: profile.risk_preference || riskAnswers.risk_preference,
          money_time: profile.money_time || riskAnswers.money_time,
          child_support: profile.child_support || riskAnswers.child_support
        }
      },
      loading: false
    }).then(res => {
      const products = res.intro_products || res.items || []
      wx.setStorageSync('finance_products', products)
      // 后端会结合已保存画像调用小享生成建议；本地规则只在接口失败时兜底。
      const freshLocal = this.buildLocalAdvice()
      const backendAdvice = res.advice || {}
      const advice = {
        ...freshLocal,
        ...backendAdvice,
        recommendation: backendAdvice.recommendation || freshLocal.recommendation,
        focus: (backendAdvice.focus || []).length ? backendAdvice.focus : freshLocal.focus,
        ratio: Object.keys(backendAdvice.ratio || {}).length ? backendAdvice.ratio : freshLocal.ratio
      }
      const disclaimer = (advice && advice.disclaimer) || this.data.disclaimer
      this.setData({
        advice,
        ratioList: Object.keys(advice.ratio || {}).map(key => ({ key, value: advice.ratio[key] })),
        products: this.decorateProducts(products),
        articles: res.articles || [],
        dataSource: res.data_source || '',
        realTime: !!res.real_time,
        disclaimer,
        adviceTextSegments: termHelper.buildTermSegments(advice.recommendation || '请先完成画像问卷或补充真实数据。'),
        disclaimerSegments: termHelper.buildTermSegments(disclaimer)
      })
    }).catch(() => {
      getApp().request({ url: '/products' }).then(res => this.setData({ products: this.decorateProducts(res.items || []) }))
    })
  },

  // 根据本地画像生成理财建议类型，确保与问卷结果一致
  buildLocalAdvice() {
    const profile = wx.getStorageSync('profile') || wx.getStorageSync('userProfile') || {}
    const riskAnswers = wx.getStorageSync(riskAnswersKey()) || {}
    const riskPreference = profile.risk_preference || riskAnswers.risk_preference || ''
    const age = Number(profile.age || 0)
    const income = Number(profile.monthly_income || 0)
    const expense = Number(profile.monthly_expense || 0)

    let level = '稳健学习型'
    let recommendation = ''
    let focus = []
    let ratio = {}

    if (!riskPreference) {
      return {
        level: '待完善画像',
        recommendation: '请先完成画像问卷或补充真实数据，再生成个性化学习建议。',
        focus: [],
        ratio: {}
      }
    }

    if (riskPreference === '保守' || riskPreference === '保守型') {
      level = '保守学习型'
      recommendation = '您的风险偏好偏保守，建议优先了解存款、国债等保本产品，远离高收益承诺。'
      focus = ['存款保险', '国债', '货币基金', '防诈骗']
      ratio = { '存款/国债': 70, '货币基金': 20, '其他低风险': 10 }
    } else if (riskPreference === '进取' || riskPreference === '进取型' || riskPreference === '积极') {
      level = '进取学习型'
      recommendation = '可在安全打底的基础上，了解债券基金和指数基金等进阶产品，注意控制比例。'
      focus = ['国债', '纯债基金', '混合基金', '指数基金']
      ratio = { '存款/国债': 40, '债券/混合基金': 35, '指数/其他': 25 }
    } else {
      level = '稳健学习型'
      recommendation = '建议以存款国债打底，少量了解银行稳健理财和纯债基金。'
      focus = ['国债', '大额存单', '纯债基金', '银行R1-R2理财']
      ratio = { '存款/国债': 50, '稳健理财': 30, '货币基金': 20 }
    }

    // 年龄调整
    if (age >= 65) {
      focus = focus.filter(f => !f.includes('指数') && !f.includes('混合'))
      if (!focus.includes('防诈骗')) focus.push('防诈骗')
      recommendation += '考虑到您的年龄，更建议关注安全和流动性。'
    }

    // 收支调整
    const balance = income - expense
    if (balance < 0 && income > 0) {
      recommendation += '当前收支有缺口，建议先控制支出，保证应急金充足。'
      if (!focus.includes('应急金管理')) focus.unshift('应急金管理')
    }

    return { level, recommendation, focus, ratio }
  },

  explain(e) {
    const item = e.currentTarget.dataset.item
    getApp().request({
      url: '/products/explain',
      method: 'POST',
      data: { product: item },
      loading: true
    }).then(res => {
      wx.showModal({
        title: item.name,
        content: res.explanation || item.desc,
        showCancel: false,
        confirmText: '我知道了'
      })
    })
  },

  normalizeAnalysis(data) {
    data = data || {}
    const rawProduct = (data && data.product) || {}
    const product = Object.assign({}, rawProduct)
    Object.keys(product).forEach(key => {
      product[key] = cleanDisplayText(product[key], '')
    })
    const riskFlags = ((data && data.risk_flags) || []).map(item => ({
      ...item,
      reason: cleanDisplayText(item.reason, ''),
      reasonSegments: termHelper.buildTermSegments(cleanDisplayText(item.reason, ''))
    }))
    const elderExplanation = cleanDisplayText((data && data.elder_explanation), '')
    const riskSummary = cleanDisplayText((data && data.risk_summary), '')
    const dynamicFields = (data.recognized_fields || []).map(item => ({
      label: cleanDisplayText(item.label, ''),
      value: cleanDisplayText(item.value, ''),
      section: cleanDisplayText(item.section, '')
    })).filter(item => item.label && item.value)
    const knownFields = [
      { label: '产品名称', value: product.name },
      { label: '发行机构', value: product.institution },
      { label: '产品类型', value: product.product_type },
      { label: '风险等级', value: product.risk_level },
      { label: '收益/业绩比较基准', value: product.yield_expression },
      { label: '期限', value: product.term },
      { label: '起购金额', value: product.min_buy || product.buy_amount },
      { label: '赎回规则', value: product.redemption_rule },
      { label: '登记编码', value: product.registration_code }
    ].filter(item => cleanDisplayText(item.value, ''))
    const seen = {}
    const fieldList = dynamicFields.concat(knownFields).filter(item => {
      const key = `${item.label}|${item.value}`
      if (seen[key]) return false
      seen[key] = true
      return true
    }).map(item => ({
      ...item,
      labelSegments: termHelper.buildTermSegments(item.label),
      value: cleanDisplayText(item.value, ''),
      valueSegments: termHelper.buildTermSegments(cleanDisplayText(item.value, ''))
    }))
    const labels = {
      name: '产品名称', product_name: '产品名称', institution: '发行机构', issuer: '发行机构',
      product_type: '产品类型', type: '产品类型', risk_level: '风险等级', amount: '持有金额',
      income: '相关收益', yield: '收益率', yield_expression: '收益/业绩比较基准', benchmark: '收益/业绩比较基准',
      term: '期限', min_buy: '起购金额', redemption_rule: '赎回规则', registration_code: '登记编码'
    }
    let rows = Array.isArray(data.products) ? data.products.slice() : []
    if (!rows.length && Array.isArray(data.holdings)) rows = data.holdings.slice()
    if (!rows.length && Object.keys(product).length) rows = [product]
    const productCards = rows.map((row, index) => {
      const raw = Object.assign({}, row || {})
      const fields = Object.keys(raw).filter(key => raw[key] !== '' && raw[key] !== null && raw[key] !== undefined && key !== 'source_section').map(key => {
        const label = labels[key] || key
        const value = cleanDisplayText(raw[key], '')
        return { key: `${index}_${key}`, sourceKey: key, label, value, labelSegments: termHelper.buildTermSegments(label), valueSegments: termHelper.buildTermSegments(value) }
      }).filter(item => item.value && !/^(识别文字|文字|text|field|字段)\s*\d+$/i.test(item.label))
      let title = cleanDisplayText(raw.name || raw.product_name || raw.title, '')
      if (/^(金额(?:\(元\)|（元）)?|日期|类型|产品名称|全部记录|相关收益)$/i.test(title)) title = ''
      const fallbackTitle = cleanDisplayText(raw.product_type || raw.institution, '')
      return {
        key: `product_${index}`,
        title: title || fallbackTitle,
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
      return {
        key: `ledger_${index}`,
        title,
        titleSegments: termHelper.buildTermSegments(title),
        category: cleanDisplayText(raw.category || raw.category_name, raw.record_kind === 'finance' ? '理财记录' : '其他收支'),
        categorySegments: termHelper.buildTermSegments(cleanDisplayText(raw.category || raw.category_name, '')),
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
    const displayTitle = cleanDisplayText(product.name || data.image_summary, '图片识别结果')
    return Object.assign({}, data || {}, {
      product,
      fieldList,
      productCards,
      ledgerCards,
      dailyLedgerCards: ledgerCards.filter(item => item.recordKind === 'daily'),
      financeLedgerCards: ledgerCards.filter(item => item.recordKind === 'finance'),
      productNameSegments: termHelper.buildTermSegments(displayTitle),
      productMetaSegments: termHelper.buildTermSegments(`${product.risk_level || ''} ${product.term || ''} ${product.yield_expression || ''} ${product.registration_code || ''}`),
      risk_flags: riskFlags,
      risk_summary: riskSummary,
      riskSummarySegments: termHelper.buildTermSegments(riskSummary),
      elder_explanation: elderExplanation,
      explanationText: elderExplanation || cleanDisplayText(data.message, '图片内容已整理，请核对下方明细。'),
      elderSegments: termHelper.buildTermSegments(elderExplanation)
    })
  },

  editAnalysisLedgerItem(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.analysis && (this.data.analysis.ledgerCards || [])[index]
    if (!item) return
    wx.showActionSheet({
      itemList: ['修改名称', '修改金额', '修改分类', '切换收入/支出'],
      success: res => {
        if (res.tapIndex === 3) {
          const type = item.type === '收入' ? '支出' : '收入'
          this.setData({ [`analysis.ledgerCards[${index}].type`]: type })
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
                [`analysis.ledgerCards[${index}].amount`]: amount,
                [`analysis.ledgerCards[${index}].amountText`]: amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
              })
              return
            }
            this.setData({ [`analysis.ledgerCards[${index}].${key}`]: value })
            if (key === 'title') this.setData({ [`analysis.ledgerCards[${index}].titleSegments`]: termHelper.buildTermSegments(value) })
            if (key === 'category') this.setData({ [`analysis.ledgerCards[${index}].categorySegments`]: termHelper.buildTermSegments(value) })
          }
        })
      }
    })
  },

  deleteAnalysisLedgerItem(e) {
    const index = Number(e.currentTarget.dataset.index)
    const cards = (this.data.analysis && this.data.analysis.ledgerCards || []).filter((item, itemIndex) => itemIndex !== index)
    this.setData({
      'analysis.ledgerCards': cards,
      'analysis.dailyLedgerCards': cards.filter(item => item.recordKind === 'daily'),
      'analysis.financeLedgerCards': cards.filter(item => item.recordKind === 'finance')
    })
  },

  saveAnalysisLedgerItem(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.analysis && (this.data.analysis.ledgerCards || [])[index]
    if (!item || item.saved) return
    getApp().request({
      url: '/ledger/records',
      method: 'POST',
      data: {
        type: item.type,
        title: item.title,
        amount: item.amount,
        date: item.date || undefined,
        category: item.category,
        description: item.sourceText,
        source: 'finance_image_confirmed'
      },
      loading: true
    }).then(() => {
      this.setData({ [`analysis.ledgerCards[${index}].saved`]: true })
      wx.showToast({ title: '已加入收支记录', icon: 'success' })
    })
  },

  toggleAnalysisProduct(e) {
    const index = Number(e.currentTarget.dataset.index)
    const current = this.data.analysis && this.data.analysis.productCards && this.data.analysis.productCards[index]
    if (!current) return
    this.setData({ [`analysis.productCards[${index}].expanded`]: !current.expanded })
  },

  editAnalysisField(e) {
    const productIndex = Number(e.currentTarget.dataset.productIndex)
    const fieldIndex = Number(e.currentTarget.dataset.fieldIndex)
    this.promptEditAnalysisField(productIndex, fieldIndex)
  },

  promptEditAnalysisField(productIndex, fieldIndex) {
    const card = this.data.analysis && this.data.analysis.productCards && this.data.analysis.productCards[productIndex]
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
        this.setData({
          [`analysis.productCards[${productIndex}].fields[${fieldIndex}].value`]: value,
          [`analysis.productCards[${productIndex}].fields[${fieldIndex}].valueSegments`]: termHelper.buildTermSegments(value),
          [`analysis.productCards[${productIndex}].raw.${field.sourceKey}`]: value
        })
        if (field.sourceKey === 'name' || field.sourceKey === 'product_name') {
          this.setData({ [`analysis.productCards[${productIndex}].title`]: value })
        }
      }
    })
  },

  editAnalysisProduct(e) {
    const productIndex = Number(e.currentTarget.dataset.index)
    const card = this.data.analysis && this.data.analysis.productCards && this.data.analysis.productCards[productIndex]
    if (!card || !card.fields.length) return
    wx.showActionSheet({
      itemList: card.fields.slice(0, 6).map(item => `修改${item.label}`),
      success: res => this.promptEditAnalysisField(productIndex, Number(res.tapIndex))
    })
  },

  deleteAnalysisProduct(e) {
    const productIndex = Number(e.currentTarget.dataset.index)
    const card = this.data.analysis && this.data.analysis.productCards && this.data.analysis.productCards[productIndex]
    if (!card) return
    wx.showModal({
      title: '删除识别结果',
      content: `确定删除“${card.title}”这项识别结果吗？`,
      confirmText: '删除',
      confirmColor: '#c75d3a',
      success: res => {
        if (!res.confirm) return
        const productCards = (this.data.analysis.productCards || []).filter((item, index) => index !== productIndex)
        if (!productCards.length) {
          this.setData({ analysis: null, analysisAskOpen: false, analysisAskMessages: [] })
        } else {
          this.setData({ 'analysis.productCards': productCards, analysisAskOpen: false, analysisAskMessages: [] })
        }
      }
    })
  },

  openAnalysisAsk(e) {
    const datasetIndex = e && e.currentTarget && e.currentTarget.dataset.index
    const productIndex = datasetIndex === undefined ? -1 : Number(datasetIndex)
    const card = productIndex >= 0 && this.data.analysis && (this.data.analysis.productCards || [])[productIndex]
    const subject = card ? `“${card.title}”` : '这次识别结果'
    this.setData({
      analysisAskOpen: true,
      analysisAskProductIndex: card ? productIndex : -1,
      analysisAskInput: '',
      analysisAskMessages: [{ role: 'assistant', text: `您好，我会只根据${subject}中实际识别到的信息解释，不会补写图片里没有的内容。` }]
    })
  },

  closeAnalysisAsk() {
    this.setData({ analysisAskOpen: false, analysisAskInput: '', analysisAskMessages: [], analysisAskLoading: false, analysisAskProductIndex: -1 })
  },

  onAnalysisAskInput(e) { this.setData({ analysisAskInput: e.detail.value }) },

  sendAnalysisAsk() {
    const question = String(this.data.analysisAskInput || '').trim()
    if (!question || this.data.analysisAskLoading || !this.data.analysis) return
    const index = Number(this.data.analysisAskProductIndex)
    const card = index >= 0 ? (this.data.analysis.productCards || [])[index] : null
    const context = card
      ? card.fields.map(item => `${item.label}：${item.value}`).join('；')
      : (this.data.analysis.productCards || []).map(item => `${item.title}：${item.fields.map(field => `${field.label}${field.value}`).join('，')}`).join('；')
    const messages = (this.data.analysisAskMessages || []).concat([{ role: 'user', text: question }])
    this.setData({ analysisAskMessages: messages, analysisAskInput: '', analysisAskLoading: true })
    const profile = Object.assign({}, wx.getStorageSync('profile') || {}, wx.getStorageSync('user') || {})
    getApp().request({
      url: '/assistant/chat',
      method: 'POST',
      data: {
        message: `${question}\n识别内容：${context}\n请用白话解释，只依据识别内容；缺失信息直接说未识别，不要跳转页面。`,
        mode: 'finance_recognition_popup',
        profile,
        history: messages.slice(-8).map(item => ({ role: item.role, text: item.text }))
      },
      loading: false
    }).then(res => {
      const reply = cleanDisplayText(res.reply || res.answer, '这项信息还不完整，请以官方产品说明书为准。')
      this.setData({ analysisAskMessages: this.data.analysisAskMessages.concat([{ role: 'assistant', text: reply }]) })
    }).catch(() => {
      this.setData({ analysisAskMessages: this.data.analysisAskMessages.concat([{ role: 'assistant', text: '小享暂时没能回答，请稍后再试。识别结果会继续保留。' }]) })
    }).finally(() => this.setData({ analysisAskLoading: false }))
  },

  loadTrackedPositions() {
    getApp().request({ url: '/wealth/positions' }).then(res => {
      const items = (res.items || []).map(item => this.decorateTrackedPosition(item))
      this.setData({ trackedPositions: items })
    }).catch(() => {
      this.setData({ trackedPositions: [] })
    })
  },

  parseRawInfo(raw) {
    if (!raw) return {}
    if (typeof raw === 'object') return raw
    try {
      return JSON.parse(raw)
    } catch (e) {
      return {}
    }
  },

  formatMoney(value) {
    const amount = Number(String(value == null ? 0 : value).replace(/,/g, '')) || 0
    return amount.toLocaleString()
  },

  decorateTrackedPosition(item) {
    item = Object.assign({}, item || {})
    const raw = this.parseRawInfo(item.raw_info)
    const product = raw.product || {}
    const stripReview = value => String(value || '').replace(/[（(]?待核验[）)]?/g, '').replace(/pending_review/ig, '').trim()
    const productName = stripReview(item.product_name || product.name || raw.product_name || raw.name || '')
    const amount = Number(String(item.amount || raw.amount || raw.buy_amount || 0).replace(/,/g, '')) || 0
    const detailFields = (raw.recognized_fields || []).map(field => ({
      label: cleanDisplayText(field.label, ''),
      value: cleanDisplayText(field.value, ''),
      labelSegments: termHelper.buildTermSegments(cleanDisplayText(field.label, '')),
      valueSegments: termHelper.buildTermSegments(cleanDisplayText(field.value, ''))
    })).filter(field => field.label && field.value)
    return Object.assign({}, item, {
      raw_info: raw,
      product_name: cleanDisplayText(productName, '未命名理财记录'),
      amount_text: item.amount_text || this.formatMoney(amount),
      latest_date: item.latest_date || item.created_at || raw.created_at || '',
      source_label: item.source_label || item.source || '理财记录',
      status_label: /待核验|pending|review/i.test(String(item.status_label || raw.status || '')) ? '已记录' : (item.status_label || raw.status || '已记录'),
      institution: stripReview(item.institution || raw.institution || product.institution || ''),
      risk_level: item.risk_level || raw.risk_level_label || product.risk_level || '',
      benchmark: item.benchmark || raw.benchmark || product.yield_expression || '',
      term: item.term || raw.term || product.term || '',
      min_amount: item.min_amount || raw.min_amount || product.min_buy || '',
      redeem_rule: item.redeem_rule || raw.redeem_rule || product.redemption_rule || '',
      service_phone: item.service_phone || raw.service_phone || product.customer_service || '',
      risk_summary: item.risk_summary || raw.risk_summary || '',
      elder_explanation: item.elder_explanation || raw.elder_explanation || raw.remark || '',
      detailFields
    })
  },

  editPosition() {
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
            getApp().request({
              url: `/wealth/positions/${item.id}`,
              method: 'PUT',
              data: { product_name: productName, buy_amount: amount },
              loading: true
            }).then(() => {
              this.closePositionDetail()
              this.loadTrackedPositions()
              wx.showToast({ title: '已修改', icon: 'success' })
            })
          }
        })
      }
    })
  },

  deletePosition() {
    const item = this.data.selectedPosition
    if (!item) return
    wx.showModal({
      title: '删除理财记录',
      content: `确定删除“${item.product_name}”吗？`,
      confirmText: '删除',
      confirmColor: '#c44b32',
      success: res => {
        if (!res.confirm) return
        getApp().request({ url: `/wealth/positions/${item.id}`, method: 'DELETE', loading: true }).then(() => {
          this.closePositionDetail()
          this.loadTrackedPositions()
          wx.showToast({ title: '已删除', icon: 'success' })
        })
      }
    })
  },

  openPositionDetail(e) {
    const id = e.currentTarget.dataset.id
    const selectedPosition = (this.data.trackedPositions || []).find(item => String(item.id) === String(id))
    if (!selectedPosition) return
    this.setData({
      selectedPosition,
      showPositionDetail: true,
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

  togglePositionAsk() {
    const open = !this.data.positionAskOpen
    this.setData({
      positionAskOpen: open,
      positionAskMessages: open && !this.data.positionAskMessages.length
        ? [{ role: 'assistant', text: '您好，我会结合这条理财记录为您解释。缺少的信息我会明确告诉您，不会猜。' }]
        : this.data.positionAskMessages
    })
  },

  onPositionAskInput(e) { this.setData({ positionAskInput: e.detail.value }) },

  sendPositionAsk() {
    const item = this.data.selectedPosition
    const question = String(this.data.positionAskInput || '').trim()
    if (!item || !question || this.data.positionAskLoading) return
    const messages = (this.data.positionAskMessages || []).concat([{ role: 'user', text: question }])
    this.setData({ positionAskMessages: messages, positionAskInput: '', positionAskLoading: true })
    const context = `产品名称：${item.product_name || '未识别'}；发行机构：${item.institution || '未识别'}；投入金额：${item.amount_text || 0}元；风险等级：${item.risk_level || '未识别'}；收益基准：${item.benchmark || '未识别'}；期限：${item.term || '未识别'}；赎回规则：${item.redeem_rule || '未识别'}`
    getApp().request({
      url: '/assistant/chat',
      method: 'POST',
      data: { message: `${question}\n请结合下面这条记录，用适合长辈的白话回答，不要臆造缺失信息。\n${context}`, mode: 'finance_record_explain', history: messages.slice(-8).map(msg => ({ role: msg.role, text: msg.text })) },
      loading: false
    }).then(res => {
      const reply = res.reply || res.answer || '这条记录的信息还不完整，建议以银行官方产品说明书为准。'
      this.setData({ positionAskMessages: this.data.positionAskMessages.concat([{ role: 'assistant', text: reply }]) })
    }).catch(() => this.setData({ positionAskMessages: this.data.positionAskMessages.concat([{ role: 'assistant', text: '小享暂时没有连上服务，请稍后再问。' }]) }))
      .finally(() => this.setData({ positionAskLoading: false }))
  },

  stopTap() {},

  // 真实产品收益参考数据（2026年市场水平）
  productYieldRef: {
    '国债': { yield_rate: '2.0%-2.5%', term: '3年/5年', min_buy: '100元', desc: '国家信用，保本保息，适合养老钱打底' },
    '储蓄国债': { yield_rate: '2.0%-2.5%', term: '3年/5年', min_buy: '100元', desc: '国家信用，保本保息，适合养老钱打底' },
    '大额存单': { yield_rate: '1.7%-2.2%', term: '1年-3年', min_buy: '20万元', desc: '存款保险保障50万，利率比定期高' },
    '存单': { yield_rate: '1.7%-2.2%', term: '1年-3年', min_buy: '20万元', desc: '存款保险保障50万，利率比定期高' },
    '货币基金': { yield_rate: '七日年化1.3%-1.8%', term: '随时可取', min_buy: '1元起', desc: '活钱好去处，日常备用金首选' },
    '定期存款': { yield_rate: '1.3%-1.8%', term: '3个月-5年', min_buy: '50元起', desc: '最简单安全，到期拿回本息' },
    '纯债基金': { yield_rate: '近一年2.5%-3.5%', term: '建议6个月+', min_buy: '10元起', desc: '波动小，收益比存款高一些' },
    '纯债': { yield_rate: '近一年2.5%-3.5%', term: '建议6个月+', min_buy: '10元起', desc: '波动小，收益比存款高一些' },
    '稳健理财': { yield_rate: '业绩基准2.0%-3.2%', term: '3个月-1年', min_buy: '1元起', desc: '银行筛选的低波动产品' },
    '银行理财': { yield_rate: '业绩基准2.0%-3.2%', term: '3个月-1年', min_buy: '1元起', desc: '银行筛选的低波动产品' },
    '混合基金': { yield_rate: '近一年3.0%-6.0%', term: '建议1年+', min_buy: '10元起', desc: '债券为主少量股票，收益空间更大' },
    '二级债基': { yield_rate: '近一年3.0%-5.0%', term: '建议1年+', min_buy: '10元起', desc: '债券为主少量股票，收益空间更大' },
    '指数基金': { yield_rate: '长期5.0%-10.0%', term: '建议3年+', min_buy: '10元起', desc: '跟随大盘，适合长期定投' },
    'R1': { yield_rate: '约1.3%-2.0%', term: '灵活/短期', min_buy: '以说明书为准', desc: '最低风险，本金安全性高' },
    'R2': { yield_rate: '约2.0%-3.2%', term: '3个月-1年', min_buy: '以说明书为准', desc: '较低风险，收益略高于存款' },
    'R3': { yield_rate: '约2.5%-4.5%', term: '6个月-2年', min_buy: '以说明书为准', desc: '中等风险，有一定波动' },
  },

  decorateProducts(products) {
    return (products || []).map(item => {
      // 根据产品名称匹配真实收益数据
      const name = item.name || ''
      let ref = null
      const refKeys = Object.keys(this.productYieldRef)
      for (let i = 0; i < refKeys.length; i++) {
        if (name.includes(refKeys[i])) { ref = this.productYieldRef[refKeys[i]]; break }
      }

      // 提取关键描述：优先用匹配到的简洁描述，其次用原有描述
      const keyDesc = ref ? ref.desc : (item.desc || '').replace(/。.*$/, '').slice(0, 40)
      const yieldRate = item.yield_rate || (ref ? ref.yield_rate : '以官方披露为准')
      const term = item.term || (ref ? ref.term : '详见说明书')
      const minBuy = item.min_buy || item.min_amount || (ref ? ref.min_buy : '以说明书为准')
      const risk = item.risk || item.risk_level || '详见说明书'

      return {
        ...item,
        yield_rate: yieldRate,
        term: term,
        min_buy: minBuy,
        min_amount: minBuy,
        risk: risk,
        desc: keyDesc,
        nameSegments: termHelper.buildTermSegments(name),
        descSegments: termHelper.buildTermSegments(keyDesc),
        riskSegments: termHelper.buildTermSegments(risk),
        reasonSegments: termHelper.buildTermSegments(item.reason || '')
      }
    })
  },

  refreshTermChips(text) {
    const detected = termHelper.extractTermsFromText(text, 12)
    this.setData({
      termChips: termHelper.mergeTerms(this.data.termChips, detected, 18)
    })
  },

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    if (!term) return
    termHelper.handleDoubleTap(this, e, {
      term,
      nearbyText: () => this.data.productText || JSON.stringify(this.data.analysis || {}),
      scene: 'finance'
    })
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  readPage() {
    const focus = (this.data.advice.focus || []).join('、')
    getApp().readText(`理财知识页。您的学习类型是${this.data.advice.level || '待完善画像'}。建议关注${focus || '基础金融安全知识'}。${this.data.advice.recommendation || ''}`)
  },

  // 点击理财建议卡朗读
  readAdvice() {
    const advice = this.data.advice
    const level = advice.level || '待完善画像'
    const rec = advice.recommendation || ''
    const focus = (advice.focus || []).join('、')
    getApp().readText(`理财建议：您属于${level}。${rec}。建议关注：${focus}`)
  },

  // 点击资讯朗读
  readNews(e) {
    const idx = e.currentTarget.dataset.index
    const item = this.data.articles[idx]
    if (!item) return
    getApp().readText(`资讯：${item.title}。${item.summary || ''}`)
  },

  // 点击产品卡朗读
  readProduct(e) {
    const idx = e.currentTarget.dataset.index
    const item = this.data.products[idx]
    if (!item) return
    const inst = item.institution ? `${item.institution}，` : ''
    getApp().readText(`产品：${item.name}。${inst}${item.desc || ''}。风险等级：${item.risk || '详见说明书'}`)
  },

  ask(e) {
    const item = (this.data.products || []).find(product => product.name === e.currentTarget.dataset.name) || { name: e.currentTarget.dataset.name }
    getApp().request({ url: '/products/explain', method: 'POST', data: { product: item }, loading: true }).then(res => {
      wx.showModal({ title: item.name || '小享解释', content: cleanDisplayText(res.explanation, '暂时没有更多说明。'), showCancel: false, confirmText: '知道了' })
    }).catch(() => wx.showToast({ title: '暂时无法解释', icon: 'none' }))
  },

  askAnalysis() {
    if (!this.data.analysis) return
    this.openAnalysisAsk()
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },
  back() { this.goBack() },
  goHome() { wx.redirectTo({ url: '/pages/index/index' }); getApp().readText('首页') },
  goAssistant() { wx.redirectTo({ url: '/pages/assistant/assistant' }); getApp().readText('问小享') },
  goProfile() { wx.redirectTo({ url: '/pages/profile/profile' }); getApp().readText('我的画像') },
  readNav(e) { getApp().readText(e.currentTarget.dataset.label || '') },

  // ---- 语音输入 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    this.setData({ productText: cleanDisplayText(text, '') })
    wx.showToast({ title: '已转成文字，正在分析', icon: 'none', duration: 800 })
    this.parseProductText()
  },
  onVoiceEmpty() {},
  onVoiceError() {},

  // ---- 正规渠道相关方法 ----
  
  // 切换渠道分类
  switchChannelCategory(e) {
    const category = e.currentTarget.dataset.category || 'all'
    this.setData({ selectedCategory: category })
  },

  // 获取筛选后的渠道列表
  getFilteredChannels() {
    const { channels, selectedCategory } = this.data
    if (selectedCategory === 'all') {
      return channels
    }
    return channels.filter(ch => ch.category === selectedCategory)
  },

  // 点击渠道卡片，显示详情
  showChannelDetail(e) {
    const channelId = e.currentTarget.dataset.id
    const channel = this.data.channels.find(ch => ch.id === channelId)
    if (channel) {
      getApp().readText(`${channel.shortName}：${channel.desc}`)
      this.setData({
        selectedChannel: channel,
        showChannelDetail: true
      })
    }
  },

  // 关闭渠道详情
  closeChannelDetail() {
    this.setData({
      selectedChannel: null,
      showChannelDetail: false
    })
  },

  // 跳转到渠道
  goToChannel(e) {
    const channelId = e.currentTarget.dataset.id
    const channel = this.data.channels.find(ch => ch.id === channelId)
    if (!channel) return

    wx.showModal({
      title: `即将前往${channel.name}`,
      content: `${channel.tips}\n\n是否继续？`,
      confirmText: '去访问',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 优先尝试跳转小程序
          if (channel.miniAppId) {
            wx.navigateToMiniProgram({
              appId: channel.miniAppId,
              path: '',
              extraData: {},
              success: () => {
                wx.showToast({ title: '正在打开...', icon: 'none' })
              },
              fail: () => {
                // 小程序跳转失败，复制链接
                this.copyChannelUrl(channel)
              }
            })
          } else {
            // 直接复制链接到剪贴板
            this.copyChannelUrl(channel)
          }
        }
      }
    })
  },

  // 复制链接
  copyChannelUrl(channel) {
    wx.setClipboardData({
      data: channel.url,
      success: () => {
        wx.showModal({
          title: '链接已复制',
          content: `请打开浏览器，粘贴访问：${channel.name}\n\n${channel.tips}`,
          showCancel: false,
          confirmText: '我知道了'
        })
      },
      fail: () => {
        wx.showToast({ title: '复制失败，请手动访问', icon: 'none' })
      }
    })
  },

  // 阅读渠道信息
  readChannelInfo(e) {
    const channelId = e.currentTarget.dataset.id
    const channel = this.data.channels.find(ch => ch.id === channelId)
    if (!channel) return

    const text = `${channel.name}：${channel.desc}。风险等级：${channel.riskLevel}。特点：${channel.features.join('，')}。温馨提示：${channel.tips}`
    getApp().readText(text)
  },

  // 阅读页面渠道部分
  readChannels() {
    const channels = this.getFilteredChannels()
    if (channels.length === 0) return

    let text = '正规理财渠道列表：'
    channels.forEach((ch, idx) => {
      text += `${idx + 1}、${ch.shortName}：${ch.desc}。`
    })
    getApp().readText(text)
  },

  // ==================== 产品核验功能 ====================

  // 切换核验标签页
  switchVerifyTab(e) {
    const tab = e.currentTarget.dataset.tab || 'channels'
    this.setData({ verifyTab: tab, verifyResult: null })
    
    // 切换到核验页时，加载示例编码
    if (tab === 'verify' && this.data.exampleCodes.length === 0) {
      this.loadExampleCodes()
    }
    
    // 朗读提示
    if (tab === 'verify') {
      getApp().readText('产品核验：请输入产品登记编码，一般是C开头的14位数字')
    }
  },

  // 输入编码
  onVerifyInput(e) {
    this.setData({ verifyInput: e.detail.value.toUpperCase() })
  },

  // 清空输入
  clearVerifyInput() {
    this.setData({ verifyInput: '', verifyResult: null })
  },

  // 使用示例编码
  useExampleCode(e) {
    const code = e.currentTarget.dataset.code
    this.setData({ verifyInput: code })
    getApp().readText(`已填入示例编码：${code}`)
  },

  // 加载示例编码
  loadExampleCodes() {
    api.getProductExamples().then(res => {
      if (res.ok && res.examples) {
        this.setData({ exampleCodes: res.examples })
      }
    }).catch(() => {
      this.setData({ exampleCodes: [] })
    })
  },

  // 核验产品
  verifyProduct() {
    const code = this.data.verifyInput.trim()
    
    // 校验编码格式
    if (!code) {
      wx.showToast({ title: '请输入编码', icon: 'none' })
      return
    }
    
    // C开头 + 13-15位数字
    const pattern = /^C\d{13,15}$/
    if (!pattern.test(code)) {
      wx.showModal({
        title: '编码格式不正确',
        content: '正确格式：C开头 + 14位数字\n例如：C1082725000074\n\n编码在产品说明书上可以找到',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }
    
    // 开始核验
    this.setData({ verifyLoading: true, verifyResult: null })
    wx.showLoading({ title: '正在核验...', mask: true })
    
    api.queryProduct(code).then(res => {
      wx.hideLoading()
      this.setData({ verifyLoading: false })
      
      if (res.ok && res.product) {
        // 核验成功
        const result = {
          ok: true,
          is_valid: true,
          product: res.product,
          warning: res.warning,
          explain: res.explain,
          source: res.source,
          cached: res.cached
        }
        
        this.setData({ verifyResult: result })
        
        // 保存到历史
        this.saveVerifyHistory(code, result)
        
        // 朗读结果
        this.readVerifyResult(result)
        
      } else {
        // 核验失败
        const result = {
          ok: false,
          is_valid: false,
          reasonCode: res.reason_code || 'query_failed',
          statusTitle: res.reason_code === 'not_configured' ? '暂时无法自动核验' : (res.reason_code === 'invalid_format' ? '编码格式不正确' : '当前数据源未查到'),
          error: res.error || '当前授权数据源暂未查到，不能据此判断产品真伪。'
        }
        
        this.setData({ verifyResult: result })
        
        getApp().readText(result.error)
      }
      
    }).catch(err => {
      wx.hideLoading()
      const detail = err && err.data && (err.data.detail || err.data.error)
      this.setData({
        verifyLoading: false,
        verifyResult: {
          ok: false,
          is_valid: false,
          reasonCode: 'query_failed',
          statusTitle: '核验服务暂不可用',
          error: cleanDisplayText(detail, '') || '产品信息暂时没有查询成功，请稍后重试或到官方平台复核。'
        }
      })
    })
  },

  // 朗读核验结果
  readVerifyResult(result) {
    if (!result || !result.product) result = this.data.verifyResult
    if (!result || !result.product) return
    
    const p = result.product
    let text = `核验结果：当前授权数据源查到这条登记信息。${p.name}，由${p.bank}发行。风险等级${p.risk_level || '未知'}，${p.risk_desc || ''}。业绩比较基准${p.yield_benchmark || '以说明书为准'}，期限${p.term || '详见说明书'}。`
    
    if (result.warning && result.warning.elderly_tips) {
      text += `温馨提示：${result.warning.elderly_tips}`
    }
    
    getApp().readText(text)
  },

  // 朗读详细风险提示
  readVerifyWarning() {
    const result = this.data.verifyResult
    if (!result || !result.warning) return
    
    const warning = result.warning
    let text = `${warning.title}：`
    warning.content.forEach(item => {
      text += `${item}。`
    })
    if (warning.elderly_tips) {
      text += `给您的建议：${warning.elderly_tips}`
    }
    
    getApp().readText(text)
  },

  // 朗读术语解释
  readVerifyExplain() {
    const result = this.data.verifyResult
    if (!result || !result.explain) return
    
    const explain = result.explain
    let text = '白话解释：'
    if (explain.risk_level) text += `风险等级：${explain.risk_level}。`
    if (explain.yield_type) text += `收益类型：${explain.yield_type}。`
    if (explain.term) text += `期限：${explain.term}。`
    if (explain.operation_mode) text += `运作模式：${explain.operation_mode}。`
    
    getApp().readText(text)
  },

  // 保存核验历史
  saveVerifyHistory(code, result) {
    let history = wx.getStorageSync('verify_history') || []
    
    // 添加新记录
    const record = {
      code: code,
      name: result.product?.name || '未知产品',
      bank: result.product?.bank || '未知机构',
      is_valid: result.is_valid,
      time: new Date().toLocaleString()
    }
    
    // 去重（保留最新的）
    history = history.filter(h => h.code !== code)
    history.unshift(record)
    
    // 最多保存20条
    if (history.length > 20) {
      history = history.slice(0, 20)
    }
    
    wx.setStorageSync('verify_history', history)
    this.setData({ verifyHistory: history })
  },

  // 加载核验历史
  loadVerifyHistory() {
    const history = wx.getStorageSync('verify_history') || []
    this.setData({ verifyHistory: history })
  },

  // 点击历史记录
  useHistoryCode(e) {
    const code = e.currentTarget.dataset.code
    this.setData({ verifyInput: code })
    this.verifyProduct()
  },

  // 清空历史
  clearVerifyHistory() {
    wx.showModal({
      title: '清空核验历史',
      content: '确定要清空所有核验历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('verify_history')
          this.setData({ verifyHistory: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  // 去中国理财网核验
  goToChinawealth() {
    const code = this.data.verifyInput.trim()
    if (!code) {
      wx.showToast({ title: '请先输入编码', icon: 'none' })
      return
    }
    
    wx.setClipboardData({
      data: `https://www.chinawealth.com.cn/zh-cn/product/detail.html?code=${code}`,
      success: () => {
        wx.showModal({
          title: '链接已复制',
          content: '请打开浏览器粘贴访问，在中国理财网官方核验该产品',
          showCancel: false,
          confirmText: '我知道了'
        })
      }
    })
  },

  // 问小享关于这个产品
  askAboutProduct() {
    const result = this.data.verifyResult
    if (!result || !result.product) return
    
    const p = result.product
    const question = `请用长辈能听懂的话解释${p.name}这个理财产品：风险等级${p.risk_level}是什么意思？业绩比较基准${p.yield_benchmark}是不是承诺收益？期限${p.term}能不能提前取出？适合养老钱吗？`
    
    getApp().request({
      url: '/assistant/chat',
      method: 'POST',
      data: { message: question, mode: 'finance_verify_popup', profile: Object.assign({}, wx.getStorageSync('profile') || {}, wx.getStorageSync('user') || {}) },
      loading: true
    }).then(res => {
      wx.showModal({ title: p.name || '小享解释', content: cleanDisplayText(res.reply || res.answer, '暂时没有更多说明。'), showCancel: false, confirmText: '知道了' })
    }).catch(() => wx.showToast({ title: '暂时无法解释', icon: 'none' }))
  }
})
