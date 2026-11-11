const termHelper = require('../../utils/termExplain.js')

function toNumber(v, def = 0) {
  if (v === undefined || v === null || v === '') return def
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isNaN(n) ? def : n
}

function hasValue(v) {
  return v !== undefined && v !== null && v !== ''
}

function optionalNumber(v) {
  if (!hasValue(v)) return undefined
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isNaN(n) ? undefined : n
}

function rangeWithUnit(value, unit) {
  const text = String(value || '').trim()
  if (!text) return '未填写'
  if (text === '没有') return text
  if (unit === '元' && /万/.test(text)) return text.replace(/万/g, '万元')
  if (unit === '元' && /^(\d+)(以下|以上)$/.test(text)) return text.replace(/^(\d+)(以下|以上)$/, '$1元$2')
  return unit && !text.endsWith(unit) ? `${text}${unit}` : text
}

function riskAnswersKey() {
  const user = wx.getStorageSync('user') || {}
  return `risk_answers_${user.id || user.user_id || user.phone || 'current'}`
}

function formatMoney(num) {
  num = toNumber(num, 0)
  return num.toLocaleString()
}

function simpleMoney(num) {
  num = toNumber(num, 0)

  if (num >= 10000) {
    const v = num / 10000
    return Number.isInteger(v) ? `${v}万` : `${v.toFixed(1)}万`
  }

  return `${num}`
}

/* 判断是不是无效昵称 */
function isBadNickname(name) {
  name = String(name || '').trim()

  return (
    !name ||
    name === 'undefined' ||
    name === 'null' ||
    name === '微信用户' ||
    name === '用户' ||
    name === '您'
  )
}

/* 保存时用：必须是真昵称，不能自动变微信用户 */
function cleanNickname(name, fallback = '') {
  name = String(name || '').trim()

  if (!name || name === 'undefined' || name === 'null') {
    return fallback
  }

  return name
}

/* 展示时用：没昵称才显示微信用户 */
function displayNickname(name) {
  name = cleanNickname(name, '')

  if (!name) {
    return '微信用户'
  }

  return name
}

/* 从多个来源里找真正昵称 */
function pickBestNickname(list) {
  for (let i = 0; i < list.length; i++) {
    const name = cleanNickname(list[i], '')

    if (!isBadNickname(name)) {
      return name
    }
  }

  for (let i = 0; i < list.length; i++) {
    const name = cleanNickname(list[i], '')

    if (name) {
      return name
    }
  }

  return '微信用户'
}

function cleanAvatar(avatar) {
  avatar = String(avatar || '').trim()

  if (!avatar || avatar === 'undefined' || avatar === 'null') {
    return '/assets/ui/default_avatar.png'
  }

  try {
    return getApp().resolveMediaUrl ? getApp().resolveMediaUrl(avatar) : avatar
  } catch (e) {
    return avatar
  }
}

Page({
  data: {
    profile: {},
    globalFontPageClass: 'font-global-normal',

    analysis: {
      risk_score: '',
      risk_level: '待完善',
      risk_reason: '',
      fraud_tip: '',
      tags: []
    },

    answers: [],
    profileSummary: '',
    profileSummarySegments: [],
    riskReasonSegments: [],
    fraudTipSegments: [],
    termExplainPopups: [],
    familyMembers: [],
    familyCode: '',
    showChildPermissionPanel: false,
    childPermissions: { positions: true, ledger: true, risk: true, messages: true, groupChat: true, health: false, location: false },

    showEditPanel: false,
    editFieldKey: '',
    editFieldLabel: '',
    editFieldValue: '',
    editFieldType: 'text',
    editFieldOptions: []
  },

  onLoad() {
    this.syncGlobalFont()
    this.refreshProfileView()
    this.loadBackendProfile()
    this.loadFamilyBinding()
  },

  onShow() {
    this.syncGlobalFont()
    this.refreshProfileView()
    this.loadBackendProfile()
    this.loadFamilyBinding()
  },

  syncGlobalFont() {
    const font = getApp().getGlobalFontSetting()
    this.setData({
      globalFontPageClass: font.pageClass
    })
  },

  /**
   * 合并所有可能存过用户信息的缓存。
   * 这里修复重点：
   * 1. 不让旧的“微信用户”覆盖用户手动输入的昵称
   * 2. nickname / nickName / profile / user / me 都统一读取
   */
  getLocalProfile() {
    const profile = wx.getStorageSync('profile') || {}
    const userProfile = wx.getStorageSync('userProfile') || {}
    const userProfile2 = wx.getStorageSync('user_profile') || {}
    const me = wx.getStorageSync('me') || {}
    const user = wx.getStorageSync('user') || {}

    // 从问卷答案映射为初始数值；已手动保存的画像优先
    const riskAnswers = wx.getStorageSync(riskAnswersKey()) || {}
    const fromRisk = this.mapRiskAnswersToProfile(riskAnswers)

    const nickname = pickBestNickname([
      wx.getStorageSync('nickname'),
      fromRisk.nickname,
      profile.nickname,
      profile.nickName,
      userProfile.nickname,
      userProfile.nickName,
      userProfile2.nickname,
      userProfile2.nickName,
      me.nickname,
      me.nickName,
      user.nickname,
      user.nickName
    ])

    const avatar =
      wx.getStorageSync('avatar') ||
      fromRisk.avatar ||
      profile.avatar ||
      profile.avatarUrl ||
      userProfile.avatar ||
      userProfile.avatarUrl ||
      userProfile2.avatar ||
      userProfile2.avatarUrl ||
      me.avatar ||
      me.avatarUrl ||
      user.avatar ||
      user.avatarUrl ||
      ''

    return {
      ...user,
      ...me,
      ...fromRisk,     // 问卷数据只用于补初始值，不能覆盖手动保存后的画像
      ...userProfile2,
      ...userProfile,
      ...profile,
      nickname,
      nickName: nickname,
      avatar,
      avatarUrl: avatar
    }
  },

  // 将问卷答案映射为画像数值，与 questionnaire.js 保持一致
  mapRiskAnswersToProfile(answers) {
    if (!answers || Object.keys(answers).length === 0) return {}

    const result = {}
    if (answers.age_group) result.age_range = answers.age_group
    if (answers.income_level) result.monthly_income_range = answers.income_level
    if (answers.expense_level) result.monthly_expense_range = answers.expense_level
    if (answers.liquid_asset_level) result.liquid_asset_range = answers.liquid_asset_level
    if (answers.fixed_asset_level) result.fixed_asset_range = answers.fixed_asset_level
    if (answers.risk_preference) result.risk_preference = answers.risk_preference
    if (answers.money_time) result.money_time = answers.money_time
    if (answers.child_support) result.child_support = answers.child_support

    return result
  },

  normalizeProfile(profile) {
    const p = profile || {}

    const nickname = displayNickname(
      pickBestNickname([
        p.nickname,
        p.nickName,
        wx.getStorageSync('nickname')
      ])
    )

    const avatar = cleanAvatar(
      p.avatar ||
      p.avatarUrl ||
      wx.getStorageSync('avatar')
    )

    return {
      ...p,

      avatar,
      avatarUrl: avatar,

      nickname,
      nickName: nickname,

      age: optionalNumber(p.age),
      monthly_income: optionalNumber(hasValue(p.monthly_income) ? p.monthly_income : p.income),
      monthly_expense: optionalNumber(hasValue(p.monthly_expense) ? p.monthly_expense : p.expense),
      liquid_asset: optionalNumber(hasValue(p.liquid_asset) ? p.liquid_asset : p.liquid),
      fixed_asset: optionalNumber(hasValue(p.fixed_asset) ? p.fixed_asset : p.fixed),

      risk_preference: p.risk_preference || p.riskLevel || '',
      money_time: p.money_time || p.use_time || '',
      child_support: p.child_support || '',
      child_permissions: Object.assign({ ledger: true, risk: true, health: false, chatMemory: false }, p.child_permissions || {})
    }
  },

  refreshProfileView() {
    const localProfile = this.getLocalProfile()
    const profile = this.normalizeProfile(localProfile)

    const analysis = this.buildAnalysis(profile)
    const answers = this.buildAnswers(profile)
    const profileSummary = this.buildProfileSummary(profile)

    this.setData({
      profile,
      analysis,
      answers,
      profileSummary,
      profileSummarySegments: termHelper.buildTermSegments(profileSummary),
      riskReasonSegments: termHelper.buildTermSegments(analysis.risk_reason || ''),
      fraudTipSegments: termHelper.buildTermSegments(analysis.fraud_tip || '')
    })

    this.saveProfileToStorage(profile)
  },

  loadBackendProfile() {
    const app = getApp()
    if (!wx.getStorageSync('token') || !app || !app.request) return
    const requestRevision = this._profileRevision || 0

    app.request({
      url: '/profile/me',
      loading: false
    }).then(res => {
      if (res.user) {
        wx.setStorageSync('user', res.user)
        wx.setStorageSync('role', res.user.role || 'elder')
        app.globalData.user = res.user
        app.globalData.role = res.user.role || 'elder'
      }
      if (res.profile) {
        if (requestRevision !== (this._profileRevision || 0)) return
        this.saveProfileToStorage(this.normalizeProfile(res.profile), true)
        this.refreshProfileView()
      }
    }).catch(() => {})
  },

  /**
   * 统一保存画像。
   * 这里必须同时保存多个 key，否则首页、问小享、家庭页可能还读旧昵称。
   */
  saveProfileToStorage(profile, replace = false) {
    const oldUser = wx.getStorageSync('user') || {}
    const oldMe = wx.getStorageSync('me') || {}
    const oldProfile = wx.getStorageSync('profile') || {}

    const nickname = displayNickname(
      pickBestNickname([
        profile.nickname,
        profile.nickName,
        wx.getStorageSync('nickname'),
        oldProfile.nickname,
        oldProfile.nickName,
        oldUser.nickname,
        oldUser.nickName
      ])
    )

    const avatar = cleanAvatar(
      profile.avatar ||
      profile.avatarUrl ||
      oldProfile.avatar ||
      oldProfile.avatarUrl
    )

    const finalProfile = {
      ...(replace ? {} : oldProfile),
      ...profile,
      nickname,
      nickName: nickname,
      avatar,
      avatarUrl: avatar
    }

    const finalUser = {
      ...oldUser,
      nickname,
      nickName: nickname,
      avatar,
      avatarUrl: avatar
    }

    const finalMe = {
      ...oldMe,
      nickname,
      nickName: nickname,
      avatar,
      avatarUrl: avatar
    }

    wx.setStorageSync('profile', finalProfile)
    wx.setStorageSync('userProfile', finalProfile)
    wx.setStorageSync('user_profile', finalProfile)
    wx.setStorageSync('user', finalUser)
    wx.setStorageSync('me', finalMe)
    wx.setStorageSync('nickname', nickname)
    wx.setStorageSync('avatar', avatar)

    const app = getApp()

    if (app.globalData) {
      app.globalData.profile = finalProfile
      app.globalData.user = {
        ...(app.globalData.user || {}),
        ...finalUser
      }
    }

    return finalProfile
  },

  /**
   * 尝试同步到后端。
   * 即使后端没有这个接口，也不影响本地保存成功。
   */
  syncProfileToBackend(profile, clearFields = []) {
    const app = getApp()

    if (!app || !app.request) {
      return Promise.resolve(false)
    }

    return app.request({
      url: '/profile/update',
      method: 'POST',
      data: { data: { ...profile }, clear_fields: clearFields },
      loading: false
    }).then(res => {
      const saved = this.normalizeProfile((res && res.profile) || profile)
      this.saveProfileToStorage(saved)
      return true
    }).catch(() => false)
  },

  buildAnswers(profile) {
    const exactOrRange = (exactKey, rangeKey, suffix = '') => {
      if (hasValue(profile[exactKey])) return `${formatMoney(profile[exactKey])}${suffix}`
      return rangeWithUnit(profile[rangeKey], suffix)
    }
    return [
      {
        key: 'age',
        k: '年龄',
        v: hasValue(profile.age) ? `${profile.age}岁` : (profile.age_range || '未填写'),
        rawValue: hasValue(profile.age) ? profile.age : '',
        term: '年龄对理财风险承受能力有什么影响'
      },
      {
        key: 'monthly_income',
        k: '月收入',
        v: exactOrRange('monthly_income', 'monthly_income_range', '元'),
        rawValue: hasValue(profile.monthly_income) ? profile.monthly_income : '',
        term: '月收入在养老理财规划中是什么意思'
      },
      {
        key: 'monthly_expense',
        k: '月支出',
        v: exactOrRange('monthly_expense', 'monthly_expense_range', '元'),
        rawValue: hasValue(profile.monthly_expense) ? profile.monthly_expense : '',
        term: '月支出对养老资金规划有什么影响'
      },
      {
        key: 'liquid_asset',
        k: '流动资金',
        v: exactOrRange('liquid_asset', 'liquid_asset_range', '元'),
        rawValue: hasValue(profile.liquid_asset) ? profile.liquid_asset : '',
        term: '流动资金是什么意思'
      },
      {
        key: 'fixed_asset',
        k: '固定资金',
        v: exactOrRange('fixed_asset', 'fixed_asset_range', '元'),
        rawValue: hasValue(profile.fixed_asset) ? profile.fixed_asset : '',
        term: '固定资金是什么意思'
      },
      {
        key: 'risk_preference',
        k: '风险偏好',
        v: profile.risk_preference || '未填写',
        rawValue: profile.risk_preference,
        term: '风险偏好是什么意思'
      },
      {
        key: 'money_time',
        k: '用钱时间',
        v: profile.money_time || '未填写',
        rawValue: profile.money_time,
        term: '用钱时间对理财产品期限有什么影响'
      },
      {
        key: 'child_support',
        k: '子女权限',
        v: profile.child_support ? this.permissionSummary(profile.child_permissions) : '未填写',
        rawValue: profile.child_support,
        term: '子女权限在家庭协同中是什么意思'
      }
    ]
  },

  buildProfileSummary(profile) {
    const age = optionalNumber(profile.age)
    const income = optionalNumber(profile.monthly_income)
    const expense = optionalNumber(profile.monthly_expense)
    const liquid = optionalNumber(profile.liquid_asset)
    const fixed = optionalNumber(profile.fixed_asset)
    const time = profile.money_time || ''
    const child = profile.child_support || ''
    const parts = []
    if (hasValue(age)) parts.push(`年龄${age}岁`)
    else if (profile.age_range) parts.push(`年龄${profile.age_range}`)
    if (hasValue(income)) parts.push(`月收入${simpleMoney(income)}元`)
    else if (profile.monthly_income_range) parts.push(`月收入${rangeWithUnit(profile.monthly_income_range, '元')}`)
    if (hasValue(expense)) parts.push(`月支出${simpleMoney(expense)}元`)
    else if (profile.monthly_expense_range) parts.push(`月支出${rangeWithUnit(profile.monthly_expense_range, '元')}`)
    if (hasValue(liquid)) parts.push(`流动资金${simpleMoney(liquid)}元`)
    else if (profile.liquid_asset_range) parts.push(`流动资金${rangeWithUnit(profile.liquid_asset_range, '元')}`)
    if (hasValue(fixed)) parts.push(`固定资金${simpleMoney(fixed)}元`)
    else if (profile.fixed_asset_range) parts.push(`固定资金${rangeWithUnit(profile.fixed_asset_range, '元')}`)
    if (profile.risk_preference) parts.push(`风险偏好${profile.risk_preference}`)
    if (time) parts.push(`用钱时间${time}`)
    if (child) parts.push(`子女协助${child}`)
    return parts.length ? `当前画像：${parts.join('；')}。` : '画像信息尚未填写，请完成问卷或点击字段补充真实数据。'
  },

  buildAnalysis(profile) {
    const incomeKnown = hasValue(profile.monthly_income)
    const expenseKnown = hasValue(profile.monthly_expense)
    const liquidKnown = hasValue(profile.liquid_asset)
    const fixedKnown = hasValue(profile.fixed_asset)
    const ageKnown = hasValue(profile.age)
    const income = incomeKnown ? toNumber(profile.monthly_income, 0) : 0
    const expense = expenseKnown ? toNumber(profile.monthly_expense, 0) : 0
    const liquid = liquidKnown ? toNumber(profile.liquid_asset, 0) : 0
    const fixed = fixedKnown ? toNumber(profile.fixed_asset, 0) : 0
    const risk = profile.risk_preference || ''
    const age = ageKnown ? toNumber(profile.age, 0) : 0
    const ageRange = String(profile.age_range || '')
    const time = profile.money_time || ''
    const child = profile.child_support || ''
    const questionnaireComplete = Boolean(
      (ageKnown || ageRange) &&
      (incomeKnown || profile.monthly_income_range) &&
      (expenseKnown || profile.monthly_expense_range) &&
      (liquidKnown || profile.liquid_asset_range) &&
      (fixedKnown || profile.fixed_asset_range) &&
      risk && time
    )
    if (!questionnaireComplete) {
      return {
        risk_score: '',
        risk_level: '待完善',
        level_desc: '画像信息不足',
        highlights: [],
        suggestion: '请先完成画像问卷，或点击画像字段填写真实数据。',
        summary: '',
        risk_reason: '当前信息不足，暂不生成风险分数和资产建议。',
        fraud_tip: '涉及转账、验证码或陌生链接时，请先暂停并通过官方渠道核验。',
        tags: []
      }
    }

    // ========== 综合风险评分 (0-100) ==========
    let score = 50

    // 1. 风险偏好 (权重最高)
    if (risk.includes('保守')) score += 0
    else if (risk.includes('稳健')) score += 15
    else if (risk.includes('积极') || risk.includes('进取')) score += 25

    // 2. 年龄因素：越大越保守
    if (ageKnown) {
      if (age >= 65) score -= 12
      else if (age >= 55) score -= 6
      else if (age >= 45) score += 0
      else if (age >= 35) score += 6
      else score += 10
    } else if (ageRange === '65岁以上') score -= 12
    else if (ageRange === '55-65岁') score -= 6
    else if (ageRange === '35-45岁') score += 6
    else if (ageRange === '35岁以下') score += 10

    // 3. 收支状况：结余越多越有配置空间
    const balance = income - expense
    const balanceRatio = income > 0 ? balance / income : 0
    if (incomeKnown && expenseKnown) {
      if (balanceRatio >= 0.4) score += 8
      else if (balanceRatio >= 0.2) score += 4
      else if (balanceRatio >= 0) score += 0
      else if (balanceRatio >= -0.2) score -= 5
      else score -= 10
    }

    // 4. 应急金覆盖月数
    const emergencyMonths = expense > 0 ? liquid / expense : 0
    if (expenseKnown && liquidKnown) {
      if (emergencyMonths >= 12) score += 8
      else if (emergencyMonths >= 6) score += 4
      else if (emergencyMonths >= 3) score += 0
      else score -= 6
    }

    // 5. 固定资金占比
    const totalAsset = liquid + fixed
    const fixedRatio = totalAsset > 0 ? fixed / totalAsset : 0
    if (liquidKnown && fixedKnown) {
      if (fixedRatio >= 0.6 && totalAsset > 100000) score += 6
      else if (fixedRatio >= 0.3) score += 2
    }

    // 6. 用钱时间
    if (time.includes('3年以上') || time.includes('3年')) score += 8
    else if (time.includes('1年')) score += 4
    else if (time.includes('半年')) score += 0
    else if (time.includes('3个月')) score -= 4
    else score -= 8

    // 7. 子女协助
    if (child.includes('完全')) score += 4
    else if (child.includes('部分')) score += 2
    else score += 0

    // 锁定范围
    if (score < 10) score = 10
    if (score > 95) score = 95

    // ========== 风险等级 ==========
    let level = '稳健型'
    let levelDesc = ''
    if (score <= 30) { level = '保守型'; levelDesc = '安全第一，保本优先' }
    else if (score <= 50) { level = '稳健型'; levelDesc = '稳中求进，控制波动' }
    else if (score <= 70) { level = '成长型'; levelDesc = '适度配置，兼顾增值' }
    else { level = '进取型'; levelDesc = '可承受波动，长期布局' }

    // ========== 分条要点 ==========
    const highlights = []
    highlights.push({ icon: '🎂', label: '年龄', value: ageKnown ? `${age}岁` : ageRange })
    if (incomeKnown && expenseKnown) {
      const balLabel = balance >= 0 ? `月结余${simpleMoney(balance)}` : `月缺口${simpleMoney(-balance)}`
      highlights.push({ icon: '💰', label: '收支', value: `月入${simpleMoney(income)} · 月出${simpleMoney(expense)} · ${balLabel}` })
    } else {
      highlights.push({ icon: '💰', label: '收支', value: `月入${rangeWithUnit(profile.monthly_income_range, '元')} · 月出${rangeWithUnit(profile.monthly_expense_range, '元')}` })
    }
    if (liquidKnown || fixedKnown) {
      const parts = []
      if (liquidKnown) parts.push(`活钱${simpleMoney(liquid)}`)
      if (fixedKnown) parts.push(`固资${simpleMoney(fixed)}`)
      highlights.push({ icon: '📊', label: '资金', value: parts.join('  ·  ') })
    } else {
      highlights.push({ icon: '📊', label: '资金', value: `活钱${rangeWithUnit(profile.liquid_asset_range, '元')} · 固资${rangeWithUnit(profile.fixed_asset_range, '元')}` })
    }
    highlights.push({ icon: '⏰', label: '用钱', value: time })
    if (child) highlights.push({ icon: '👨‍👩‍👧', label: '协助', value: child || '未填写' })

    // ========== 个性化建议 ==========
    let suggestion = ''
    let riskReason = ''

    if (level === '保守型') {
      suggestion = '建议以存款、国债、货币基金为主，保本是第一位。每月结余可定存或买国债，活钱放货币基金随时取用。'
      riskReason = '根据您填写的年龄、资金区间、风险偏好和用钱时间，建议安全优先、确保资金可取用。'
    } else if (level === '稳健型') {
      suggestion = '可在存款和国债基础上，少量配置银行稳健理财或纯债基金。牢记：看不懂的产品不碰，承诺高收益的不信。'
      riskReason = '根据您填写的画像，目前更适合稳中求进；具体金额完善后，再计算应急金覆盖情况。'
    } else if (level === '成长型') {
      suggestion = '国债和存款打底（占6成以上），余下可配置纯债基金或银行R2-R3理财。不建议超过三成资金放波动产品。'
      riskReason = '根据您填写的画像，可以适度配置，但仍需以安全为底线，控制波动产品比例。'
    } else {
      suggestion = '可用4-5成做存款国债保底，3-4成配置债券和混合基金，最多1-2成尝试指数基金。切记养老钱不宜全仓高风险。'
      riskReason = '根据您填写的风险偏好，可以接受一定波动，但仍需以安全为底座，不可集中冒险。'
    }

    // ========== 防诈提醒 ==========
    const fraudTips = {
      '保守型': '特别提醒：骗子常冒充银行或政府，说您的存款有风险要"转移"。任何让您转账到私人账户的都是诈骗。',
      '稳健型': '特别提醒：不要相信"保本高收益"的承诺。国债、存款是真正保本的，其他产品都有波动。',
      '成长型': '特别提醒：对不熟悉的理财产品，先通过银行官方渠道核实，不要点陌生链接或扫码。',
      '进取型': '特别提醒：高收益必然伴随高风险。不要把所有养老钱放进一个产品，分散配置才能安稳。'
    }

    // ========== 标签 ==========
    const tags = ['安全优先', '白话解释']
    if (expenseKnown && liquidKnown) {
      if (emergencyMonths >= 6) tags.push('应急充足')
      else tags.push('建议补应急金')
    }
    if ((ageKnown && age >= 60) || ageRange === '65岁以上' || ageRange === '55-65岁') tags.push('适老产品')
    if (child && child !== '无需协助') tags.push('亲情协同')
    if (time.includes('年')) tags.push('可做期限搭配')
    if (fixedKnown && fixed > 100000) tags.push('可分层配置')

    return {
      risk_score: score,
      risk_level: level,
      level_desc: levelDesc,
      highlights,
      suggestion,
      summary: '',
      risk_reason: riskReason,
      fraud_tip: fraudTips[level] || fraudTips['稳健型'],
      tags
    }
  },

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    termHelper.handleDoubleTap(this, e, {
      term,
      nearbyText: () => this.data.profileSummary || '',
      scene: 'profile'
    })
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  explainProfile() {
    const text = `请结合我的画像解释我的风险评估结果。我的画像是：${this.data.profileSummary}`

    wx.navigateTo({
      url: `/pages/assistant/assistant?ask=${encodeURIComponent(text)}&from=profile`
    })
  },

  // 点击风险评估卡朗读
  readAnalysis() {
    const a = this.data.analysis
    if (a.risk_score === '') {
      getApp().readText('画像信息还没有填写完整，暂时不生成风险分数。')
      return
    }
    const parts = [`风险评估：${a.risk_score}分，${a.risk_level}`]
    if (a.highlights && a.highlights.length) {
      a.highlights.forEach(h => { parts.push(`${h.label}：${h.value}`) })
    }
    if (a.suggestion) parts.push(`建议：${a.suggestion}`)
    getApp().readText(parts.join('。'))
  },

  // 点击防诈提醒卡朗读
  readFraud() {
    const tip = this.data.analysis.fraud_tip || '暂无防诈提醒'
    getApp().readText(`防诈提醒：${tip}`)
  },

  // 微信头像选择回调
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    if (!avatarUrl) return
    const app = getApp()
    const token = wx.getStorageSync('token') || ''
    wx.showLoading({ title: '上传头像中', mask: true })
    wx.uploadFile({
      url: app.globalData.baseUrl + '/user/avatar/upload',
      filePath: avatarUrl,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: res => {
        try {
          const data = JSON.parse(res.data || '{}')
          if (!data.ok || !data.avatar) throw new Error('upload failed')
          const savedAvatar = cleanAvatar(data.avatar)
          const profile = { ...this.data.profile, ...(data.profile || {}), avatar: savedAvatar, avatarUrl: savedAvatar }
          const saved = this.saveProfileToStorage(profile)
          this.setData({ profile: this.normalizeProfile(saved) })
          wx.showToast({ title: '头像已保存', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: '头像上传失败', icon: 'none' })
        }
      },
      fail: () => wx.showToast({ title: '头像上传失败', icon: 'none' }),
      complete: () => wx.hideLoading()
    })
  },

  // 微信昵称输入回调
  onNicknameInput(e) {
    const val = e.detail.value
    if (val) {
      const profile = { ...this.data.profile, nickname: val, nickName: val }
      this.setData({ profile: profile })
    }
  },

  // 昵称失焦时保存
  onNicknameBlur(e) {
    const val = (e.detail.value || '').trim()
    if (!val) return
    const profile = { ...this.data.profile, nickname: val, nickName: val }
    this._profileRevision = (this._profileRevision || 0) + 1
    const saved = this.saveProfileToStorage(profile)
    this.setData({ profile: this.normalizeProfile(saved) })
    this.syncProfileToBackend(saved).then(ok => wx.showToast({ title: ok ? '昵称已保存' : '保存失败，请检查网络', icon: ok ? 'success' : 'none' }))
  },

  editProfileField(e) {
    const key = e.currentTarget.dataset.key
    const label = e.currentTarget.dataset.label
    const value = e.currentTarget.dataset.value

    let type = 'text'
    let options = []

    if (['age', 'monthly_income', 'monthly_expense', 'liquid_asset', 'fixed_asset'].includes(key)) {
      type = 'number'
    }

    if (key === 'risk_preference') {
      type = 'choice'
      options = ['保守', '稳健', '积极']
    }

    if (key === 'money_time') {
      type = 'choice'
      options = ['1个月内', '3个月内', '半年', '1年', '3年以上']
    }

    if (key === 'child_support') {
      if ((wx.getStorageSync('role') || 'elder') !== 'elder') {
        wx.showModal({ title: '权限由长辈设置', content: '子女端只能查看长辈已经开放的权限，不能修改。', showCancel: false, confirmText: '知道了' })
        return
      }
      this.setData({
        showChildPermissionPanel: true,
        childPermissions: Object.assign({ positions: true, ledger: true, risk: true, messages: true, groupChat: true, health: false, location: false }, this.data.profile.child_permissions || {})
      })
      return
    }

    this.setData({
      showEditPanel: true,
      editFieldKey: key,
      editFieldLabel: label,
      editFieldValue: value === undefined || value === null ? '' : String(value),
      editFieldType: type,
      editFieldOptions: options
    })
  },

  permissionSummary(value) {
    const permissions = Object.assign({ positions: true, ledger: true, risk: true, messages: true, groupChat: true, health: false, location: false }, value || {})
    const labels = []
    if (permissions.positions) labels.push('理财记录')
    if (permissions.ledger) labels.push('日常收支')
    if (permissions.risk) labels.push('风险提示')
    if (permissions.messages) labels.push('留言')
    if (permissions.groupChat) labels.push('群聊')
    if (permissions.health) labels.push('健康')
    if (permissions.location) labels.push('位置')
    return labels.length ? labels.join('、') : '暂不授权'
  },

  toggleChildPermission(e) {
    const key = e.currentTarget.dataset.key
    if (key) this.setData({ [`childPermissions.${key}`]: !!e.detail.value })
  },

  closeChildPermissionPanel() { this.setData({ showChildPermissionPanel: false }) },

  saveChildPermissions() {
    if ((wx.getStorageSync('role') || 'elder') !== 'elder') {
      this.setData({ showChildPermissionPanel: false })
      wx.showModal({ title: '权限由长辈设置', content: '子女端不能修改长辈授权。', showCancel: false, confirmText: '知道了' })
      return
    }
    const permissions = Object.assign({}, this.data.childPermissions)
    const profile = this.normalizeProfile(Object.assign({}, this.data.profile, {
      child_permissions: permissions,
      child_support: Object.keys(permissions).some(key => permissions[key]) ? '按项授权' : '无需协助'
    }))
    this.saveProfileToStorage(profile)
    this.setData({ showChildPermissionPanel: false, profile, answers: this.buildAnswers(profile) })
    this.syncProfileToBackend(profile)
    getApp().request({ url: '/family/members', loading: false }).then(res => {
      ;(res.items || []).forEach(member => {
        if (!member.binding_id) return
        getApp().request({
          url: `/family/bindings/${member.binding_id}/permissions`,
          method: 'PUT',
          data: { permissions: Object.assign({}, member.permissions || {}, {
            view_positions: permissions.positions,
            view_ledger_summary: permissions.ledger,
            receive_alerts: permissions.risk,
            view_messages: permissions.messages,
            view_group_chat: permissions.groupChat,
            view_health: permissions.health,
            view_location: permissions.location
          }) },
          loading: false
        }).catch(() => {})
      })
    }).catch(() => {})
    wx.showToast({ title: '子女权限已保存', icon: 'success' })
  },

  loadFamilyBinding() {
    if (!wx.getStorageSync('token')) return
    getApp().request({ url: '/family/members', loading: false }).then(res => {
      const members = res.items || []
      const first = members.find(item => item && item.permissions)
      if (!first) {
        this.setData({ familyMembers: members })
        return
      }
      const source = first.permissions || {}
      const childPermissions = {
        positions: source.view_positions === undefined ? true : !!source.view_positions,
        ledger: source.view_ledger_summary === undefined ? true : !!source.view_ledger_summary,
        risk: source.receive_alerts === undefined ? true : !!source.receive_alerts,
        messages: source.view_messages === undefined ? true : !!source.view_messages,
        groupChat: source.view_group_chat === undefined ? true : !!source.view_group_chat,
        health: !!source.view_health,
        location: !!source.view_location
      }
      const profile = this.normalizeProfile(Object.assign({}, this.data.profile, { child_permissions: childPermissions }))
      this.setData({ familyMembers: members, childPermissions, profile, answers: this.buildAnswers(profile) })
    }).catch(() => {})
    getApp().request({ url: '/family/bind-code', loading: false }).then(res => {
      const familyCode = String(res.code || '')
      this.setData({ familyCode })
      if (familyCode) wx.setStorageSync('family_code', familyCode)
    }).catch(() => {})
  },

  copyFamilyCode() {
    if (!this.data.familyCode) return this.refreshFamilyCode()
    wx.setClipboardData({ data: this.data.familyCode })
  },

  refreshFamilyCode() {
    getApp().request({ url: '/family/bind-code/refresh', method: 'POST', loading: true }).then(res => {
      this.setData({ familyCode: String(res.code || '') })
      wx.showToast({ title: '已生成新绑定码', icon: 'success' })
    })
  },

  promptFamilyCode() {
    wx.showModal({
      title: '输入另一位长辈的绑定码', editable: true, placeholderText: '请输入6位绑定码',
      success: res => {
        if (!res.confirm) return
        const code = String(res.content || '').trim()
        if (!/^\d{6}$/.test(code)) return wx.showToast({ title: '请输入6位绑定码', icon: 'none' })
        getApp().request({ url: '/family/bind/accept-code', method: 'POST', data: { code, relation: '长辈' }, loading: true }).then(() => {
          wx.showToast({ title: '家庭已连接', icon: 'success' })
          this.loadFamilyBinding()
        }).catch(() => wx.showToast({ title: '绑定码无效或已使用', icon: 'none' }))
      }
    })
  },

  onEditFieldInput(e) {
    this.setData({
      editFieldValue: e.detail.value
    })
  },

  chooseEditOption(e) {
    this.setData({
      editFieldValue: e.currentTarget.dataset.value
    })
  },

  cancelEditField() {
    this.setData({
      showEditPanel: false,
      editFieldKey: '',
      editFieldLabel: '',
      editFieldValue: '',
      editFieldType: 'text',
      editFieldOptions: []
    })
  },

  stopTap() {},

  confirmEditField() {
    const key = this.data.editFieldKey
    let value = String(this.data.editFieldValue === undefined ? '' : this.data.editFieldValue).trim()

    if (!key) return

    if (['age', 'monthly_income', 'monthly_expense', 'liquid_asset', 'fixed_asset'].includes(key)) {
      if (!value) {
        wx.showToast({ title: '请填写真实数值', icon: 'none' })
        return
      }
      value = toNumber(value, NaN)

      if (Number.isNaN(value)) {
        wx.showToast({
          title: '请输入数字',
          icon: 'none'
        })
        return
      }
      if (key === 'age' && (!Number.isInteger(value) || value < 1 || value > 120)) {
        wx.showToast({ title: '年龄须为1到120的整数', icon: 'none' })
        return
      }
      if (key !== 'age' && (value < 0 || value > 1000000000000)) {
        wx.showToast({ title: '金额须为非负有效数值', icon: 'none' })
        return
      }
    }
    if (this.data.editFieldType === 'choice' && !(this.data.editFieldOptions || []).includes(value)) {
      wx.showToast({ title: '请选择有效选项', icon: 'none' })
      return
    }

    const profile = {
      ...this.data.profile,
      [key]: value,
      profile_source: 'manual'
    }
    const rangeKeyMap = {
      age: 'age_range',
      monthly_income: 'monthly_income_range',
      monthly_expense: 'monthly_expense_range',
      liquid_asset: 'liquid_asset_range',
      fixed_asset: 'fixed_asset_range'
    }
    const aliasKeyMap = {
      monthly_income: 'income',
      monthly_expense: 'expense',
      liquid_asset: 'liquid',
      fixed_asset: 'fixed'
    }
    const clearedRange = rangeKeyMap[key]
    const clearedAlias = aliasKeyMap[key]
    if (clearedRange) delete profile[clearedRange]
    if (clearedAlias) delete profile[clearedAlias]

    this._profileRevision = (this._profileRevision || 0) + 1

    const savedProfile = this.saveProfileToStorage(profile)
    const newProfile = this.normalizeProfile(savedProfile)

    const analysis = this.buildAnalysis(newProfile)
    const answers = this.buildAnswers(newProfile)
    const profileSummary = this.buildProfileSummary(newProfile)

    this.setData({
      profile: newProfile,
      editNickname: newProfile.nickname,
      analysis,
      answers,
      profileSummary,
      showEditPanel: false,
      editFieldKey: '',
      editFieldLabel: '',
      editFieldValue: '',
      editFieldType: 'text',
      editFieldOptions: []
    })

    this.syncProfileToBackend(newProfile, [clearedRange, clearedAlias].filter(Boolean)).then(ok => {
      wx.showToast({ title: ok ? '画像已保存' : '保存失败，请检查网络', icon: ok ? 'success' : 'none' })
    })
  },

  editAssets() {
    wx.showToast({
      title: '点击右侧数值即可修改',
      icon: 'none'
    })
  },

  editRisk() {
    wx.navigateTo({
      url: '/pages/questionnaire/questionnaire'
    })
  },

  goHome() {
    wx.redirectTo({ url: '/pages/index/index' })
    getApp().readText('首页')
  },

  goAssistant() {
    wx.redirectTo({ url: '/pages/assistant/assistant' })
    getApp().readText('问小享')
  },

  goFinance() {
    wx.redirectTo({ url: '/pages/finance/finance' })
    getApp().readText('钱生钱')
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录。长辈端和子女端都可以用手机号或微信登录。',
      confirmText: '退出',
      success: (res) => {
        if (!res.confirm) return
        const app = getApp()
        const keys = [
          'token',
          'user',
          'role',
          'profile',
          'userProfile',
          'user_profile',
          'me',
          'nickname',
          'avatar',
          'risk_answers'
        ]

        keys.forEach(key => wx.removeStorageSync(key))

        if (app.globalData) {
          app.globalData.token = ''
          app.globalData.user = null
          app.globalData.profile = null
          app.globalData.role = 'elder'
        }
        wx.reLaunch({ url: '/pages/login/login?role=elder' })
      }
    })
  },

  // 点击当前页导航朗读
  readNav(e) {
    getApp().readText(e.currentTarget.dataset.label || '')
  },

  // ---- 语音输入 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/assistant/assistant?question=' + encodeURIComponent(text),
        fail: (err) => {
          console.error('[画像] 语音跳转失败:', err)
          wx.showToast({ title: '跳转失败，请重试', icon: 'none' })
        }
      })
    }, 100)
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})
