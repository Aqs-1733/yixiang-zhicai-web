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
    "id": "daily_lesson",
    "title": "理财基础：先看懂，再决定",
    "video_title": "理财基础：先看懂，再决定",
    "content": "欢迎来到颐享智财每日一课。看理财产品时，记住三个检查点：一看机构，二看风险，三看期限。\\n第一，看清楚产品由谁发行，通过正规渠道核实机构和产品信息。陌生人催您转账时，先停下来，不要着急操作。\\n第二，看风险等级。第三，看钱什么时候可以取出来。不要只盯着收益数字，也要看清风险、费用和赎回条件。\\n如果有人同时承诺高收益、稳赚不赔，又让您马上转账，先不要操作。记住：谁发行，有什么风险，何时能取。看清楚，再作决定。",
    "summary": "理财课堂",
    "video_url": "/media/lesson-videos/daily_lesson.mp4",
    "video_poster": "/site/assets/videos/daily_lesson_poster.png",
    "license": "原创课程",
    "source_url": ""
  },
  {
    "id": "local_01",
    "title": "投资方式的种类及区别（一）",
    "video_title": "投资方式的种类及区别（一）",
    "content": "存款是把资金存入银行，按约定计息。活期和定期的期限不同，提前支取可能影响利息，先看清约定。\n\n债券体现债权债务关系，发行人按约定还本付息。国债和企业债的发行主体不同，信用与价格风险也不同。\n\n存款、债券和银行理财不是同一回事。理财并非存款，投资产品可能亏损，先核实发行机构和产品性质。",
    "summary": "认识存款与债券，分清产品性质、期限和发行主体。",
    "video_url": "/media/lesson-videos/local_01.mp4",
    "video_poster": "/site/assets/videos/local_01_poster.png",
    "license": "CC BY 4.0",
    "source_url": "https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1128568"
  },
  {
    "id": "local_02",
    "title": "投资方式的种类及区别（二）",
    "video_title": "投资方式的种类及区别（二）",
    "content": "股票代表对公司的所有权。股东可能取得分红，也要承担经营和市场波动的风险，价格下跌可能带来损失。\n\n基金汇集多位投资者的资金，由管理人按合同投资。股票型、债券型和货币型基金的投资对象与风险不同。\n\n基金分散投资，也不代表本金有保证。比较股票和基金，要看投资对象、波动、费用，以及交易和赎回条件。",
    "summary": "理解股票的所有权与基金的集合投资，认识波动、费用和赎回条件。",
    "video_url": "/media/lesson-videos/local_02.mp4",
    "video_poster": "/site/assets/videos/local_02_poster.png",
    "license": "CC BY 4.0",
    "source_url": "https://investor.amac.org.cn/investread/tzbdjczs/202006/t20200603_9657.html"
  },
  {
    "id": "local_03",
    "title": "投资方式的种类及区别（三）",
    "video_title": "投资方式的种类及区别（三）",
    "content": "银行理财按合同约定管理投资者的资金，可能投向债券等资产。银行销售不等于保本，也不等于银行存款。\n\n保险主要提供合同约定的风险保障。要看保障范围、责任免除、缴费期限和退保条件，退保可能产生损失。\n\n存款、理财和保险承担的功能不同。比较时别只看一个收益数字，还要理解风险由谁承担、资金何时可用。",
    "summary": "分清银行理财与保险的功能，比较风险、期限和合同安排。",
    "video_url": "/media/lesson-videos/local_03.mp4",
    "video_poster": "/site/assets/videos/local_03_poster.png",
    "license": "CC BY 4.0",
    "source_url": "https://www.nfra.gov.cn/cn/view/pages/rulesDetail.html?docId=268592&itemId=4214"
  },
  {
    "id": "local_04",
    "title": "互联网金融与理财",
    "video_title": "互联网金融与理财",
    "content": "互联网金融借助网络技术提供支付、投资等服务。操作便捷，不代表产品没有风险，金融的本质没有改变。\n\n在手机上看到理财产品，先核实机构资质和官方渠道，再读产品合同。平台名气大，也不代表本金有保证。\n\n遇到保本高息、陌生群荐股或催促转账，先停下来核实。不要随意点击陌生链接，也不要向他人透露验证码。",
    "summary": "线上渠道不改变金融风险；核实机构、合同与信息安全。",
    "video_url": "/media/lesson-videos/local_04.mp4",
    "video_poster": "/site/assets/videos/local_04_poster.png",
    "license": "CC BY 4.0",
    "source_url": "https://www.csrc.gov.cn/csrc/c100028/c1001900/content.shtml"
  },
  {
    "id": "local_05",
    "title": "七天年化收益率和年利率的区别",
    "video_title": "七天年化收益率和年利率的区别",
    "content": "常说的七天年化收益率，也叫七日年化收益率，是把最近七天的收益折算成年化指标，不是未来收益承诺。\n\n年利率是以一年为单位表示的计息比例。利率可能固定，也可能浮动，实际利息还取决于本金、期限和规则。\n\n七日年化反映近期表现，年利率说明计息比例，两者含义不同。比较时还要看风险、费用和资金可用的时间。",
    "summary": "七日年化是历史收益的年化折算；年利率是以年为单位的计息比例。",
    "video_url": "/media/lesson-videos/local_05.mp4",
    "video_poster": "/site/assets/videos/local_05_poster.png",
    "license": "CC BY 4.0",
    "source_url": "https://www.nfra.gov.cn/cn/view/pages/rulesDetail.html?docId=1239473"
  },
  {
    "id": "local_06",
    "title": "外汇投资与结算",
    "video_title": "外汇投资与结算",
    "content": "结汇是把持有的外币换成人民币；购汇是用人民币购买外币。结算通常服务于真实收付，不等于投资获利。\n\n外汇投资涉及汇率变动，可能产生收益，也可能产生损失。使用杠杆还会放大风险，不能把换汇当作稳赚。\n\n办理外汇业务，应通过具备相应资格的机构，按真实用途提供资料。不要借用他人额度或参与陌生平台交易。",
    "summary": "分清结汇、购汇与外汇投资；认识汇率风险及正规办理渠道。",
    "video_url": "/media/lesson-videos/local_06.mp4",
    "video_poster": "/site/assets/videos/local_06_poster.png",
    "license": "CC BY 4.0",
    "source_url": "https://www.safe.gov.cn/tianjin/2024/0430/2465.html"
  },
  {
    "id": "local_07",
    "title": "如何选择适合的投资方式",
    "video_title": "如何选择适合的投资方式",
    "content": "选择投资方式，先明确这笔钱的用途和需要使用的时间，再了解自己的收入、支出与可能承受的损失。\n\n产品风险、期限和流动性，应与自身情况相匹配。风险测评要如实填写，测评结果和销售意见都不是收益保证。\n\n比较时核实机构资质，读懂费用、赎回条件和风险说明。没有适合所有人的产品，基础知识不能替代独立判断。",
    "summary": "用目标、期限、风险承受能力及产品信息进行基础自查。",
    "video_url": "/media/lesson-videos/local_07.mp4",
    "video_poster": "/site/assets/videos/local_07_poster.png",
    "license": "CC BY 4.0",
    "source_url": "https://www.csrc.gov.cn/csrc/c106256/c1653849/content.shtml"
  },
  {
    "id": "local_08",
    "title": "个人所得税",
    "video_title": "个人所得税",
    "content": "个人所得税与个人取得的应税所得有关。工资薪金、劳务报酬、经营所得等类别不同，计算和申报方式也不同。\n\n居民个人的工资薪金、劳务报酬、稿酬和特许权使用费属于综合所得。符合条件的扣除，要按规定如实填报。\n\n年度汇算是核对全年综合所得应纳税额和已预缴税额，可能退税，也可能补税。具体事项以税务机关最新指引为准。",
    "summary": "认识所得分类、综合所得与年度汇算；不涉及具体税率。",
    "video_url": "/media/lesson-videos/local_08.mp4",
    "video_poster": "/site/assets/videos/local_08_poster.png",
    "license": "CC BY 4.0",
    "source_url": "https://fgk.chinatax.gov.cn/zcfgk/c100010/c5194444/content.html"
  },
  {
    "id": "open_compound",
    "title": "开放课堂：看懂复利，不迷信收益",
    "video_title": "开放课堂：看懂复利，不迷信收益",
    "content": "这一课，我们一起弄清复利。复利就是把利息加入本金，再参与下一次计算。这个计算方法不是收益承诺。\\n假设本金一千元，年利率固定百分之三，按年计息，不考虑费用。一年后是一千零三十元。第二年把利息也加入计算，两年后是一千零六十点九零元。\\n这个公式假设利率固定，利息再投入。实际理财产品可能亏损，也可能收取费用，不要把计算结果当成产品承诺。\\n学会公式是为了看懂说明，不是为了追逐高收益。遇到稳赚不赔、催促转账的说法，先停下来核实。这一课参考维基教科书金融原理，按知识共享署名相同方式共享四点零协议开放。",
    "summary": "理财课堂",
    "video_url": "/media/lesson-videos/open_compound.mp4",
    "video_poster": "/site/assets/videos/open_compound_poster.png",
    "license": "CC BY-SA 4.0",
    "source_url": "https://en.wikibooks.org/wiki/Principles_of_Finance/Section_1/Chapter_2/Time_Value_of_Money/Compounding_and_FV"
  }
]

// 获取今日课程（根据日期计算，8天循环）
function getTodayLesson() { return LESSON_VIDEOS[0] }

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
    this._resumeAt=Number(this.data.lessonCurrentTime||0)
    this.saveLessonProgress()
    try { wx.createVideoContext('homeLessonVideo',this).pause() } catch(e) {}
  },

  onUnload() { this.onHide() },

  load() {
    const app = getApp()
    const shouldLoadLesson=!this._catalogLoaded&&!this._catalogLoading

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
      ...(shouldLoadLesson ? {homeLessonVideoBroken: false,lesson,
      lessonTitleSegments: termHelper.buildTermSegments(lesson.title || ''),
      lessonInfo: {
        currentIndex: currentIndex + 1,
        totalCount: LESSON_VIDEOS.length
      }} : {})
    })

    this.loadHomeWeather()
    this.loadFamilyMemberCache()

    // 尝试从服务器获取课程（服务器优先级更高）
    if(shouldLoadLesson){this._catalogLoading=true;app.request({
      url: '/lesson/today'
    }).then(res => {
      const remoteOptions = (res.video_options || []).map((item, idx) => ({
        ...item,
        id: item.id || idx + 1,
        title: item.title || `课程${idx + 1}`,
        summary: item.summary || '理财课堂 · 视频学习',
        content: item.content || item.title || '理财课堂视频',
        video_poster:item.poster||item.video_poster||'',
        video_title: item.title || `课程${idx + 1}`,
        video_url: item.url || item.video_url || ''
      })).filter(item => item.video_url)
      const saved=wx.getStorageSync('lesson_progress_'+(wx.getStorageSync('user')||{}).id)||{}
      const selected=remoteOptions.find(x=>x.id===saved.id)
      const remoteLesson=selected||mergeLessonData(this.data.lesson,res)
      this._catalogLoaded=true;this._catalogLoading=false
      this._resumeAt=selected?Number(saved.position||0):0
      this.setData({
        lesson: remoteLesson,
        lessonTitleSegments: termHelper.buildTermSegments(remoteLesson.title || ''),
        lessonList: remoteOptions.length ? remoteOptions : this.data.lessonList,
        lessonInfo: remoteOptions.length ? { currentIndex: Math.max(0, remoteOptions.findIndex(item => item.video_url === remoteLesson.video_url)) + 1, totalCount: remoteOptions.length } : this.data.lessonInfo,
        homeLessonVideoBroken: false
      })
    }).catch(() => {
      this._catalogLoading=false
    })}

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
    this._resumeAt=0
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
    this.saveLessonProgress(0)
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
    if(this._resumeAt>0){const t=this._resumeAt;this._resumeAt=0;wx.createVideoContext('homeLessonVideo',this).seek(t)}
  },

  onHomeLessonVideoFullscreenChange(e) {
    console.log('全屏状态变化:', e.detail)
    this.setData({
      lessonVideoPlaying: e.detail.fullScreen
    })
  },

  onHomeLessonVideoPlay() {
    if(!this.data.lessonVideoPlaying)this.setData({ lessonVideoPlaying: true })
  },

  onHomeLessonVideoPause() {
    if(this.data.lessonVideoPlaying)this.setData({ lessonVideoPlaying: false })
    this.saveLessonProgress()
  },

  onHomeLessonVideoEnded() {
    if(this.data.lessonVideoPlaying)this.setData({ lessonVideoPlaying: false })
    this.saveLessonProgress()
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
    if(Math.floor(currentTime)===Math.floor(this.data.lessonCurrentTime||0)&&duration===this.data.lessonDuration)return
    this.setData({
      lessonCurrentTime: currentTime,
      lessonDuration: duration,
      lessonTimeText: `${formatVideoTime(currentTime)} / ${formatVideoTime(duration)}`
    })
    if(Date.now()-(this._lastProgressSave||0)>4000)this.saveLessonProgress()
  },

  saveLessonProgress(position) {
    const lesson=this.data.lesson||{}
    if(!lesson.id)return
    this._lastProgressSave=Date.now()
    wx.setStorageSync('lesson_progress_'+(wx.getStorageSync('user')||{}).id,{id:lesson.id,position:position===undefined?Number(this.data.lessonCurrentTime||0):position,updated_at:Date.now()})
  },

  retryLessonVideo() {
    this.setData({homeLessonVideoBroken:false})
    if(typeof document!=='undefined')setTimeout(()=>document.querySelector('#homeLessonVideo')?.load(),0)
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
