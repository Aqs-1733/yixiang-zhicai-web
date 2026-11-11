const termHelper = require('../../utils/termExplain.js')

function riskAnswersKey() {
  const user = wx.getStorageSync('user') || {}
  return `risk_answers_${user.id || user.user_id || user.phone || 'current'}`
}

const TERM_MAP = {
  '资金安全': '资金安全就是先保证本金尽量稳，不轻易亏掉。对老年用户来说，比高收益更重要的是钱拿得回来、用得上。',
  '产品期限': '产品期限就是这笔钱要放多久。期限越长，通常越不适合短期要用的钱。',
  '月收入': '月收入就是您每个月比较稳定能收到的钱，比如养老金、退休金、房租收入、子女固定补贴等。',
  '月支出': '月支出就是您每个月生活中大概要花的钱，包括吃饭、交通、缴费、看病买药等。',
  '流动资金': '流动资金就是随时能拿出来用的钱，适合放生活费、医疗备用金和突发开支。',
  '固定资金': '固定资金是短期内不急着用、可以做稳健配置的钱，比如存单、国债等。',
  '风险偏好': '风险偏好是您对收益波动和本金风险的接受程度。稳健型更看重安全，进取型更能接受波动。',
  '用钱时间': '用钱时间就是这笔钱什么时候可能会用到。越快要用的钱，越不能买期限太长的产品。',
  '理财经验': '理财经验是指您过去是否买过存款、国债、银行理财、基金等产品。经验越少，越需要白话解释和风险提醒。',
  '子女权限': '子女权限是指您决定哪些账本、风险、健康或对话信息可以推送给家人，家人不能替您操作资金。'
}

const QUESTIONS = [
  {
    key: 'age_group',
    title: '您的年龄是？',
    desc: '年龄会影响资金安全、用钱时间和产品期限。',
    terms: ['资金安全', '产品期限'],
    options: [
      { letter: 'A', value: '65岁以上', label: '65岁以上', tip: '更适合安全、容易取用的产品' },
      { letter: 'B', value: '55-65岁', label: '55-65岁', tip: '以稳健为主，少量长期配置' },
      { letter: 'C', value: '45-55岁', label: '45-55岁', tip: '可以适当做中长期规划' },
      { letter: 'D', value: '35-45岁', label: '35-45岁', tip: '可承受能力可能更高，但仍需分散' },
      { letter: 'E', value: '35岁以下', label: '35岁以下', tip: '可做长期养老准备' }
    ]
  },
  {
    key: 'income_level',
    title: '您的月收入大约是多少？',
    desc: '收入越稳定，越容易安排长期养老规划。',
    terms: ['月收入'],
    options: [
      { letter: 'A', value: '3000以下', label: '3000元以下', tip: '优先保证日常生活和备用金' },
      { letter: 'B', value: '3000-5000', label: '3000-5000元', tip: '适合小额、稳健、可取用配置' },
      { letter: 'C', value: '5000-8000', label: '5000-8000元', tip: '可兼顾备用金和养老增值' },
      { letter: 'D', value: '8000-12000', label: '8000-12000元', tip: '可做更完整的账户分配' },
      { letter: 'E', value: '12000以上', label: '12000元以上', tip: '可考虑长期稳健组合' }
    ]
  },
  {
    key: 'expense_level',
    title: '您的月支出大约是多少？',
    desc: '支出决定应急金要准备多少。',
    terms: ['月支出'],
    options: [
      { letter: 'A', value: '2000以下', label: '2000元以下', tip: '日常压力较小，可适当储备' },
      { letter: 'B', value: '2000-3000', label: '2000-3000元', tip: '建议准备半年以上生活费' },
      { letter: 'C', value: '3000-5000', label: '3000-5000元', tip: '需要重点做好现金管理' },
      { letter: 'D', value: '5000-8000', label: '5000-8000元', tip: '建议提高流动资金比例' },
      { letter: 'E', value: '8000以上', label: '8000元以上', tip: '要避免长期产品占用过多资金' }
    ]
  },
  {
    key: 'liquid_asset_level',
    title: '可随时取用的钱有多少？',
    desc: '这部分钱主要用于生活、医疗和突发情况。',
    terms: ['流动资金'],
    options: [
      { letter: 'A', value: '1万以下', label: '1万元以下', tip: '应先补足应急备用金' },
      { letter: 'B', value: '1-5万', label: '1-5万元', tip: '建议保留更多可取用资金' },
      { letter: 'C', value: '5-10万', label: '5-10万元', tip: '可做基础稳健配置' },
      { letter: 'D', value: '10-30万', label: '10-30万元', tip: '可分成备用和增值两部分' },
      { letter: 'E', value: '30万以上', label: '30万元以上', tip: '可做期限搭配，但仍要安全优先' }
    ]
  },
  {
    key: 'fixed_asset_level',
    title: '短期内不用的钱有多少？',
    desc: '这部分钱可以考虑稳健配置，但要注意期限。',
    terms: ['固定资金', '产品期限'],
    options: [
      { letter: 'A', value: '没有', label: '基本没有', tip: '先保证生活费和备用金' },
      { letter: 'B', value: '5万以下', label: '5万元以下', tip: '可做少量稳健配置' },
      { letter: 'C', value: '5-20万', label: '5-20万元', tip: '适合做基础稳健组合' },
      { letter: 'D', value: '20-50万', label: '20-50万元', tip: '可做分层配置' },
      { letter: 'E', value: '50万以上', label: '50万元以上', tip: '可更细分期限和产品' }
    ]
  },
  {
    key: 'risk_preference',
    title: '您能接受多大的波动？',
    desc: '风险偏好会影响推荐产品类型。',
    terms: ['风险偏好'],
    options: [
      { letter: 'A', value: '保守', label: '不能接受亏损', tip: '适合存款、国债等低风险产品' },
      { letter: 'B', value: '稳健', label: '能接受很小波动', tip: '适合低风险和中低风险组合' },
      { letter: 'C', value: '稳健', label: '能接受短期小亏', tip: '但养老钱仍应安全优先' },
      { letter: 'D', value: '积极', label: '能接受一定波动', tip: '可少量配置波动产品' },
      { letter: 'E', value: '积极', label: '能接受较大波动', tip: '也要控制养老资金风险' }
    ]
  },
  {
    key: 'money_time',
    title: '这笔钱多久可能会用到？',
    desc: '用钱时间越近，越不能买太长期的产品。',
    terms: ['用钱时间', '产品期限'],
    options: [
      { letter: 'A', value: '1个月内', label: '1个月内', tip: '应以活期和货币基金为主' },
      { letter: 'B', value: '3个月内', label: '3个月内', tip: '优先选择容易取用的产品' },
      { letter: 'C', value: '半年', label: '半年内', tip: '可以做短期限稳健配置' },
      { letter: 'D', value: '1年', label: '1年左右', tip: '可考虑一年期产品' },
      { letter: 'E', value: '3年以上', label: '3年以上', tip: '可做部分长期养老配置' }
    ]
  },
  {
    key: 'child_support',
    title: '哪些信息可以授权给子女？',
    desc: '亲情协同可以帮助提醒风险，但不代替您做决定。',
    terms: ['子女权限'],
    options: [
      { letter: 'A', value: '无需协助', label: '暂时不需要', tip: '可以自己查看和操作' },
      { letter: 'B', value: '部分协助', label: '需要提醒和讲解', tip: '适合开启提醒和解释功能' },
      { letter: 'C', value: '部分协助', label: '大额操作希望子女知道', tip: '适合开启异常提醒' },
      { letter: 'D', value: '完全协助', label: '希望子女经常帮忙看', tip: '适合开启家庭周报' },
      { letter: 'E', value: '完全协助', label: '手机操作比较困难', tip: '适合加强语音和远程指导' }
    ]
  }
]

Page({
  data: {
    idx: 0,
    questions: QUESTIONS,
    cur: QUESTIONS[0],
    answers: {},
    globalFontPageClass: 'font-global-normal',

    progressWidth: '13%',
    progressText: '1 / 8',
    questionNo: '第 1 题',
    isFirst: true,
    isLast: false,

    termList: QUESTIONS[0].terms || [],
    termExplainPopups: []
  },

  onLoad() {
    this.syncGlobalFont()
    if ((wx.getStorageSync('role') || 'elder') === 'child') {
      wx.redirectTo({ url: '/pages/child/index/index' })
      return
    }
    const profile = wx.getStorageSync('profile') || {}
    const oldAnswers = Object.assign({
      age_group: profile.age_range || '',
      income_level: profile.monthly_income_range || '',
      expense_level: profile.monthly_expense_range || '',
      liquid_asset_level: profile.liquid_asset_range || '',
      fixed_asset_level: profile.fixed_asset_range || '',
      risk_preference: profile.risk_preference || '',
      money_time: profile.money_time || '',
      child_support: profile.child_support || ''
    }, wx.getStorageSync(riskAnswersKey()) || {})
    this.setData({
      answers: oldAnswers
    })
    this.refreshQuestion()
  },

  onShow() {
    this.syncGlobalFont()
  },

  syncGlobalFont() {
    const font = getApp().getGlobalFontSetting()
    this.setData({ globalFontPageClass: font.pageClass })
  },

  refreshQuestion() {
    const idx = this.data.idx
    const questions = this.data.questions
    const cur = questions[idx]
    const progress = Math.round(((idx + 1) / questions.length) * 100)

    this.setData({
      cur,
      termList: cur.terms || [],
      progressWidth: progress + '%',
      progressText: (idx + 1) + ' / ' + questions.length,
      questionNo: '第 ' + (idx + 1) + ' 题',
      isFirst: idx === 0,
      isLast: idx === questions.length - 1
    })
  },

  choose(e) {
    const value = e.detail.value
    const key = this.data.cur.key
    const answers = {
      ...this.data.answers,
      [key]: value
    }

    this.setData({
      answers
    })

    wx.setStorageSync(riskAnswersKey(), answers)
  },

  prev() {
    if (this.data.idx <= 0) {
      wx.showToast({
        title: '已经是第一题',
        icon: 'none'
      })
      return
    }

    this.setData({
      idx: this.data.idx - 1
    })

    this.refreshQuestion()
  },

  next() {
    const key = this.data.cur.key

    if (!this.data.answers[key]) {
      wx.showToast({
        title: '请先选择一个答案',
        icon: 'none'
      })
      return
    }

    if (this.data.idx >= this.data.questions.length - 1) {
      this.finishQuestionnaire()
      return
    }

    this.setData({
      idx: this.data.idx + 1
    })

    this.refreshQuestion()
  },

  finishQuestionnaire() {
    const answers = this.data.answers
    const profile = wx.getStorageSync('profile') || wx.getStorageSync('userProfile') || {}

    const newProfile = {
      ...profile
    }

    const rangeFields = {
      age: ['age_range', answers.age_group],
      monthly_income: ['monthly_income_range', answers.income_level],
      monthly_expense: ['monthly_expense_range', answers.expense_level],
      liquid_asset: ['liquid_asset_range', answers.liquid_asset_level],
      fixed_asset: ['fixed_asset_range', answers.fixed_asset_level]
    }
    const clearFields = []
    Object.keys(rangeFields).forEach(exactKey => {
      const pair = rangeFields[exactKey]
      if (!pair[1]) return
      newProfile[pair[0]] = pair[1]
      delete newProfile[exactKey]
      clearFields.push(exactKey)
    })
    ;['income', 'expense', 'liquid', 'fixed', 'cash', 'deposit_asset', 'finance_asset', 'financial_asset'].forEach(key => {
      delete newProfile[key]
      clearFields.push(key)
    })
    newProfile.risk_preference = answers.risk_preference || ''
    newProfile.money_time = answers.money_time || ''
    newProfile.child_support = answers.child_support || ''
    newProfile.onboarding_completed = true
    newProfile.profile_source = 'questionnaire_range'

    wx.setStorageSync(riskAnswersKey(), answers)
    wx.setStorageSync('profile', newProfile)
    wx.setStorageSync('userProfile', newProfile)
    wx.setStorageSync('user_profile', newProfile)

    // 同步到全局，供所有页面读取
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.profile = newProfile
    }

    // 同步到后端
    if (app && app.request) {
      app.request({
        url: '/profile/update',
        method: 'POST',
        data: {
          data: newProfile,
          clear_fields: clearFields
        },
        loading: false
      }).catch(() => {})
    }

    wx.showModal({
      title: '评估完成',
      content: '小享已经根据您的答案更新画像和风险建议。',
      showCancel: false,
      confirmText: '查看画像',
      success: () => {
        const role = wx.getStorageSync('role') || 'elder'
        wx.redirectTo({
          url: role === 'child' ? '/pages/child/index/index' : '/pages/profile/profile'
        })
      }
    })
  },

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    termHelper.handleDoubleTap(this, e, {
      term,
      nearbyText: () => this.data.cur ? this.data.cur.desc : '',
      scene: 'questionnaire'
    })
  },

  explainCurrent() {
    const terms = this.data.termList || []

    if (!terms.length) {
      wx.showToast({
        title: '本题暂无术语说明',
        icon: 'none'
      })
      return
    }

    const term = terms[0]

    termHelper.openTermPopup(this, term, this.data.cur ? this.data.cur.desc : '', 'questionnaire')
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  read() {
    const cur = this.data.cur
    getApp().readText(`${cur.title}。${cur.desc}`)
  },

  help() {
    wx.showModal({
      title: '填写帮助',
      content: '这份问卷一共 8 道题。您按真实情况选择就行，小享会根据结果更新画像，并给出更适合您的稳健理财建议。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  back() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.redirectTo({
          url: '/pages/profile/profile'
        })
      }
    })
  },

  // ---- 语音输入：语音回答问卷 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    // 尝试匹配选项
    const cur = this.data.cur
    const options = (cur && cur.options) || []
    const matched = options.find(opt => {
      const label = (opt.label || '').toLowerCase()
      const letter = (opt.letter || '').toLowerCase()
      const txt = text.toLowerCase()
      return txt.includes(label) || txt.includes(letter) || txt.includes(label.slice(0, 2))
    })
    if (matched) {
      const answers = { ...this.data.answers, [cur.key]: matched.value }
      this.setData({ answers })
      wx.setStorageSync(riskAnswersKey(), answers)
      wx.showToast({ title: '已选择：' + matched.label, icon: 'success' })
    } else {
      wx.showToast({ title: '请说出选项内容' + (options.length ? '，如「' + (options[0].letter || '') + ' ' + (options[0].label || '') + '」' : ''), icon: 'none', duration: 2500 })
    }
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})
