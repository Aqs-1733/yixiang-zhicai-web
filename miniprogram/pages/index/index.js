const api = require('../../utils/api.js')
const termHelper = require('../../utils/termExplain.js')
const { DEFAULT_CITY, DEFAULT_LOCATION } = require('../../utils/mapConfig.js')

function fmtDate() {
  const d = new Date()
  const week = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week}`
}

// 每日一课视频库 - 8个视频循环播放
const LESSON_VIDEOS = [
  {
    id: 1,
    title: '每日一课：别被高收益话术带着走',
    summary: '每日一课 · 防诈骗和稳健理财',
    content: '看产品时先看机构、风险等级和到账方式，不被高收益话术带节奏。',
    video_title: '防诈骗第一课：识别高收益陷阱',
    video_url: 'https://resource.lndx.edu.cn/media/c936c606792da54629b9d925181d26d3/play/760e34622d985d8ba4f2e6c7bbfea422.m3u8'
  },
  {
    id: 2,
    title: '每日一课：如何识别正规金融机构',
    summary: '每日一课 · 金融知识科普',
    content: '选择正规持牌机构，保护您的养老钱安全。',
    video_title: '如何识别正规金融机构',
    video_url: 'https://resource.lndx.edu.cn/media/44ebd9c760715a869fc6ca4a4771f635/play/93614a77272373765040e5077d597f2f.m3u8'
  },
  {
    id: 3,
    title: '每日一课：养老理财怎么选',
    summary: '每日一课 · 理财知识',
    content: '根据风险偏好选择适合自己的养老理财产品。',
    video_title: '养老理财产品选择指南',
    video_url: 'https://resource.lndx.edu.cn/media/280da38b97ae1dd0d72a0c404c525781/play/8edd2344885ada7fad1633f612e6d8c8.m3u8'
  },
  {
    id: 4,
    title: '每日一课：警惕养老诈骗新套路',
    summary: '每日一课 · 防诈骗专题',
    content: '了解常见的养老诈骗套路，保护财产安全。',
    video_title: '养老诈骗常见套路解析',
    video_url: 'https://resource.lndx.edu.cn/media/89ff25977e30513df8295be3982643bf/play/d7b4ae97078097b2e12af96011cd2944.m3u8'
  },
  {
    id: 5,
    title: '每日一课：银行存款知识科普',
    summary: '每日一课 · 存款知识',
    content: '了解存款类型、利率计算和安全保障。',
    video_title: '银行存款基础知识',
    video_url: 'https://resource.lndx.edu.cn/media/f1dcb14dc114aeef97edc81744c766db/play/b6475abac28986d9023ce52d982bed75.m3u8'
  },
  {
    id: 6,
    title: '每日一课：如何看懂理财说明书',
    summary: '每日一课 · 理财技巧',
    content: '教您读懂产品说明书，了解风险等级和收益规则。',
    video_title: '理财说明书解读',
    video_url: 'https://resource.lndx.edu.cn/media/68ab41f7dbfbf4f822d3fe98101b6ac1/play/6131349d6b8a3ba4a8cce1b4acf640d5.m3u8'
  },
  {
    id: 7,
    title: '每日一课：家庭财务规划入门',
    summary: '每日一课 · 财务规划',
    content: '合理规划家庭收支，为养老生活做好准备。',
    video_title: '家庭财务规划基础',
    video_url: 'https://resource.lndx.edu.cn/media/35edadf4cff7c4875fa120a176949f39/play/31a60b0de05686c6313d4fe0083d6790.m3u8'
  },
  {
    id: 8,
    title: '每日一课：保护个人金融信息',
    summary: '每日一课 · 信息安全',
    content: '学会保护银行卡、密码等重要金融信息。',
    video_title: '个人金融信息安全',
    video_url: 'https://resource.lndx.edu.cn/media/c893ead36014fd48004e87c0aa53be6e/play/7bae48bab6e844b9360cb420fdd2b105.m3u8'
  }
]

// 获取今日课程（根据日期计算，8天循环）
function getTodayLesson() {
  const today = new Date()
  // 计算从某个固定日期开始的天数，用于确定播放哪个视频
  const startDate = new Date('2024-01-01')
  const diffTime = today.getTime() - startDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const index = diffDays % LESSON_VIDEOS.length
  return LESSON_VIDEOS[index]
}

function getDefaultLessonVideoUrl() {
  return getTodayLesson().video_url
}

function mergeLessonData(base, remote = {}) {
  const next = {
    ...base
  }

  Object.keys(remote || {}).forEach(key => {
    const value = remote[key]
    if (value === undefined || value === null || value === '') return
    next[key] = value
  })

  return next
}

function toNumber(v, def = 0) {
  if (v === undefined || v === null || v === '') return def
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isNaN(n) ? def : n
}

function formatMoney(num) {
  num = toNumber(num, 0)
  return num.toLocaleString()
}

function formatVideoTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function cleanNickname(name) {
  name = String(name || '').trim()

  if (
    !name ||
    name === 'undefined' ||
    name === 'null' ||
    name === '微信用户'
  ) {
    return '您'
  }

  return name
}

function getSavedNickname() {
  const profile = wx.getStorageSync('profile') || {}
  const userProfile = wx.getStorageSync('userProfile') || {}
  const userProfile2 = wx.getStorageSync('user_profile') || {}
  const user = wx.getStorageSync('user') || {}
  const me = wx.getStorageSync('me') || {}

  return cleanNickname(
    wx.getStorageSync('nickname') ||
      profile.nickname ||
      profile.nickName ||
      userProfile.nickname ||
      userProfile.nickName ||
      userProfile2.nickname ||
      userProfile2.nickName ||
      user.nickname ||
      user.nickName ||
      me.nickname ||
      me.nickName ||
      '您'
  )
}

function getLocalProfile() {
  const profile = wx.getStorageSync('profile') || {}
  const userProfile = wx.getStorageSync('userProfile') || {}
  const userProfile2 = wx.getStorageSync('user_profile') || {}
  const user = wx.getStorageSync('user') || {}
  const me = wx.getStorageSync('me') || {}

  const nickname = getSavedNickname()

  return {
    ...user,
    ...me,
    ...userProfile2,
    ...userProfile,
    ...profile,
    nickname,
    nickName: nickname
  }
}

function saveProfileEverywhere(profile) {
  const oldUser = wx.getStorageSync('user') || {}
  const oldMe = wx.getStorageSync('me') || {}

  const nickname = cleanNickname(profile.nickname || profile.nickName)

  const finalProfile = {
    ...profile,
    nickname,
    nickName: nickname
  }

  wx.setStorageSync('profile', finalProfile)
  wx.setStorageSync('userProfile', finalProfile)
  wx.setStorageSync('user_profile', finalProfile)
  wx.setStorageSync('nickname', nickname)

  wx.setStorageSync('user', {
    ...oldUser,
    nickname,
    nickName: nickname
  })

  wx.setStorageSync('me', {
    ...oldMe,
    nickname,
    nickName: nickname
  })

  const app = getApp()

  if (app.globalData) {
    app.globalData.profile = finalProfile
    app.globalData.user = {
      ...(app.globalData.user || {}),
      nickname,
      nickName: nickname
    }
  }

  return finalProfile
}

/**
 * 根据用户画像生成首页资产概览
 */
function buildOverviewFromProfile(profile) {
  const has = value => value !== undefined && value !== null && value !== ''
  const liquidValue = has(profile.liquid_asset) ? profile.liquid_asset : profile.liquid
  const fixedValue = has(profile.fixed_asset) ? profile.fixed_asset : profile.fixed
  const totalValue = has(profile.total_asset) ? profile.total_asset : profile.total
  const hasLiquid = has(liquidValue)
  const hasFixed = has(fixedValue)
  const hasTotal = has(totalValue)
  if (!hasLiquid && !hasFixed && !hasTotal) {
    return { total_text: '--', today_gain_text: '--', deposit_text: '--', finance_text: '--', fund_text: '--', safe_ratio: 0 }
  }
  const liquid = hasLiquid ? toNumber(liquidValue, 0) : 0
  const fixed = hasFixed ? toNumber(fixedValue, 0) : 0
  const total = hasTotal ? toNumber(totalValue, 0) : liquid + fixed

  return {
    total_text: formatMoney(total),
    today_gain_text: '--',
    deposit_text: hasLiquid ? formatMoney(liquid) : '--',
    finance_text: hasFixed ? formatMoney(fixed) : '--',
    fund_text: '--',
    safe_ratio: 0
  }
}

/**
 * 根据画像生成"小享给您推荐"
 */
function buildRecommendFromProfile(profile) {
  const has = value => value !== undefined && value !== null && value !== ''
  const age = has(profile.age) ? toNumber(profile.age, 0) : 0
  const income = has(profile.monthly_income) ? toNumber(profile.monthly_income, 0) : null
  const expense = has(profile.monthly_expense) ? toNumber(profile.monthly_expense, 0) : null
  const liquid = has(profile.liquid_asset) ? toNumber(profile.liquid_asset, 0) : null
  const risk = String(profile.risk_preference || profile.riskLevel || '')

  let content = '请先完成画像问卷或补充真实数据，小享再按您的情况给建议。'

  if (income !== null && expense !== null && income < expense) {
    content = '本月支出高于收入，建议先控制日常支出，暂缓新增理财。'
  } else if (liquid !== null && expense !== null && liquid < expense * 6) {
    content = '建议先补足6个月生活备用金，再考虑长期理财。'
  } else if (age >= 65 || risk.includes('保守')) {
    content = '建议以存款、国债等低风险产品为主，少碰高收益诱导。'
  } else if (risk.includes('稳健')) {
    content = '建议存款、国债和稳健理财搭配，保证安全和灵活取用。'
  } else if (risk.includes('积极') || risk.includes('进取')) {
    content = '可适当配置低波动基金，但养老钱不要放进高风险产品。'
  }

  return {
    title: '小享给您推荐 ✨',
    content
  }
}

function decorateArticles(articles) {
  return (articles || []).map(item => ({
    ...item,
    displaySummary: item.summary || (item.title || '').slice(0, 42),
    sourceText: item.source || '新闻API',
    timeText: item.time || item.published_at || '',
    titleSegments: termHelper.buildTermSegments(item.title || ''),
    summarySegments: termHelper.buildTermSegments(item.summary || '')
  }))
}

Page({
  data: {
    homeLessonVideoBroken: false,
    lessonVideoPlaying: false,
    lessonCurrentTime: 0,
    lessonDuration: 0,
    lessonTimeText: '0:00 / 0:00',
    globalFontLabel: '标准字',
    globalFontPageClass: 'font-global-normal',
    nickname: '您',
    groupUnreadCount: 0,
    showFamilyPanel: false,
    familyCode: '',
    familyMembers: [],
    showHomePermissionPanel: false,
    permissionTarget: null,
    permissionDraft: {},
    showMessageModal: false,
    messagePeerId: 0,
    todayText: fmtDate(),

    overview: {
      total_text: '--',
      today_gain_text: '--',
      deposit_text: '--',
      finance_text: '--',
      fund_text: '--',
      safe_ratio: 0
    },

    recommend: {
      title: '小享给您推荐 ✨',
      content: '请先完成画像问卷或补充真实数据，小享再按您的情况给建议。'
    },

    lesson: {
      title: '',
      summary: '',
      content: '',
      video_title: '',
      video_url: '',
      video_tip: '每日更新理财知识视频，帮助您更好地管理财富。'
    },
    articles: [],
    newsMessage: '正在获取官方资讯',
    newsStatus:'正在核对',
    newsFetchedAt:'',
    weatherCard: {
      loading: true,
      city: DEFAULT_CITY,
      date: '',
      weather: '',
      temp: '',
      updated: ''
    },
    lessonList: LESSON_VIDEOS,
    showLessonPicker: false,
    lessonTitleSegments: [],
    termExplainPopups: [],

    // 课程循环信息
    lessonInfo: {
      currentIndex: 0,
      totalCount: LESSON_VIDEOS.length
    }
  },

  onShow() {
    if ((wx.getStorageSync('role') || 'elder') === 'child') {
      wx.redirectTo({ url: '/pages/child/index/index' })
      return
    }
    this.syncGlobalFont()
    this.resetHomeLessonVideoState()
    this.load()
    getApp().checkFamilyGroupUnread(true).then(count => this.setData({ groupUnreadCount: count }))
    if (wx.getStorageSync('openElderPermissionPanel')) {
      wx.removeStorageSync('openElderPermissionPanel')
      setTimeout(() => {
        this._openPermissionAfterFamilyLoad = true
        this.openFamilyPanel()
      }, 120)
    }
  },

  onHide() {
    this.resetHomeLessonVideoState()
  },

  onUnload() {
    this.resetHomeLessonVideoState()
  },

  load() {
    const app = getApp()

    const localProfile = getLocalProfile()
    const nickname = cleanNickname(localProfile.nickname || localProfile.nickName)

    // 获取今日课程（8个视频循环）
    const todayLesson = getTodayLesson()
    const today = new Date()
    const startDate = new Date('2024-01-01')
    const diffTime = today.getTime() - startDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    const currentIndex = diffDays % LESSON_VIDEOS.length

    const lesson = {
      ...todayLesson,
      video_tip: `今日课程 ${currentIndex + 1}/${LESSON_VIDEOS.length} · 每日更新`
    }

    this.setData({
      nickname,
      todayText: fmtDate(),
      overview: buildOverviewFromProfile(localProfile),
      recommend: buildRecommendFromProfile(localProfile),
      homeLessonVideoBroken: false,
      lesson,
      lessonTitleSegments: termHelper.buildTermSegments(lesson.title || ''),
      lessonInfo: {
        currentIndex: currentIndex + 1,
        totalCount: LESSON_VIDEOS.length
      }
    })

    this.loadHomeWeather()
    this.loadFamilyMemberCache()

    // 尝试从服务器获取课程（服务器优先级更高）
    app.request({
      url: '/lesson/today'
    }).then(res => {
      const remoteOptions = (res.video_options || []).map((item, idx) => ({
        ...item,
        id: item.id || idx + 1,
        title: item.title || `课程${idx + 1}`,
        summary: '理财课堂 · 视频学习',
        content: item.title || '理财课堂视频',
        video_title: item.title || `课程${idx + 1}`,
        video_url: item.url || item.video_url || ''
      })).filter(item => item.video_url)
      const remoteLesson = mergeLessonData(this.data.lesson, res)
      this.setData({
        lesson: remoteLesson,
        lessonTitleSegments: termHelper.buildTermSegments(remoteLesson.title || ''),
        lessonList: remoteOptions.length ? remoteOptions : this.data.lessonList,
        lessonInfo: remoteOptions.length ? { currentIndex: Math.max(0, remoteOptions.findIndex(item => item.video_url === remoteLesson.video_url)) + 1, totalCount: remoteOptions.length } : this.data.lessonInfo,
        homeLessonVideoBroken: false
      })
    }).catch(() => {
      // 使用本地循环课程，不显示错误
    })

    app.request({
      url: '/profile/me'
    }).then(res => {
      const oldProfile = getLocalProfile()

      const serverProfile = res.profile || {}
      const serverUser = res.user || {}

      const finalNickname = cleanNickname(
        getSavedNickname() ||
          serverProfile.nickname ||
          serverProfile.nickName ||
          serverUser.nickname ||
          serverUser.nickName ||
          '您'
      )

      const finalProfile = saveProfileEverywhere({
        ...serverProfile,
        nickname: finalNickname,
        nickName: finalNickname
      })

      this.setData({
        nickname: finalNickname,
        overview: buildOverviewFromProfile(finalProfile),
        recommend: buildRecommendFromProfile(finalProfile)
      })
    }).catch(() => {
      const profile = getLocalProfile()

      this.setData({
        nickname: getSavedNickname(),
        overview: buildOverviewFromProfile(profile),
        recommend: buildRecommendFromProfile(profile)
      })
    })

    const cachedArticles = wx.getStorageSync('home_articles') || []
    if (this._newsLoaded && Date.now()-new Date(wx.getStorageSync('home_news_fetched')||0).getTime()<600000) {
      this.setData({ articles: cachedArticles, newsStatus:'已缓存', newsFetchedAt:wx.getStorageSync('home_news_fetched')||'', newsMessage: cachedArticles.length ? '' : '暂无已核实资讯' })
    } else {
      this._newsLoaded = true
      app.request({ url: '/market/daily' }).then(res => {
        const rawItems = res && res.success !== false ? (res.items || []) : []
        const articles = decorateArticles(rawItems.slice(0, 4))
        wx.setStorageSync('home_articles', articles)
        wx.setStorageSync('home_news_fetched',res.fetched_at||'')
        this.setData({
          articles,
          newsStatus:articles.length?(res.stale?'缓存资讯':'来源已核对'):'暂未取得',
          newsFetchedAt:res.fetched_at||'',
          newsMessage: articles.length ? '' : (res.message || '暂未取得官方资讯')
        })
      }).catch(() => {
        this.setData({
          articles: cachedArticles,
          newsStatus:'离线缓存', newsMessage: cachedArticles.length ? '网络暂时不可用，显示上次资讯' : '暂未取得官方资讯'
        })
      })
    }
  },

  loadFamilyMemberCache() {
    const user = wx.getStorageSync('user') || {}
    if (!user.id) return
    getApp().request({ url: '/family/members', loading: false }).then(res => {
      if ((res.items || []).length) wx.setStorageSync(`bound_family_members_${user.id}`, res.items)
    }).catch(() => {})
  },

  openMessageModal(e) {
    const peerId = Number(e && e.currentTarget && e.currentTarget.dataset.peerId || 0)
    this.setData({ showMessageModal: true, messagePeerId: peerId })
  },

  closeMessageModal() {
    this.setData({ showMessageModal: false, messagePeerId: 0 })
  },

  loadHomeWeather() {
    this.setData({
      weatherCard: {
        ...this.data.weatherCard,
        loading: true,
        date: fmtDate()
      }
    })

    // 获取真实位置
    wx.getLocation({
      type: 'gcj02',
      success: (loc) => {
        this.fetchWeather(loc.latitude, loc.longitude, DEFAULT_CITY)
        this.saveElderPhoneLocation(loc)
      },
      fail: () => {
        this.fetchWeather(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude, DEFAULT_CITY)
      }
    })
  },

  saveElderPhoneLocation(loc) {
    if (!wx.getStorageSync('token') || (wx.getStorageSync('role') || 'elder') !== 'elder') return
    const lastSaved = Number(wx.getStorageSync('elder_location_saved_at') || 0)
    if (Date.now() - lastSaved < 10 * 60 * 1000) return
    const latitude = Number(loc && loc.latitude)
    const longitude = Number(loc && loc.longitude)
    if (!latitude || !longitude) return
    const app = getApp()
    app.request({
      url: '/lbs/reverse-geocode',
      data: { latitude, longitude },
      loading: false
    }).catch(() => ({ address: '手机定位' })).then(result => {
      return app.request({
        url: '/profile/location',
        method: 'POST',
        data: { latitude, longitude, address: result.address || '手机定位', source: 'elder_phone' },
        loading: false
      })
    }).then(() => wx.setStorageSync('elder_location_saved_at', Date.now())).catch(() => {})
  },

  fetchWeather(latitude, longitude, city) {
    const app = getApp()
    if (app && app.request) {
      app.request({
        url: '/weather/today',
        data: { latitude, longitude, city },
        loading: false
      }).then(res => {
        if (!res || res.ok === false) throw new Error(res && res.message ? res.message : 'weather_failed')
        this.setData({
          weatherCard: {
            loading: false,
            city: res.city || city || DEFAULT_CITY,
            date: fmtDate(),
            weather: res.weather || '',
            temp: res.temperature || res.temp || ''
          }
        })
      }).catch(() => {
        this.fallbackWeather(city)
      })
      return
    }
    this.fallbackWeather(city)
  },

  fallbackWeather(city) {
    this.setData({
      weatherCard: {
        loading: false,
        city: city || DEFAULT_CITY,
        date: fmtDate(),
        weather: '晴',
        temp: '26℃'
      }
    })
  },

  refreshHomeWeather() {
    this.loadHomeWeather()
  },

  syncGlobalFont() {
    const font = getApp().getGlobalFontSetting()
    this.setData({
      globalFontLabel: font.label,
      globalFontPageClass: font.pageClass
    })
  },

  toggleGlobalFontSize() {
    const font = getApp().cycleGlobalFontSize()
    this.setData({
      globalFontLabel: font.label,
      globalFontPageClass: font.pageClass
    })

    wx.showToast({
      title: `已切换为${font.label}`,
      icon: 'none'
    })
  },

  // 点击每日一课标题朗读
  readLesson() {
    const title = this.data.lesson.title || '每日一课'
    getApp().readText(`每日一课：${title}`)
  },

  switchLessonVideo(e) {
    const index = Number(e.currentTarget.dataset.index)
    const lessonList = this.data.lessonList || LESSON_VIDEOS
    if (Number.isNaN(index) || !lessonList[index]) return
    const nextLesson = lessonList[index]
    this.resetHomeLessonVideoState()
    this.setData({
      lesson: {
        ...nextLesson,
        video_tip: `课程 ${index + 1}/${lessonList.length}`
      },
      lessonTitleSegments: termHelper.buildTermSegments(nextLesson.title || ''),
      lessonInfo: {
        currentIndex: index + 1,
        totalCount: lessonList.length
      },
      homeLessonVideoBroken: false
    })
    this.closeLessonPicker()
  },

  showLessonSource() {
    const item=this.data.lessonList[this.data.lessonInfo.currentIndex-1]||{}
    wx.showModal({title:'课程来源',content:[item.title,item.source||'原始课程来源',item.license||'原创课程',item.source_url||'',item.license_url||''].filter(Boolean).join('\n'),showCancel:false})
  },

  openLessonPicker() {
    this.setData({ showLessonPicker: true })
  },

  closeLessonPicker() {
    this.setData({ showLessonPicker: false })
  },

  readNews(e) {
    const idx = e.currentTarget.dataset.index
    const item = this.data.articles[idx]
    if (!item) return
    getApp().readText(`资讯：${item.title}。${item.summary || ''}`)
  },

  // 刷新今日资讯
  refreshNews() {
    const app = getApp()
    wx.showToast({ title: '刷新中...', icon: 'loading', duration: 10000 })
    app.request({ url: '/market/daily', data: { force: 1 } }).then(res => {
      wx.hideToast()
      const rawItems = res && res.success !== false ? (res.items || []) : []
      const articles = decorateArticles(rawItems.slice(0, 4))
      wx.setStorageSync('home_articles', articles)
        wx.setStorageSync('home_news_fetched',res.fetched_at||'')
      this.setData({
        articles,
        newsStatus:articles.length?(res.stale?'缓存资讯':'来源已核对'):'暂未取得',
        newsFetchedAt:res.fetched_at||'',
        newsMessage: articles.length ? '' : (res.message || '暂未取得官方资讯')
      })
      wx.showToast({ title: `已更新${articles.length}条资讯`, icon: 'success', duration: 1500 })
    }).catch(() => {
      wx.hideToast()
      wx.showToast({ title: '刷新失败，请稍后再试', icon: 'none', duration: 1500 })
    })
  },

  openNews(e) {
    const idx = e.currentTarget.dataset.index
    wx.navigateTo({ url: `/pages/news-detail/news-detail?index=${idx}` })
  },

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    if (!term) return
    // 点击难词直接跳转AI助手页面一键询问
    termHelper.goAskTerm(term)
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  // 点击常用功能先朗读再跳转
  readAndGo(e) {
    const label = e.currentTarget.dataset.label || ''
    const url = e.currentTarget.dataset.url || ''
    if (url) {
      wx.navigateTo({ url })
    }
    if (label) {
      getApp().readText(label)
    }
  },

  goAssistant() {
    wx.redirectTo({ url: '/pages/assistant/assistant' })
    getApp().readText('问小享')
  },

  goFinance() {
    wx.redirectTo({ url: '/pages/finance/finance' })
    getApp().readText('钱生钱')
  },

  goProfile() {
    wx.redirectTo({ url: '/pages/profile/profile' })
    getApp().readText('我的画像')
  },

  // 点击当前页导航朗读
  readNav(e) {
    const label = e.currentTarget.dataset.label || ''
    getApp().readText(label)
  },

  

  onHomeLessonVideoLoaded(e) {
    console.log('视频加载完成:', e.detail)
  },

  onHomeLessonVideoFullscreenChange(e) {
    console.log('全屏状态变化:', e.detail)
    this.setData({
      lessonVideoPlaying: e.detail.fullScreen
    })
  },

  onHomeLessonVideoPlay() {
    this.setData({ lessonVideoPlaying: true })
  },

  onHomeLessonVideoPause() {
    this.setData({ lessonVideoPlaying: false })
  },

  onHomeLessonVideoEnded() {
    this.setData({ lessonVideoPlaying: false })
  },

  seekHomeLessonVideo(e) {
    const offset = Number(e.currentTarget.dataset.offset || 0)
    const ctx = wx.createVideoContext('homeLessonVideo', this)
    const current = Number(this.data.lessonCurrentTime || 0)
    const next = Math.max(0, current + offset)
    ctx.seek(next)
  },

  onHomeLessonVideoTimeUpdate(e) {
    const currentTime = e.detail.currentTime || 0
    const duration = e.detail.duration || 0
    this.setData({
      lessonCurrentTime: currentTime,
      lessonDuration: duration,
      lessonTimeText: `${formatVideoTime(currentTime)} / ${formatVideoTime(duration)}`
    })
  },

  resetHomeLessonVideoState() {
    this.setData({
      homeLessonVideoBroken: false,
      lessonVideoPlaying: false,
      lessonCurrentTime: 0,
      lessonDuration: 0,
      lessonTimeText: '0:00 / 0:00'
    })

    try {
      const ctx = wx.createVideoContext('homeLessonVideo', this)
      ctx.pause()
      ctx.seek(0)
    } catch (e) {}
  },

  onHomeLessonVideoError(e) {
    console.error('视频播放错误:', e.detail)
    const errMsg = e.detail.errMsg || '未知错误'
    wx.showToast({
      title: `视频加载失败: ${errMsg}`,
      icon: 'none',
      duration: 3000
    })
    this.setData({
      homeLessonVideoBroken: true,
      lessonVideoPlaying: false
    })
  },

  // ======== 家庭协同弹窗 ========
  openFamilyPanel() {
    getApp().readText('找儿女')
    this.setData({ showFamilyPanel: true, familyCode: '', familyMembers: [] })

    // 获取邀请码
    getApp().request({ url: '/family/bind-code' }).then(res => {
      if (res.code) {
        wx.setStorageSync('family_code', res.code)
        this.setData({ familyCode: res.code })
      }
    }).catch(() => {})

    // 获取已绑定的子女列表（带权限信息）
    getApp().request({ url: '/family/members' }).then(res => {
      const items = (res.items || []).map(item => {
        let permissions = item.permissions || {}
        if (typeof permissions === 'string') {
          try { permissions = JSON.parse(permissions) } catch (e) { permissions = {} }
        }
        return {
          id: String(item.id || item.mid || ''),
          name: item.display_name || item.name || item.nickname || item.relation || '家人',
          phone: item.phone || '',
          isBinding: !!item.binding_id || String(item.id || '').indexOf('binding-') === 0,
          bindingId: Number(item.binding_id || (String(item.id || '').indexOf('binding-') === 0 ? String(item.id).replace('binding-', '') : 0)),
          permissions
        }
      })
      this.setData({ familyMembers: items }, () => {
        const user = wx.getStorageSync('user') || {}
        if (user.id && items.length) wx.setStorageSync(`bound_family_members_${user.id}`, items)
        if (this._openPermissionAfterFamilyLoad) {
          this._openPermissionAfterFamilyLoad = false
          this.goFamilyFull({ currentTarget: { dataset: { id: (items[0] || {}).id || '' } } })
        }
      })
    }).catch(() => {})
  },

  closeFamilyPanel() {
    this._openPermissionAfterFamilyLoad = false
    this.setData({ showFamilyPanel: false })
  },

  copyFamilyCode() {
    const code = this.data.familyCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    })
  },

  refreshFamilyCode() {
    const app = getApp()
    app.request({ url: '/family/bind-code/refresh', method: 'POST', loading: true }).then(res => {
      const code = res.code || ''
      if (code) {
        wx.setStorageSync('family_code', code)
        this.setData({ familyCode: code })
        wx.showToast({ title: '已刷新', icon: 'success' })
      }
    }).catch(() => {
      wx.showToast({ title: '刷新失败', icon: 'none' })
    })
  },

  toggleFamilyPermission(e) {
    this.goFamilyFull()
  },

  goFamilyFull(e) {
    const requestedId = String(e && e.currentTarget && e.currentTarget.dataset.id || '')
    const members = this.data.familyMembers || []
    const target = members.find(item => String(item.id) === requestedId) || members[0]
    if (!target || !target.bindingId) {
      wx.showToast({ title: '请先绑定子女账号', icon: 'none' })
      return
    }
    const source = target.permissions || {}
    this.setData({
      showHomePermissionPanel: true,
      permissionTarget: target,
      permissionDraft: {
        positions: source.view_positions !== false,
        ledger: source.view_ledger_summary !== false,
        risk: source.receive_alerts !== false,
        messages: source.view_messages !== false,
        groupChat: source.view_group_chat !== false,
        health: !!source.view_health,
        location: !!source.view_location
      }
    })
  },

  closeHomePermissionPanel() {
    this.setData({ showHomePermissionPanel: false, permissionTarget: null, permissionDraft: {} })
  },

  toggleHomePermission(e) {
    const key = e.currentTarget.dataset.key
    if (key) this.setData({ [`permissionDraft.${key}`]: !!e.detail.value })
  },

  saveHomePermissions() {
    const target = this.data.permissionTarget
    const p = this.data.permissionDraft || {}
    if (!target || !target.bindingId) return
    const permissions = {
      view_positions: !!p.positions,
      view_ledger_summary: !!p.ledger,
      receive_alerts: !!p.risk,
      view_messages: !!p.messages,
      view_group_chat: !!p.groupChat,
      view_health: !!p.health,
      view_location: !!p.location
    }
    getApp().request({
      url: `/family/bindings/${target.bindingId}/permissions`,
      method: 'PUT',
      data: permissions,
      loading: true
    }).then(() => {
      const familyMembers = (this.data.familyMembers || []).map(item => String(item.id) === String(target.id) ? { ...item, permissions } : item)
      this.setData({ familyMembers })
      this.closeHomePermissionPanel()
      wx.showToast({ title: '权限已保存', icon: 'success' })
    }).catch(() => wx.showToast({ title: '权限暂未保存', icon: 'none' }))
  },

  stopTap() {},

  // ---- 语音输入回调 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/assistant/assistant?question=' + encodeURIComponent(text),
        fail: (err) => {
          console.error('[首页] 语音跳转失败:', err)
          wx.showToast({ title: '跳转失败，请重试', icon: 'none' })
        }
      })
    }, 100)
  },

  onVoiceEmpty(e) {
    // 识别为空，已在组件内toast提示，无需额外处理
  },

  onVoiceError(e) {
    // 识别失败，已在组件内toast提示
  }
})
