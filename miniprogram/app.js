const api = require('./utils/api.js')
let ttsAudio = null
const LOCAL_API_BASE_URL = 'https://yixiangzhicai.com'
const RELEASE_API_BASE_URL = 'https://yixiangzhicai.com'
const FONT_LEVELS = [
  {
    label: '标准字',
    chatClass: 'font-normal',
    pageClass: 'font-global-normal'
  },
  {
    label: '大字',
    chatClass: 'font-large',
    pageClass: 'font-global-large'
  },
  {
    label: '超大字',
    chatClass: 'font-xlarge',
    pageClass: 'font-global-xlarge'
  }
]

try {
  ttsAudio = wx.createInnerAudioContext()
  ttsAudio.onError(() => {
    wx.showToast({ title: '语音播报失败', icon: 'none' })
  })
} catch (e) {
  ttsAudio = null
}

App({
  globalData: {
    baseUrl: LOCAL_API_BASE_URL,
    token: '',
    user: null,
    profile: null,
    role: 'elder',
    fontSizeMode: 'normal',
    fontIndex: 0,
    fontLabel: '标准字',
    fontPageClass: 'font-global-normal',
    fontChatClass: 'font-normal',
    familyGroupUnread: 0
  },
  onLaunch() {
    const rememberUntil = Number(wx.getStorageSync('rememberLoginUntil') || 0)
    let token = wx.getStorageSync('token') || ''
    if (token && (!rememberUntil || rememberUntil <= Date.now())) {
      token = ''
      wx.removeStorageSync('token')
      wx.removeStorageSync('rememberLoginUntil')
    }
    const user = wx.getStorageSync('user') || null
    const role = wx.getStorageSync('role') || 'elder'
    const profile = wx.getStorageSync('profile') || wx.getStorageSync('userProfile') || null
    const storedBaseUrl = String(wx.getStorageSync('baseUrl') || '').trim()
    let envVersion = 'develop'
    let platform = 'devtools'
    try {
      const account = wx.getAccountInfoSync()
      envVersion = account && account.miniProgram && account.miniProgram.envVersion
        ? account.miniProgram.envVersion
        : 'develop'
    } catch (e) {}
    try {
      const system = wx.getSystemInfoSync()
      platform = system && system.platform ? system.platform : 'devtools'
    } catch (e) {}
    this.globalData.token = token
    this.globalData.user = user
    this.globalData.profile = profile
    this.globalData.role = role
    const defaultUrl = envVersion === 'release' ? RELEASE_API_BASE_URL : LOCAL_API_BASE_URL
    this.globalData.baseUrl = api.normalizeBaseUrl(storedBaseUrl || defaultUrl, {
      fallback: defaultUrl,
      releaseLike: envVersion === 'release' || platform !== 'devtools'
    })
    if (storedBaseUrl && this.globalData.baseUrl !== storedBaseUrl.replace(/\/+$/, '')) {
      wx.removeStorageSync('baseUrl')
    }
    this._familyUnreadPrompted = false
    this.getGlobalFontSetting()
  },
  syncGlobalProfile() {
    const profile = wx.getStorageSync('profile') || wx.getStorageSync('userProfile') || null
    this.globalData.profile = profile
    return profile
  },
  getGlobalFontSetting() {
    const storedMode = wx.getStorageSync('fontSizeMode')
    let index = Number(wx.getStorageSync('chatFontIndex'))

    if (storedMode === 'large') index = 1
    if (storedMode === 'xlarge') index = 2
    if (storedMode === 'normal') index = 0

    if (Number.isNaN(index) || index < 0 || index >= FONT_LEVELS.length) {
      index = 0
    }

    const current = FONT_LEVELS[index]
    const mode = index === 2 ? 'xlarge' : index === 1 ? 'large' : 'normal'

    this.globalData.fontSizeMode = mode
    this.globalData.fontIndex = index
    this.globalData.fontLabel = current.label
    this.globalData.fontPageClass = current.pageClass
    this.globalData.fontChatClass = current.chatClass
    wx.setStorageSync('fontSizeMode', mode)
    wx.setStorageSync('chatFontIndex', index)

    return {
      index,
      mode,
      label: current.label,
      pageClass: current.pageClass,
      chatClass: current.chatClass
    }
  },
  cycleGlobalFontSize() {
    const current = this.getGlobalFontSetting()
    const nextIndex = (current.index + 1) % FONT_LEVELS.length
    wx.setStorageSync('chatFontIndex', nextIndex)
    wx.setStorageSync('fontSizeMode', nextIndex === 2 ? 'xlarge' : nextIndex === 1 ? 'large' : 'normal')
    return this.getGlobalFontSetting()
  },
  request(opts) { return api.request(opts) },

  checkFamilyGroupUnread(showPrompt = true) {
    if (!this.globalData.token && !wx.getStorageSync('token')) return Promise.resolve(0)
    return this.request({ url: '/family/group-chat/unread', loading: false }).then(res => {
      const count = Number(res.count || 0)
      this.globalData.familyGroupUnread = count
      wx.setStorageSync('familyGroupUnread', count)
      if (showPrompt && count > 0 && !this._familyUnreadPrompted) {
        this._familyUnreadPrompted = true
        wx.showModal({
          title: '家人发来新消息',
          content: `家庭群聊里有 ${count} 条新消息，您可以稍后进入群聊查看。`,
          showCancel: false,
          confirmText: '知道了'
        })
      }
      return count
    }).catch(() => 0)
  },

  resolveMediaUrl(value) {
    const url = String(value || '').trim()
    if (!url || /^https?:\/\//.test(url) || url.startsWith('/assets/')) return url
    if (url.startsWith('/media/')) return String(this.globalData.baseUrl || '').replace(/\/$/, '') + url
    return url
  },

  // 全局语音朗读：调用后端百度 TTS，后台静默播放，不阻塞任何页面交互
  readText(text) {
    if (!text) return
    const content = String(text).replace(/\s+/g, ' ').slice(0, 500)

    if (!ttsAudio) {
      return
    }

    ttsAudio.stop()

    const baseUrl = this.globalData.baseUrl
    const token = wx.getStorageSync('token') || ''
    const startedAt = Date.now()
    let statusCode = 0

    // 异步请求 TTS，不阻塞任何操作，静默失败
    wx.request({
      url: baseUrl + '/assistant/text-to-voice',
      method: 'POST',
      timeout: api.AI_TIMEOUT,
      data: { text: content },
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        statusCode = Number(res.statusCode || 0)
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          ttsAudio.src = baseUrl + res.data.url
          ttsAudio.play()
        }
      },
      fail: () => {},
      complete: () => {
        console.info(`[API] POST /assistant/text-to-voice ${Date.now() - startedAt}ms statusCode=${statusCode || 'NETWORK_ERROR'}`)
      }
    })
  },

  go(url) { wx.navigateTo({ url }) },
  goHome() { wx.redirectTo({ url: '/pages/index/index' }) },
  money(n) { return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }
})
