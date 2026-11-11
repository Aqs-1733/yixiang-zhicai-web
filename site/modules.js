window.__yx_modules={
"app.js": function(require,module,exports){
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

},
"components/child-bottom-nav/child-bottom-nav.js": function(require,module,exports){
Component({
  properties: {
    active: { type: String, value: '' }
  },
  data: { unread: 0, globalFontPageClass: 'font-global-normal' },
  lifetimes: {
    attached() {
      const app = getApp()
      const cached = Number(wx.getStorageSync('familyGroupUnread') || 0)
      const font = app.getGlobalFontSetting ? app.getGlobalFontSetting() : { pageClass: 'font-global-normal' }
      this.setData({ unread: cached, globalFontPageClass: font.pageClass })
      if (app.checkFamilyGroupUnread) {
        app.checkFamilyGroupUnread(false).then(unread => this.setData({ unread }))
      }
    }
  },
  methods: {
    goHome() { wx.redirectTo({ url: '/pages/child/index/index' }) },
    goAssistant() { wx.redirectTo({ url: '/pages/assistant/assistant' }) },
    goFamily() { wx.redirectTo({ url: '/pages/family/family' }) },
    goProfile() { wx.redirectTo({ url: '/pages/child/profile/profile' }) }
  }
})

},
"components/family-care-modal/family-care-modal.js": function(require,module,exports){
Component({
  properties: {
    visible: { type: Boolean, value: false, observer(value) { if (value) this.load() } },
    type: { type: String, value: 'health' },
    elderId: { type: Number, value: 0 }
  },
  data: { loading: false, denied: false, health: null, location: null, globalFontPageClass: 'font-global-normal' },
  lifetimes: {
    attached() {
      const app = getApp()
      if (app && app.getGlobalFontSetting) {
        const font = app.getGlobalFontSetting()
        this.setData({ globalFontPageClass: font.pageClass })
      }
    }
  },
  methods: {
    stopTap() {},
    close() { this.triggerEvent('close') },
    load() {
      const elderId = Number(this.properties.elderId || 0)
      if (!elderId) return this.setData({ loading: false, denied: false, health: null, location: null })
      this.setData({ loading: true, denied: false, health: null, location: null })
      const isHealth = this.properties.type === 'health'
      const path = isHealth ? `/child/elders/${elderId}/health-reminders` : `/child/elders/${elderId}/location`
      getApp().request({ url: path, loading: false }).then(res => {
        if (isHealth) {
          const decorate = list => (list || []).map(item => ({ ...item, timeText: String(item.created_at || '').replace('T', ' ').slice(0, 16) }))
          this.setData({ health: { ...res, meals: decorate(res.meals), exercises: decorate(res.exercises) } })
        } else {
          const location = res.location || null
          if (location) location.timeText = String(location.updated_at || '').replace('T', ' ').slice(0, 16)
          this.setData({ location })
        }
      }).catch(err => this.setData({ denied: Number(err && err.statusCode) === 403 })).finally(() => this.setData({ loading: false }))
    }
  }
})

},
"components/family-message-modal/family-message-modal.js": function(require,module,exports){
function formatTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16)
}

Component({
  properties: {
    visible: { type: Boolean, value: false, observer(value) { if (value) this.open() } },
    peerId: { type: Number, value: 0 }
  },
  data: {
    members: [],
    memberNames: [],
    selectedIndex: 0,
    selectedPeerId: 0,
    selectedName: '',
    inputText: '',
    messages: [],
    loading: false,
    sending: false,
    memberHint: '正在同步已绑定家人…',
    globalFontPageClass: 'font-global-normal'
  },
  lifetimes: {
    attached() {
      const app = getApp()
      if (app && app.getGlobalFontSetting) {
        const font = app.getGlobalFontSetting()
        this.setData({ globalFontPageClass: font.pageClass })
      }
    }
  },
  methods: {
    stopTap() {},
    cacheKey() {
      const user = wx.getStorageSync('user') || {}
      return `bound_family_members_${user.id || 'current'}`
    },
    normalizeMembers(items) {
      const seen = {}
      return (items || []).map(item => ({
        ...item,
        peer_id: Number(item.peer_id || item.elder_user_id || item.id || 0),
        display_name: item.display_name || item.remark || item.name || item.nickname || '家人'
      })).filter(item => item.peer_id && !seen[item.peer_id] && (seen[item.peer_id] = true))
    },
    open() {
      const cached = this.normalizeMembers(wx.getStorageSync(this.cacheKey()) || [])
      if (cached.length) this.applyMembers(cached)
      this.setData({ loading: true, memberHint: cached.length ? '' : '正在同步已绑定家人…' })
      const app = getApp()
      app.request({ url: '/family/members', loading: false }).then(res => {
        const direct = this.normalizeMembers(res.items || [])
        if (direct.length) return direct
        return app.request({ url: '/family/messages', loading: false }).then(messageRes => this.normalizeMembers(messageRes.members || []))
      }).then(members => {
        if (members.length) {
          wx.setStorageSync(this.cacheKey(), members)
          this.applyMembers(members)
          this.setData({ memberHint: '' })
        } else if (!this.data.members.length) {
          this.setData({ memberHint: '当前账号尚未绑定家人' })
        }
      }).catch(err => {
        if (this.data.members.length) return
        const denied = Number(err && err.statusCode) === 403
        this.setData({ memberHint: denied ? '长辈暂未开放留言权限' : '家人信息暂未同步，请稍后重试' })
      }).finally(() => this.setData({ loading: false }))
    },
    applyMembers(members) {
      let selectedIndex = 0
      const wanted = Number(this.properties.peerId || this.data.selectedPeerId || 0)
      if (wanted) {
        const index = members.findIndex(item => Number(item.peer_id) === wanted)
        if (index >= 0) selectedIndex = index
      }
      const member = members[selectedIndex]
      this.setData({
        members,
        memberNames: members.map(item => `${item.display_name}（${item.relation || '家人'}）`),
        selectedIndex,
        selectedPeerId: member ? member.peer_id : 0,
        selectedName: member ? member.display_name : ''
      }, () => this.loadMessages())
    },
    chooseMember(e) {
      const selectedIndex = Number(e.detail.value || 0)
      const member = this.data.members[selectedIndex]
      if (!member) return
      this.setData({ selectedIndex, selectedPeerId: member.peer_id, selectedName: member.display_name, messages: [] }, () => this.loadMessages())
    },
    loadMessages() {
      if (!this.data.selectedPeerId) return
      const user = wx.getStorageSync('user') || {}
      getApp().request({ url: `/family/messages?peer_id=${this.data.selectedPeerId}`, loading: false }).then(res => {
        const messages = (res.items || []).slice(-20).map(item => ({
          ...item,
          isMine: String(item.sender_id || item.from_user_id) === String(user.id),
          senderText: item.sender_name || item.from_name || '家人',
          timeText: formatTime(item.created_at)
        }))
        this.setData({ messages })
      }).catch(() => {})
    },
    onInput(e) { this.setData({ inputText: e.detail.value }) },
    send() {
      const content = String(this.data.inputText || '').trim()
      if (!this.data.selectedPeerId) return wx.showToast({ title: '请先选择家人', icon: 'none' })
      if (!content) return wx.showToast({ title: '请填写留言内容', icon: 'none' })
      this.setData({ sending: true })
      getApp().request({
        url: '/family/messages',
        method: 'POST',
        data: { receiver_id: this.data.selectedPeerId, content },
        loading: true
      }).then(() => {
        this.setData({ inputText: '' })
        this.loadMessages()
        wx.showToast({ title: '留言已发送', icon: 'success' })
        this.triggerEvent('sent')
      }).catch(err => wx.showToast({ title: (err && err.data && err.data.detail) || '留言暂未发送', icon: 'none' }))
        .finally(() => this.setData({ sending: false }))
    },
    close() { this.triggerEvent('close') }
  }
})

},
"components/term-popups/term-popups.js": function(require,module,exports){
Component({
  properties: {
    popups: {
      type: Array,
      value: [],
      observer(list) {
        const old = this.data.localPopups || []
        const closedIds = this.data.closedIds || []
        const merged = (list || []).filter(item => !closedIds.includes(String(item.id))).map(item => {
          const existed = old.find(x => x.id === item.id)
          return existed ? { ...existed, ...item, top: existed.top, left: existed.left } : item
        })
        this.setData({ localPopups: merged })
      }
    }
  },

  data: {
    localPopups: [],
    dragging: null,
    closedIds: [],
    globalFontPageClass: 'font-global-normal'
  },

  lifetimes: {
    attached() {
      const app = getApp()
      const font = app.getGlobalFontSetting ? app.getGlobalFontSetting() : { pageClass: 'font-global-normal' }
      this.setData({ globalFontPageClass: font.pageClass })
    }
  },

  methods: {
    noop() {},

    close(e) {
      const id = String(e.currentTarget.dataset.id || '')
      if (id) {
        const localPopups = (this.data.localPopups || []).filter(item => String(item.id) !== id)
        const closedIds = (this.data.closedIds || []).concat(id).slice(-24)
        this.setData({ localPopups, closedIds, dragging: null })
      }
      this.triggerEvent('close', {
        id
      })
    },

    updatePopup(id, patch) {
      const localPopups = (this.data.localPopups || []).map(item => {
        if (String(item.id) === String(id)) return { ...item, ...patch }
        return item
      })
      this.setData({ localPopups })
    },

    ask(e) {
      const id = String(e.currentTarget.dataset.id || '')
      const term = e.currentTarget.dataset.term || ''
      if (!id) return
      const popup = (this.data.localPopups || []).find(item => String(item.id) === id) || {}
      const messages = popup.chatMessages && popup.chatMessages.length
        ? popup.chatMessages
        : [{
            id: `hello_${Date.now()}`,
            role: 'assistant',
            text: `我在这里继续帮您解释“${term || popup.term || '这个词'}”。您可以直接问：风险在哪里、适不适合养老钱、下一步怎么核验。`
          }]
      this.updatePopup(id, {
        chatOpen: true,
        chatMessages: messages,
        chatInput: popup.chatInput || '',
        asking: false
      })
    },

    onChatInput(e) {
      const id = String(e.currentTarget.dataset.id || '')
      if (!id) return
      this.updatePopup(id, { chatInput: e.detail.value })
    },

    sendChat(e) {
      const id = String(e.currentTarget.dataset.id || '')
      const popup = (this.data.localPopups || []).find(item => String(item.id) === id)
      if (!popup || popup.asking) return
      const text = String(popup.chatInput || '').trim()
      if (!text) {
        wx.showToast({ title: '请输入想问的问题', icon: 'none' })
        return
      }
      const userMsg = { id: `u_${Date.now()}`, role: 'user', text }
      const thinkingId = `a_${Date.now()}`
      const thinking = { id: thinkingId, role: 'assistant', text: '小享正在想，马上用白话说清楚...' }
      const nextMessages = (popup.chatMessages || []).concat(userMsg, thinking)
      this.updatePopup(id, { chatInput: '', chatMessages: nextMessages, asking: true })

      const history = [{
        role: 'assistant',
        text: `弹窗上下文：术语“${popup.term || ''}”；当前解释：${popup.explanation || ''}；风险提醒：${popup.risk_tip || ''}`
      }].concat((popup.chatMessages || []).slice(-8).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        text: msg.text || ''
      })))
      const storedRole = wx.getStorageSync('role') || 'elder'
      const profile = Object.assign({}, wx.getStorageSync('profile') || {}, wx.getStorageSync('user') || {}, { role: storedRole })
      getApp().request({
        url: '/assistant/chat',
        method: 'POST',
        loading: false,
        data: {
          session_id: `term_popup_${id}`,
          scene: 'term_popup',
          mode: 'term_popup',
          message: text,
          term: popup.term || '',
          profile,
          history
        }
      }).then(res => {
        const answer = String(res.reply || res.answer || '小享暂时没连上服务，您可以稍后再问；如果涉及转账验证码，请先暂停操作。')
          .replace(/```(?:json|markdown|text)?|```/gi, '')
          .replace(/^\s*#{1,6}\s*/gm, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\uFEFF|ï»¿|�/g, '')
          .replace(/(?:^|\n)\s*(?:Error|Traceback|provider|model|debug|status_code)\s*[:：].*/gi, '')
          .trim()
        const localPopups = (this.data.localPopups || []).map(item => {
          if (String(item.id) !== id) return item
          const chatMessages = (item.chatMessages || []).map(msg => msg.id === thinkingId ? { ...msg, text: answer } : msg)
          return { ...item, chatMessages, asking: false }
        })
        this.setData({ localPopups })
      }).catch(() => {
        const localPopups = (this.data.localPopups || []).map(item => {
          if (String(item.id) !== id) return item
          const chatMessages = (item.chatMessages || []).map(msg => msg.id === thinkingId ? { ...msg, text: '小享暂时没连上服务，您可以稍后再问；如果涉及转账验证码，请先暂停操作。' } : msg)
          return { ...item, chatMessages, asking: false }
        })
        this.setData({ localPopups })
      })
    },

    dragStart(e) {
      const id = e.currentTarget.dataset.id
      const item = (this.data.localPopups || []).find(x => x.id === id)
      const touch = e.touches && e.touches[0]
      if (!item || !touch) return
      this.setData({
        dragging: {
          id,
          startX: touch.clientX,
          startY: touch.clientY,
          top: Number(item.top || 150),
          left: Number(item.left || 30)
        }
      })
    },

    dragMove(e) {
      const dragging = this.data.dragging
      const touch = e.touches && e.touches[0]
      if (!dragging || !touch) return
      const left = Math.max(10, Math.min(110, dragging.left + (touch.clientX - dragging.startX) * 2))
      const top = Math.max(40, Math.min(980, dragging.top + (touch.clientY - dragging.startY) * 2))
      const localPopups = (this.data.localPopups || []).map(item => {
        if (item.id === dragging.id) return { ...item, left, top }
        return item
      })
      this.setData({ localPopups })
    },

    dragEnd() {
      this.setData({ dragging: null })
    }
  }
})

},
"components/voice-input/voice-input.js": function(require,module,exports){
// 语音输入组件：按住说话 + 录音浮层 + 语音识别
// recorderManager 是模块级单例，监听器只注册一次，通过 currentComp 追踪活跃组件

let recorderManager = null
let recordTimer = null
let recordStartTime = 0
// 当前活跃的组件实例（用于单例回调分发）
let currentComp = null
// 标记：录音是否由本组件发起（防止其他页面如assistant的录音被误处理）
let _voiceCompRecording = false

// 检测是否为开发者工具环境
function isDevTools() {
  try {
    const sys = wx.getSystemInfoSync()
    return sys.platform === 'devtools'
  } catch (e) {
    return false
  }
}

let devToolsWarned = false

try {
  recorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null
} catch (e) {
  recorderManager = null
}

// 模块级：确保 RecorderManager 监听器只注册一次
function ensureListeners() {
  if (!recorderManager || recorderManager.__listenersReady) return
  recorderManager.__listenersReady = true

  recorderManager.onStop((res) => {
    const comp = currentComp
    const duration = recordStartTime ? Date.now() - recordStartTime : 0
    recordStartTime = 0

    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }

    if (!comp) {
      console.log('[语音组件] onStop但currentComp为空，忽略')
      return
    }

    // 只处理本组件发起的录音，忽略其他来源（如assistant页面内置语音）
    if (!_voiceCompRecording) {
      console.log('[语音组件] onStop非本组件发起，忽略')
      return
    }
    _voiceCompRecording = false

    comp.setData({ recording: false, recordingSeconds: 0 })

    // 最小录音时长检查：少于800ms视为误触，不上传
    if (duration < 800) {
      console.log('[语音组件] 录音时长过短(' + duration + 'ms)，忽略')
      return
    }

    const tempFilePath = res.tempFilePath
    if (!tempFilePath) {
      wx.showToast({ title: '录音文件获取失败', icon: 'none' })
      comp.triggerEvent('error', { message: '录音文件获取失败' })
      return
    }

    wx.showLoading({ title: '识别中…' })
    const app = getApp()
    const baseUrl = (app && app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    const uploadUrl = baseUrl + '/assistant/voice-to-text?format=wav'

    console.log('[语音识别] 上传录音到:', uploadUrl, 'comp绑定:', !!comp)

    wx.uploadFile({
      url: uploadUrl,
      timeout: 70000,
      filePath: tempFilePath,
      name: 'file',
      header: {
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (uploadRes) => {
        // 同步解析数据，避免微信回收 uploadRes
        let parsedData = null
        try {
          parsedData = JSON.parse(uploadRes.data)
        } catch (parseErr) {
          console.error('[语音识别] 解析响应失败:', parseErr)
          wx.hideLoading()
          wx.showToast({ title: '识别失败，请重试', icon: 'none' })
          comp.triggerEvent('error', { message: '解析失败' })
          return
        }

        wx.hideLoading()
        console.log('[语音识别] HTTP:', uploadRes.statusCode, 'ok:', parsedData.ok)

        // hideLoading 需要一点时间让原生遮罩完全消失，再触发事件/导航
        const doAfterHide = () => {
          if (parsedData.ok && parsedData.text) {
            const text = String(parsedData.text).trim()
            if (!text) return
            console.log('[语音识别] 识别成功:', text.slice(0, 30))
            comp.triggerEvent('result', { text })
            if (comp.properties.redirectToAsk) {
              const question = encodeURIComponent(text)
              wx.navigateTo({
                url: `/pages/assistant/assistant?question=${question}`,
                fail: (navErr) => {
                  console.error('[语音组件] 跳转问小享失败:', navErr)
                  wx.showToast({ title: '跳转失败，请手动问小享', icon: 'none' })
                }
              })
            }
          } else {
            const hint = parsedData.hint || parsedData.message || parsedData.detail || '没有听清楚'
            wx.showToast({ title: String(hint).slice(0, 20), icon: 'none', duration: 2500 })
            comp.triggerEvent('empty', { hint })
          }
        }

        // 短暂延迟确保 hideLoading 遮罩消失
        setTimeout(doAfterHide, 100)
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('[语音识别] 上传失败:', JSON.stringify(err))
        wx.showToast({ title: '网络异常，请检查网络后重试', icon: 'none', duration: 2500 })
        comp.triggerEvent('error', { message: '网络错误' })
      }
    })
  })

  recorderManager.onError((err) => {
    const comp = currentComp
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    recordStartTime = 0

    console.error('[语音组件] RecorderManager错误:', JSON.stringify(err))
    wx.showToast({ title: '录音失败，请用文字输入', icon: 'none' })
    _voiceCompRecording = false

    if (comp) {
      comp.setData({ recording: false, recordingSeconds: 0 })
      comp.triggerEvent('error', { message: '录音失败' })
    }
  })
}

Component({
  properties: {
    btnText: { type: String, value: '按住 说话' },
    maxDuration: { type: Number, value: 30000 },
    overlayText: { type: String, value: '小享正在认真听您说话…' },
    type: { type: String, value: 'fab' },
    visible: { type: Boolean, value: true },
    disabled: { type: Boolean, value: false },
    // 识别成功后是否自动跳转问小享，默认开启
    redirectToAsk: { type: Boolean, value: true }
  },

  data: {
    recording: false,
    recordingSeconds: 0,
    recordingMax: 30,
    globalFontPageClass: 'font-global-normal'
  },

  lifetimes: {
    attached() {
      // 注册为当前活跃组件
      currentComp = this
      // 重置防重复点击标记
      this._startingRecording = false
      // 确保模块级监听器已注册（全局只注册一次）
      ensureListeners()
      const app = getApp()
      const font = app.getGlobalFontSetting ? app.getGlobalFontSetting() : { pageClass: 'font-global-normal' }
      this.setData({ recordingMax: Math.floor(this.properties.maxDuration / 1000) || 30, globalFontPageClass: font.pageClass })
      console.log('[语音组件] attached, currentComp已绑定')
    },
    detached() {
      // 如果当前活跃组件是自己，则清除引用
      if (currentComp === this) {
        currentComp = null
        console.log('[语音组件] detached, currentComp已清除')
      }
      // 强制停止录音，防止后台持续运行
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }
      if (recorderManager && this.data.recording) {
        try {
          recorderManager.stop()
        } catch (e) {
          // 静默处理
        }
      }
      _voiceCompRecording = false
      this.setData({ recording: false, recordingSeconds: 0 })
    }
  },

  methods: {
    // 阻止录音浮层上的滚动穿透
    stopTouchMove() {
      return false
    },

    // 真正开始录音（权限已就绪）
    _doStartRecord() {
      // 确保当前组件是活跃的
      currentComp = this
      _voiceCompRecording = true
      recordStartTime = Date.now()
      console.log('[语音组件] 开始录音, currentComp已绑定')

      // 使用 try-catch 防止 recorderManager.start() 抛异常导致状态卡死
      try {
        recorderManager.start({
          duration: this.properties.maxDuration,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'wav'
        })
      } catch (e) {
        console.error('[语音组件] recorderManager.start() 异常:', e)
        this._startingRecording = false
        wx.showToast({ title: '录音启动失败，请重试', icon: 'none' })
        this.triggerEvent('error', { message: '录音启动异常' })
        return
      }

      this.setData({ recording: true, recordingSeconds: 0 })
      this.triggerEvent('start')

      const that = this
      const autoStopSec = Math.floor(this.properties.maxDuration / 1000) - 2
      recordTimer = setInterval(() => {
        const sec = that.data.recordingSeconds + 1
        that.setData({ recordingSeconds: sec })
        if (sec >= autoStopSec) {
          try {
            recorderManager.stop()
          } catch (e) {
            // 静默处理
          }
        }
      }, 1000)
    },

    startHoldSpeak() {
      if (!recorderManager) {
        wx.showModal({
          title: '设备不支持语音',
          content: '当前设备不支持录音功能，请改用文字输入。',
          showCancel: false
        })
        this.triggerEvent('error', { message: '设备不支持' })
        return
      }
      if (this.properties.disabled) {
        wx.showToast({ title: '请稍等…', icon: 'none' })
        return
      }
      if (this.data.recording || this._startingRecording) {
        console.log('[语音组件] startHoldSpeak被拦截, recording:', this.data.recording, '_starting:', this._startingRecording)
        return
      }

      this._startingRecording = true
      console.log('[语音组件] 开始权限检查')

      // 先检查权限状态
      wx.getSetting({
        success: (settingRes) => {
          this._startingRecording = false
          const auth = settingRes.authSetting || {}

          if (auth['scope.record'] === true) {
            console.log('[语音组件] 麦克风已授权，直接开始录音')
            wx.vibrateShort({ type: 'medium' })
            this._doStartRecord()
            return
          }

          if (auth['scope.record'] === false) {
            wx.showModal({
              title: '需要麦克风权限',
              content: '您之前拒绝了麦克风权限，请在右上角「设置 > 权限管理」中开启麦克风。',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.openSetting()
                }
              }
            })
            return
          }

          // 未询问过 → 发起授权
          wx.authorize({
            scope: 'scope.record',
            success: () => {
              console.log('[语音组件] 授权成功，开始录音')
              wx.vibrateShort({ type: 'medium' })
              this._doStartRecord()
            },
            fail: (authErr) => {
              console.error('[语音组件] authorize失败:', JSON.stringify(authErr))
              wx.showModal({
                title: '需要麦克风权限',
                content: '请在右上角「设置 > 权限管理」中开启麦克风权限，或切换为文字输入。',
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting()
                  }
                }
              })
            }
          })
        },
        fail: () => {
          this._startingRecording = false
          console.log('[语音组件] getSetting失败，直接尝试authorize')
          wx.authorize({
            scope: 'scope.record',
            success: () => {
              console.log('[语音组件] 授权成功，开始录音')
              wx.vibrateShort({ type: 'medium' })
              this._doStartRecord()
            },
            fail: () => {
              wx.showModal({
                title: '需要麦克风权限',
                content: '请在设置中开启麦克风权限。',
                showCancel: false
              })
            }
          })
        }
      })
    },

    stopHoldSpeak() {
      if (!this.data.recording) {
        console.log('[语音组件] stopHoldSpeak跳过, recording已为false')
        return
      }
      console.log('[语音组件] 停止录音')
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }
      // 立即重置状态，不依赖 onStop 回调，防止状态卡死
      this.setData({ recording: false, recordingSeconds: 0 })
      this._startingRecording = false
      try {
        recorderManager.stop()
      } catch (e) {
        // 静默处理
      }
      this.triggerEvent('stop')
    },

    tapSpeak() {
      console.log('[语音组件] tapSpeak, 当前recording:', this.data.recording)
      if (this.data.recording) {
        this.stopHoldSpeak()
      } else {
        this.startHoldSpeak()
      }
    }
  }
})

},
"pages/assistant/assistant.js": function(require,module,exports){
const termHelper = require('../../utils/termExplain.js')
const AI_TIMEOUT = 70000
const AI_UNAVAILABLE_MESSAGE = '小享暂时没连上服务，您可以稍后再问；如果涉及转账验证码，请先暂停操作。'

function formatMessageText(text) {
  let t = String(text || '')

  if (t.trim().startsWith('{')) {
    try {
      const payload = JSON.parse(t)
      t = (((payload.choices || [])[0] || {}).message || {}).content || payload.reply || payload.answer || payload.content || t
    } catch (e) {}
  }

  // 1. 统一各种换行写法
  t = t
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  // 2. 去掉 Markdown 痕迹
  t = t
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\uFEFF|ï»¿|�/g, '')
    .replace(/\{\s*["']text["']\s*:\s*["']([^"']+)["']\s*,\s*["']score["']\s*:[^}]+\}/gi, '$1')
    .replace(/(?:^|\n)\s*(?:Error|Traceback|HTTPException|provider|model|debug|status_code|request_id)\s*[:：].*/gi, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

  // 3. 去掉每一行前后的脏空格
  t = t
    .split('\n')
    .map(line => line.trim())
    .join('\n')

  // 4. 删除开头和结尾空行
  t = t
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')

  // 5. 连续空行压缩，最多保留一个空行
  t = t.replace(/\n{3,}/g, '\n\n')

  // 6. 给被挤在一起的分点补换行
  t = t
    .replace(/([^\n])([一二三四五六七八九十]+、)/g, '$1\n$2')
    .replace(/([^\n])(\d+[.、](?=[\u4e00-\u9fa5A-Za-z（(]))/g, '$1\n$2')
    .replace(/([。！？；])\s*(\d+[.、](?=[\u4e00-\u9fa5A-Za-z（(]))/g, '$1\n$2')
    .replace(/([。！？；])\s*([一二三四五六七八九十]+、)/g, '$1\n$2')

  // 7. 清理所有空白行，避免气泡里出现瞎空行
  const lines = t
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  return lines.join('\n').trim()
}

let recorderManager = null
let recordTimer = null
let ttsAudio = null

try {
  recorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null
} catch (e) {
  recorderManager = null
}

function nowTime() {
  const d = new Date()
  const h = `${d.getHours()}`.padStart(2, '0')
  const m = `${d.getMinutes()}`.padStart(2, '0')
  return `${h}:${m}`
}

function genId(prefix = 'msg') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`
}

function safeDecode(v) {
  try {
    return decodeURIComponent(v || '')
  } catch (e) {
    return v || ''
  }
}

function cleanAvatar(profile) {
  const avatar = profile.avatar || profile.avatarUrl || profile.headimgurl || ''
  try {
    return (getApp().resolveMediaUrl && getApp().resolveMediaUrl(avatar)) || avatar || '/assets/ui/default_avatar.png'
  } catch (e) {
    return avatar || '/assets/ui/default_avatar.png'
  }
}

function cleanNickname(name) {
  name = String(name || '').trim()

  if (!name || name === '微信用户' || name === 'undefined' || name === 'null') {
    return '您'
  }

  return name
}

function buildTermSegments(text) {
  const raw = String(text || '')
  const terms = termHelper.extractTermsFromText(raw, 24)
    .map(term => ({ term, index: raw.indexOf(term) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index || b.term.length - a.term.length)
  if (!terms.length) return [{ text: raw, term: '' }]
  const segments = []
  let cursor = 0
  terms.forEach(item => {
    if (item.index < cursor) return
    if (item.index > cursor) segments.push({ text: raw.slice(cursor, item.index), term: '' })
    segments.push({ text: item.term, term: item.term })
    cursor = item.index + item.term.length
  })
  if (cursor < raw.length) segments.push({ text: raw.slice(cursor), term: '' })
  return segments
}

Page({
  data: {
    assistantAvatar: '/assets/ui/assistant_avatar.png',
    userAvatar: '/assets/ui/default_avatar.png',
    userNickname: '您',
    isChild: false,
    globalFontPageClass: 'font-global-normal',

    inputText: '',
    loading: false,
    recording: false,
    recordingSeconds: 0,
    recordingMax: 30,
    speakingMsgId: '',
    autoSpeak: false,
    inputMode: 'voice',  // 'voice' 按住说话 | 'text' 文字输入

    sessionId: '',

    chatFontIndex: 0,
    chatFontClass: 'font-normal',

    messages: [],
    nearbyResults: [],
    nearbyQuery: '',
    displayMessages: [],
    scrollTo: '',
    termExplainPopups: [],
    showHistoryPanel: false,
    historyKeyword: '',
    sessionList: [],
    filteredSessionList: [],
    filteredFinanceSessionList: [],

    explainMode: false,
    explainTerm: '',
    fromPage: '',

    quickList: [
      { title: '如何防诈骗' },
      { title: '理财建议' },
      { title: '收益说明' },
      { title: '退休规划' }
    ]
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    this.loadChatFontSize()

    const profile = this.getUserProfile()
    const nickname = cleanNickname(profile.nickname || profile.nickName)

    const sessionId = options.sessionId || this.getCurrentSessionId()

    this.setData({
      userAvatar: cleanAvatar(profile),
      userNickname: nickname,
      isChild: (wx.getStorageSync('role') || 'elder') === 'child',
      sessionId,
      explainMode: options.mode === 'explain',
      explainTerm: safeDecode(options.term),
      fromPage: safeDecode(options.from)
    })
    this.loadSessionList()

    this.initVoice()
    this.initTtsAudio()
    if ((wx.getStorageSync(this.sessionStorageKey(sessionId)) || []).length) {
      this.restoreSession(sessionId)
    } else {
      this.startFreshSession(sessionId)
    }

    if (options.mode === 'explain' && options.term) {
      const term = safeDecode(options.term)
      const showText = `请解释“${term}”`

      this.askAgent(showText, {
        mode: 'explain',
        term,
        displayText: showText
      })
    }

    const incomingQuestion = safeDecode(options.question || options.ask || '')

    if (incomingQuestion) {
      this.sendPresetQuestion(incomingQuestion)
    }
  },

  onShow() {
    this.syncGlobalFont()
    const profile = this.getUserProfile()
    const nickname = cleanNickname(profile.nickname || profile.nickName)

    this.setData({
      userAvatar: cleanAvatar(profile),
      userNickname: nickname,
      isChild: (wx.getStorageSync('role') || 'elder') === 'child'
    })

    this.loadChatFontSize()
    this.scrollBottom()
  },

  getUserProfile() {
    const app = getApp()
    const globalProfile = (app && app.globalData && app.globalData.profile) || {}
    const profile = wx.getStorageSync('profile') || {}
    const userProfile = wx.getStorageSync('userProfile') || {}
    const userProfile2 = wx.getStorageSync('user_profile') || {}
    const me = wx.getStorageSync('me') || {}
    const user = wx.getStorageSync('user') || {}

    const storedRole = wx.getStorageSync('role') || user.role || me.role || 'elder'
    return {
      ...user,
      ...me,
      ...userProfile2,
      ...userProfile,
      ...profile,
      ...globalProfile,
      role: storedRole
    }
  },

  async getLatestProfile() {
    const local = this.getUserProfile()

    try {
      const res = await this.requestApi({
        url: '/profile/me'
      })

      const profile = res.profile || local || {}
      const user = res.user || wx.getStorageSync('user') || {}

      let familyContext = ''
      try {
        const familyRes = await this.requestApi({ url: '/family/members' })
        familyContext = (familyRes.items || []).map(item => `${item.relation || '家人'}：${item.display_name || item.name || '家人'}`).join('；')
      } catch (e) {}

      const merged = Object.assign({}, local, profile, {
        nickname: cleanNickname(profile.nickname || user.nickname || local.nickname || local.nickName),
        phone: profile.phone || user.phone || local.phone || '',
        role: wx.getStorageSync('role') || user.role || local.role || 'elder',
        family_context: familyContext || profile.family_context || '',
        memory_summary: (this.data.messages || []).slice(-6).map(item => `${item.role === 'user' ? '用户' : '小享'}：${item.text || ''}`).join('；').slice(0, 600)
      })

      wx.setStorageSync('profile', merged)
      wx.setStorageSync('user', Object.assign({}, user, { nickname: merged.nickname }))

      // 同步到全局
      const app = getApp()
      if (app && app.globalData) {
        app.globalData.profile = merged
      }

      this.setData({
        userAvatar: cleanAvatar(merged),
        userNickname: merged.nickname || '您'
      })

      return merged
    } catch (e) {
      return local || {}
    }
  },

  getUserKey() {
    const p = this.getUserProfile()
    const role = wx.getStorageSync('role') || p.role || 'elder'
    const identity = p.id || p.user_id || p.phone || p.mobile || p.nickname || p.nickName || 'local_user'
    return `${role}_${identity}`
  },

  createSessionId() {
    return `session_${Date.now()}_${Math.floor(Math.random() * 10000)}`
  },

  currentSessionKey() {
    return `assistant_current_session_${this.getUserKey()}`
  },

  getCurrentSessionId() {
    const current = String(wx.getStorageSync(this.currentSessionKey()) || '')
    if (current) return current
    const latest = (wx.getStorageSync(this.sessionListKey()) || [])[0]
    return (latest && latest.id) || this.createSessionId()
  },

  rememberCurrentSession(sessionId) {
    if (sessionId) wx.setStorageSync(this.currentSessionKey(), sessionId)
  },

  sessionStorageKey(sessionId) {
    return `assistant_history_${this.getUserKey()}_${sessionId}`
  },

  sessionListKey() {
    return `assistant_session_list_${this.getUserKey()}`
  },

  loadSessionList() {
    const list = wx.getStorageSync(this.sessionListKey()) || []
    const grouped = this.splitSessionList(list, this.data.historyKeyword)
    this.setData({
      sessionList: list,
      filteredSessionList: grouped.chat,
      filteredFinanceSessionList: grouped.finance
    })
  },

  filterSessionList(list, keyword) {
    const kw = String(keyword || '').trim().toLowerCase()
    if (!kw) return list
    return (list || []).filter(item => {
      const text = `${item.title || ''} ${item.lastText || ''} ${item.updatedAt || ''}`.toLowerCase()
      return text.includes(kw)
    })
  },

  isFinanceSession(item) {
    if (!item) return false
    if (item.kind === 'finance_card') return true
    const text = `${item.title || ''} ${item.lastText || ''}`.toLowerCase()
    return text.includes('解释：') ||
      text.includes('解释“') ||
      text.includes('我还是不太理解') ||
      text.includes('金融认知') ||
      text.includes('风险等级') ||
      text.includes('理财说明') ||
      text.includes('术语')
  },

  splitSessionList(list, keyword) {
    const filtered = this.filterSessionList(list || [], keyword)
    return {
      chat: filtered.filter(item => !this.isFinanceSession(item)),
      finance: filtered.filter(item => this.isFinanceSession(item))
    }
  },

  detectSessionKind(title, lastText) {
    const text = `${title || ''} ${lastText || ''}`.toLowerCase()
    if (this.data.explainMode ||
      text.includes('解释：') ||
      text.includes('解释“') ||
      text.includes('我还是不太理解') ||
      text.includes('金融认知') ||
      text.includes('术语')) {
      return 'finance_card'
    }
    return 'chat'
  },

  syncGlobalFont() {
    const font = getApp().getGlobalFontSetting()
    this.setData({
      globalFontPageClass: font.pageClass,
      chatFontClass: font.chatClass,
      chatFontIndex: font.index
    })
  },

  loadChatFontSize() {
    const list = [
      { className: 'font-normal' },
      { className: 'font-large' },
      { className: 'font-xlarge' }
    ]

    let index = Number(wx.getStorageSync('chatFontIndex'))

    if (Number.isNaN(index) || index < 0 || index >= list.length) {
      index = 0
    }

    this.setData({
      chatFontIndex: index,
      chatFontClass: list[index].className
    })
  },

  initVoice() {
    if (!recorderManager) return

    // 录音停止：上传到后端进行语音识别
    recorderManager.onStop((res) => {
      // 仅处理本页面发起的录音，忽略其他页面（如voice-input组件）触发的录音
      if (!this.data.recording) return

      // 清除计时器
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

      // 上传音频到后端语音识别
      wx.showLoading({ title: '识别中…' })
      const app = getApp()
      const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
      const token = wx.getStorageSync('token') || ''
      const startedAt = Date.now()
      let statusCode = 0

      wx.uploadFile({
        url: baseUrl + '/assistant/voice-to-text?format=wav',
        timeout: AI_TIMEOUT,
        filePath: tempFilePath,
        name: 'file',
        header: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        success: (uploadRes) => {
          statusCode = Number(uploadRes.statusCode || 0)
          wx.hideLoading()
          try {
            const data = JSON.parse(uploadRes.data)
            if (data.ok && data.text) {
              // 直接发送识别结果，无需手动点击发送
              const text = String(data.text).trim()
              if (text) {
                this.setData({ inputText: '' })
                this.askAgent(text, { mode: 'chat', term: '' })
              }
            } else {
              const hint = data.message || data.hint || data.detail || '没有听清楚'
              wx.showToast({ title: String(hint).slice(0, 20), icon: 'none', duration: 2500 })
            }
          } catch (e) {
            console.error('[语音识别] 解析响应失败:', e)
            wx.showModal({ title: '小享暂时没连上', content: AI_UNAVAILABLE_MESSAGE, showCancel: false })
          }
        },
        fail: (err) => {
          wx.hideLoading()
          console.error('[语音识别] 上传失败:', JSON.stringify(err))
          wx.showModal({ title: '小享暂时没连上', content: AI_UNAVAILABLE_MESSAGE, showCancel: false })
        },
        complete: () => {
          console.info(`[API] POST /assistant/voice-to-text ${Date.now() - startedAt}ms statusCode=${statusCode || 'NETWORK_ERROR'}`)
        }
      })
    })

    recorderManager.onError(() => {
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }
      this.setData({ recording: false, recordingSeconds: 0 })
      wx.showToast({ title: '录音失败，请用文字输入', icon: 'none' })
    })
  },

  // 切换输入模式：语音 <-> 文字
  switchInputMode() {
    const next = this.data.inputMode === 'voice' ? 'text' : 'voice'
    this.setData({ inputMode: next })
  },

  // 按住开始录音
  startHoldSpeak() {
    if (!recorderManager) {
      wx.showToast({ title: '当前设备不支持语音', icon: 'none' })
      return
    }
    if (this.data.loading) {
      wx.showToast({ title: '小享正在思考，请稍等', icon: 'none' })
      return
    }
    if (this.data.recording) return

    wx.vibrateShort({ type: 'medium' })

    // 先检查权限状态，给出更准确的错误信息
    wx.getSetting({
      success: (settingRes) => {
        const auth = settingRes.authSetting || {}
        if (auth['scope.record'] === false) {
          wx.showModal({
            title: '需要麦克风权限',
            content: '您之前拒绝了麦克风权限，请在右上角「设置 > 权限管理」中开启麦克风。',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting()
              }
            }
          })
          return
        }

        // 已授权 → 直接开始录音，不需要再调 wx.authorize
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
            if (sec >= 28) {
              recorderManager.stop()
            }
          }, 1000)
          return
        }

        // 未询问过 → 发起授权，成功后再录音
        wx.authorize({
          scope: 'scope.record',
          success: () => {
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
              if (sec >= 28) {
                recorderManager.stop()
              }
            }, 1000)
          },
          fail: (authErr) => {
            console.error('[语音] authorize失败:', JSON.stringify(authErr))
            wx.showModal({
              title: '需要麦克风权限',
              content: '请在右上角「设置 > 权限管理」中开启麦克风权限，或切换为文字输入。',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.openSetting()
                }
              }
            })
          }
        })
      },
      fail: () => {
        // getSetting 失败，直接尝试 authorize
        wx.authorize({
          scope: 'scope.record',
          success: () => {
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
          },
          fail: () => {
            this.setData({ recording: false, recordingSeconds: 0 })
            wx.showModal({
              title: '需要麦克风权限',
              content: '请在设置中开启麦克风权限。',
              showCancel: false
            })
          }
        })
      }
    })
  },

  // 松手停止录音
  stopHoldSpeak() {
    if (!this.data.recording) return
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    recorderManager.stop()
  },

  // 文字模式下小语音按钮（兼容旧逻辑）
  tapVoice() {
    this.switchInputMode()
  },

  onInput(e) {
    this.setData({
      inputText: e.detail.value
    })
  },

  clearInput() {
    this.setData({
      inputText: ''
    })
  },

  // 初始化 TTS 音频播放器
  initTtsAudio() {
    ttsAudio = wx.createInnerAudioContext()
    ttsAudio.onEnded(() => {
      this.setData({ speakingMsgId: '' })
    })
    ttsAudio.onError(() => {
      this.setData({ speakingMsgId: '' })
      wx.showToast({ title: '语音播报失败', icon: 'none' })
    })
  },

  // 语音播报：调用后端 TTS 接口获取音频并播放
  speakMessage(e) {
    const msgId = e.currentTarget.dataset.msgId
    const msgText = e.currentTarget.dataset.msgText

    if (!msgText) return

    // 如果正在播报同一条消息，则停止
    if (this.data.speakingMsgId === msgId) {
      this.stopSpeak()
      return
    }

    // 停止之前的播报
    if (ttsAudio) {
      ttsAudio.stop()
    }

    this.setData({ speakingMsgId: msgId })

    const app = getApp()
    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    const startedAt = Date.now()
    let statusCode = 0

    wx.request({
      url: baseUrl + '/assistant/text-to-voice',
      method: 'POST',
      timeout: AI_TIMEOUT,
      data: { text: msgText.slice(0, 500) },
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        statusCode = Number(res.statusCode || 0)
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          const audioUrl = baseUrl + res.data.url
          ttsAudio.src = audioUrl
          ttsAudio.play()
        } else {
          this.setData({ speakingMsgId: '' })
        }
      },
      fail: () => {
        this.setData({ speakingMsgId: '' })
      },
      complete: () => {
        console.info(`[API] POST /assistant/text-to-voice ${Date.now() - startedAt}ms statusCode=${statusCode || 'NETWORK_ERROR'}`)
      }
    })
  },

  // 停止语音播报
  stopSpeak() {
    if (ttsAudio) {
      ttsAudio.stop()
    }
    this.setData({ speakingMsgId: '' })
  },

  saveSessionList(title = '新对话') {
    const key = this.sessionListKey()
    let list = wx.getStorageSync(key) || []
    const now = nowTime()

    const lastMsg = this.data.messages.length
      ? this.data.messages[this.data.messages.length - 1]
      : null

    const lastText = lastMsg ? lastMsg.text : '点击进入查看记录'

    const index = list.findIndex(i => i.id === this.data.sessionId)
    const oldItem = index >= 0 ? list[index] : {}
    const item = {
      ...oldItem,
      id: this.data.sessionId,
      title,
      lastText,
      updatedAt: now,
      kind: this.detectSessionKind(title, lastText)
    }

    if (index >= 0) {
      list[index] = item
    } else {
      list.unshift(item)
    }

    wx.setStorageSync(key, list)
    const grouped = this.splitSessionList(list, this.data.historyKeyword)
    this.setData({
      sessionList: list,
      filteredSessionList: grouped.chat,
      filteredFinanceSessionList: grouped.finance
    })
  },

  restoreSession(sessionId) {
    const list = (wx.getStorageSync(this.sessionStorageKey(sessionId)) || []).map(item => ({
      ...item,
      segments: item.segments || buildTermSegments(item.text || '')
    }))

    this.setData({
      sessionId,
      messages: list,
      displayMessages: list,
      inputText: '',
      loading: false,
      scrollTo: list.length ? list[list.length - 1].id : ''
    })
    this.rememberCurrentSession(sessionId)

    if (!list.length) {
      this.startFreshSession(sessionId)
    }
  },

  startFreshSession(sessionId) {
    const profile = this.getUserProfile()
    const nickname = cleanNickname(profile.nickname || profile.nickName)
    const riskLevel = profile.risk_preference || ''
    const age = profile.age || 0

    const isChild = (wx.getStorageSync('role') || profile.role || 'elder') === 'child'
    // 长辈端使用亲切适老话术；子女端保持平等、清楚，不套用老人预设。
    let greeting = isChild
      ? `您好${nickname !== '您' ? '，' + nickname : ''}。我是小享，可以和您一起查看家庭协同、生活、健康和金融问题。`
      : `您好${nickname !== '您' ? '，' + nickname : ''}。我是小享，愿意陪您聊生活、健康、出行，也能帮您看懂账本和理财。`

    if (!isChild && age) {
      greeting += `根据您${age}岁的情况，`
      if (riskLevel === '保守' || riskLevel === '保守型') {
        greeting += '我会重点帮您关注资金安全和防诈骗提醒。'
      } else if (riskLevel === '稳健' || riskLevel === '稳健型') {
        greeting += '我会帮您在安全的基础上做稳健配置。'
      } else if (riskLevel === '积极' || riskLevel === '进取型') {
        greeting += '我会帮您做好分层配置，提醒您控制风险。'
      } else {
        greeting += '您可以问我生活、健康、养老、防诈骗和理财问题。'
      }
    } else if (!isChild) {
      greeting += '您可以问我生活、健康、养老、防诈骗和理财问题。'
    }

    const welcomeMsg = {
      id: genId('a'),
      role: 'assistant',
      alignClass: 'msg-left',
      bubbleClass: 'bubble-ai',
      avatar: this.data.assistantAvatar || '/assets/ui/assistant_avatar.png',
      text: greeting,
      segments: buildTermSegments(greeting),
      time: nowTime()
    }

    this.setData({
      sessionId,
      inputText: '',
      loading: false,
      messages: [welcomeMsg],
      displayMessages: [welcomeMsg],
      scrollTo: welcomeMsg.id
    })

    wx.setStorageSync(this.sessionStorageKey(sessionId), [welcomeMsg])
    this.rememberCurrentSession(sessionId)
    this.saveSessionList('新对话')
  },

  persistCurrentSession() {
    wx.setStorageSync(this.sessionStorageKey(this.data.sessionId), this.data.messages)
    this.rememberCurrentSession(this.data.sessionId)

    let title = '新对话'

    const firstUser = this.data.messages.find(i => i.role === 'user')

    if (firstUser && firstUser.text) {
      title = firstUser.text.slice(0, 12)
    } else if (this.data.explainMode && this.data.explainTerm) {
      title = `解释：${this.data.explainTerm}`
    }

    this.saveSessionList(title)
  },

  createNewSession() {
    this.newSession()
  },

  newSession() {
    const newId = this.createSessionId()

    this.setData({
      explainMode: false,
      explainTerm: '',
      fromPage: ''
    })

    this.startFreshSession(newId)

    wx.showToast({
      title: '已开启新对话',
      icon: 'none'
    })
  },

  openHistoryPanel() {
    this.loadSessionList()
    this.setData({ showHistoryPanel: true })
  },

  closeHistoryPanel() {
    this.setData({ showHistoryPanel: false, historyKeyword: '' })
    this.loadSessionList()
  },

  onHistorySearch(e) {
    const historyKeyword = e.detail.value
    const grouped = this.splitSessionList(this.data.sessionList, historyKeyword)
    this.setData({
      historyKeyword,
      filteredSessionList: grouped.chat,
      filteredFinanceSessionList: grouped.finance
    })
  },

  selectHistorySession(e) {
    const sessionId = e.currentTarget.dataset.id
    if (!sessionId) return
    this.setData({ showHistoryPanel: false, historyKeyword: '' })
    this.restoreSession(sessionId)
  },

  deleteHistorySession(e) {
    const sessionId = e.currentTarget.dataset.id
    if (!sessionId) return
    wx.showModal({
      title: '删除这条聊天记录？',
      content: '删除后不会影响其他聊天。',
      confirmText: '删除',
      confirmColor: '#c05a32',
      success: (res) => {
        if (!res.confirm) return
        const list = (wx.getStorageSync(this.sessionListKey()) || []).filter(item => item.id !== sessionId)
        wx.setStorageSync(this.sessionListKey(), list)
        wx.removeStorageSync(this.sessionStorageKey(sessionId))
        const grouped = this.splitSessionList(list, this.data.historyKeyword)
        this.setData({
          sessionList: list,
          filteredSessionList: grouped.chat,
          filteredFinanceSessionList: grouped.finance
        })
        if (this.data.sessionId === sessionId) {
          this.newSession()
        }
      }
    })
  },

  addUserMessage(text) {
    const cleanText = String(text || '')
      .replace(/\\r\\n/g, ' ')
      .replace(/\\n/g, ' ')
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()

    const msg = {
      id: genId('u'),
      role: 'user',
      text: cleanText,
      segments: buildTermSegments(cleanText),
      time: nowTime(),
      avatar: this.data.userAvatar,
      alignClass: 'msg-right',
      bubbleClass: 'bubble-user'
    }

    const messages = this.data.messages.concat(msg)

    this.setData({
      messages,
      displayMessages: messages,
      scrollTo: msg.id
    })

    this.persistCurrentSession()
  },

  addAssistantMessage(text) {
    const cleanText = formatMessageText(text)

    const msg = {
      id: genId('a'),
      role: 'assistant',
      text: cleanText,
      segments: buildTermSegments(cleanText),
      time: nowTime(),
      avatar: this.data.assistantAvatar,
      alignClass: 'msg-left',
      bubbleClass: 'bubble-ai'
    }

    const messages = this.data.messages.concat(msg)

    this.setData({
      messages,
      displayMessages: messages,
      scrollTo: msg.id
    })

    this.persistCurrentSession()

    // 自动播报：开关打开时自动朗读 AI 回复
    if (this.data.autoSpeak) {
      this.autoSpeakMessage(msg.id, cleanText)
    }
  },

  // 切换语音播报开关
  toggleAutoSpeak() {
    const next = !this.data.autoSpeak
    this.setData({ autoSpeak: next })

    // 关闭时停止当前播报
    if (!next) {
      this.stopSpeak()
    }

    wx.showToast({ title: next ? '语音播报已开启' : '语音播报已关闭', icon: 'none', duration: 1500 })
  },

  // 自动播报（无需点击事件，由 addAssistantMessage 触发）
  autoSpeakMessage(msgId, text) {
    if (!text || !ttsAudio) return

    // 停止之前的播报
    if (ttsAudio) {
      ttsAudio.stop()
    }

    this.setData({ speakingMsgId: msgId })

    const app = getApp()
    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    const startedAt = Date.now()
    let statusCode = 0

    wx.request({
      url: baseUrl + '/assistant/text-to-voice',
      method: 'POST',
      timeout: AI_TIMEOUT,
      data: { text: text.slice(0, 500) },
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        statusCode = Number(res.statusCode || 0)
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          const audioUrl = baseUrl + res.data.url
          ttsAudio.src = audioUrl
          ttsAudio.play()
        } else {
          this.setData({ speakingMsgId: '' })
        }
      },
      fail: () => {
        this.setData({ speakingMsgId: '' })
      },
      complete: () => {
        console.info(`[API] POST /assistant/text-to-voice ${Date.now() - startedAt}ms statusCode=${statusCode || 'NETWORK_ERROR'}`)
      }
    })
  },

  scrollBottom() {
    const list = this.data.displayMessages || []

    if (list.length) {
      this.setData({
        scrollTo: list[list.length - 1].id
      })
    }
  },

  tapAntiFraud() {
    this.sendPresetQuestion('请结合我的情况，用通俗的话提醒我常见诈骗有哪些，接到陌生电话、短信链接、投资推荐、冒充子女求助时我该怎么办。')
  },

  stopTap() {},

  explainChatTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    if (!term) return
    const msg = e.currentTarget.dataset.msg || ''
    termHelper.handleDoubleTap(this, e, {
      term,
      nearbyText: msg,
      scene: 'assistant'
    })
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  tapQuick(e) {
    const prompt =
      (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.prompt) ||
      (e.target && e.target.dataset && e.target.dataset.prompt) ||
      ''

    if (!prompt.trim()) {
      wx.showToast({
        title: '快捷问题没有绑定内容',
        icon: 'none'
      })
      return
    }

    this.sendPresetQuestion(prompt)
  },

  sendPresetQuestion(text) {
    const question = String(text || '').trim()

    if (!question) {
      wx.showToast({
        title: '快捷问题为空',
        icon: 'none'
      })
      return
    }

    if (this.data.loading) {
      wx.showToast({
        title: '小享正在思考',
        icon: 'none'
      })
      return
    }

    this.askAgent(question, {
      mode: this.data.explainMode ? 'explain' : 'chat',
      term: this.data.explainTerm || ''
    })
  },

  sendInput() {
    if (this.data.loading) return

    const text = String(this.data.inputText || '').trim()

    if (!text) {
      wx.showToast({
        title: '请先输入问题',
        icon: 'none'
      })
      return
    }

    this.setData({
      inputText: ''
    })

    if (/(我想去|我要去|怎么去|去哪|哪里办|附近|找一家|找个).*(银行|网点|医院|药店|药房|社区|服务中心|办业务)/.test(text)) {
      this.handleNearbyRequest(text)
      return
    }

    this.askAgent(text, {
      mode: this.data.explainMode ? 'explain' : 'chat',
      term: this.data.explainTerm || ''
    })
  },

  handleNearbyRequest(text) {
    this.addUserMessage(text)
    this.setData({ loading: true, nearbyResults: [], nearbyQuery: text })
    const category = /医院|看病/.test(text) ? { type: 'hospital', keyword: '医院' }
      : (/药店|药房|买药/.test(text) ? { type: 'pharmacy', keyword: '药店' }
        : (/社区|服务中心/.test(text) ? { type: 'community', keyword: '社区服务中心' } : { type: 'bank', keyword: '银行' }))
    wx.getLocation({
      type: 'gcj02',
      success: loc => {
        this.requestApi({
          url: '/lbs/nearby',
          data: {
            type: category.type,
            keyword: category.keyword,
            latitude: loc.latitude,
            longitude: loc.longitude,
            radius: 8000
          },
          loading: false
        }).then(res => {
          const results = (res.items || []).slice(0, 3).map((item, index) => ({
            id: item.id || `assistant_place_${index}`,
            title: item.title || item.name || category.keyword,
            address: item.address || '',
            distance: item._distance || item.distance || 0,
            distanceText: Number(item._distance || item.distance || 0) >= 1000
              ? `约${(Number(item._distance || item.distance) / 1000).toFixed(1)}公里`
              : `约${Math.max(0, Math.round(Number(item._distance || item.distance || 0)))}米`,
            latitude: Number((item.location || {}).lat || item.latitude),
            longitude: Number((item.location || {}).lng || item.longitude)
          })).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
          this.setData({ nearbyResults: results, loading: false })
          this.addAssistantMessage(results.length
            ? `我按您当前的位置找到了${results.length}个较近的${category.keyword}。请先核对名称和地址，点“去这里”可打开微信地图；途中哪一步不清楚，可以继续问我。`
            : `当前区域没有搜索到合适的${category.keyword}。您可以到“附近服务”手动输入地址，扩大范围后再找。`)
        }).catch(() => {
          this.setData({ loading: false })
          this.addAssistantMessage('附近地点暂时没有读取成功。请检查定位和网络，或到“附近服务”手动输入地址后再查找。')
        })
      },
      fail: () => {
        this.setData({ loading: false })
        this.addAssistantMessage('要查最近地点需要定位。请先在微信设置里允许位置权限，也可以到“附近服务”手动输入地址。')
      }
    })
  },

  openAssistantPlace(e) {
    const item = (this.data.nearbyResults || [])[Number(e.currentTarget.dataset.index)]
    if (!item) return
    wx.openLocation({
      latitude: item.latitude,
      longitude: item.longitude,
      name: item.title,
      address: item.address,
      scale: 18,
      fail: () => wx.showToast({ title: '请在真机检查定位权限后再试', icon: 'none' })
    })
  },

  askAssistantRouteStep(e) {
    const item = (this.data.nearbyResults || [])[Number(e.currentTarget.dataset.index)]
    if (!item) return
    this.askAgent(`我准备去${item.title}，地址是${item.address}，距离${item.distanceText}。请告诉我出发前要准备什么，以及打开地图后看不懂下一步该怎么办。`)
  },

  chooseAssistantImage() {
    if (this.data.loading) {
      wx.showToast({ title: '小享正在处理', icon: 'none' })
      return
    }

    const onPicked = (filePath) => {
      if (!filePath) return
      this.analyzeAssistantImage(filePath)
    }

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = (res.tempFiles || [])[0] || {}
          onPicked(file.tempFilePath)
        },
        fail: () => {}
      })
      return
    }

    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => onPicked((res.tempFilePaths || [])[0])
    })
  },

  analyzeAssistantImage(filePath) {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!fs) {
      wx.showToast({ title: '当前设备暂不支持图片读取', icon: 'none' })
      return
    }

    this.addUserMessage('我上传了一张图片，请小享识别文字、风险和下一步。')
    this.setData({ loading: true })
    wx.showLoading({ title: '识别图片中', mask: true })

    fs.readFile({
      filePath,
      encoding: 'base64',
      success: async (res) => {
        try {
          const profile = await this.getLatestProfile()
          const result = await this.requestApi({
            url: '/assistant/multimodal-analyze',
            method: 'POST',
            data: {
              scene: 'finance_product',
              text: '请从老人能看懂的角度识别图片里的文字、金额、产品、风险和建议。',
              image_base64: res.data,
              profile
            }
          })
          const answer = String(result.answer || result.extracted_text || result.hint || '图片已收到，但暂时没有识别出可用文字。').trim()
          const cards = (result.risk_cards || []).map(item => `${item.title || '风险提醒'}：${item.content || item.reason || ''}`).filter(Boolean)
          const riskLine = result.risk_level && result.risk_level !== 'low' ? `风险等级：${result.risk_level}` : ''
          this.addAssistantMessage([answer, riskLine].concat(cards).filter(Boolean).join('\n'))
        } catch (err) {
          console.error('assistant image analyze failed:', err)
          this.addAssistantMessage(AI_UNAVAILABLE_MESSAGE)
        } finally {
          wx.hideLoading()
          this.setData({ loading: false })
          this.scrollBottom()
        }
      },
      fail: () => {
        wx.hideLoading()
        this.setData({ loading: false })
        wx.showToast({ title: '图片读取失败，请重试', icon: 'none' })
      }
    })
  },

  async askAgent(text, extra = {}) {
    this.addUserMessage(extra.displayText || text)
    this.maybeNotifyFamilyRisk(extra.displayText || text)

    this.setData({
      loading: true
    })

    try {
      const profile = await this.getLatestProfile()

      const history = this.data.messages
        .slice(-12, -1)
        .filter(item => item.role === 'user' || item.role === 'assistant')
        .map(item => {
          return {
            role: item.role,
            text: item.text || ''
          }
        })

      const res = await this.requestApi({
        url: '/assistant/chat',
        method: 'POST',
        data: {
          session_id: this.data.sessionId,
          message: text,
          mode: extra.mode || 'chat',
          term: extra.term || '',
          profile,
          history
        }
      })

      if (!res || res.ok === false) {
        this.addAssistantMessage(AI_UNAVAILABLE_MESSAGE)
        return
      }

      const reply = res.reply || res.answer || ''

      if (!reply) {
        this.addAssistantMessage(AI_UNAVAILABLE_MESSAGE)
        return
      }

      this.addAssistantMessage(reply)
    } catch (err) {
      console.error('assistant chat failed:', err)

      this.addAssistantMessage(AI_UNAVAILABLE_MESSAGE)
    } finally {
      this.setData({
        loading: false
      })

      this.scrollBottom()
    }
  },

  maybeNotifyFamilyRisk(text) {
    const content = String(text || '').trim()
    if (!/转账|验证码|保证金|保本高收益|稳赚不赔|陌生链接|二维码|内部渠道|老师带单|高收益/.test(content)) return
    this.requestApi({
      url: '/family/messages',
      method: 'POST',
      data: {
        content: `风险提醒：长辈刚刚向小享咨询了“${content.slice(0, 80)}”。请帮忙确认是否涉及转账、验证码或陌生渠道。`,
        message_type: 'high_risk'
      }
    }).catch(() => {})
  },

  requestApi({ url, method = 'GET', data = {}, timeout }) {
    const app = getApp()

    if (app.request) {
      return app.request({
        url,
        method,
        data,
        loading: false,
        timeout
      })
    }

    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    const requestTimeout = /^\/assistant\/(chat|multimodal-analyze|voice-to-text|text-to-voice)/.test(url) ? AI_TIMEOUT : (timeout || 20000)
    const startedAt = Date.now()
    let statusCode = 0

    return new Promise((resolve, reject) => {
      wx.request({
        url: baseUrl + url,
        method,
        data,
        timeout: requestTimeout,
        header: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        success: (res) => {
          statusCode = Number(res.statusCode || 0)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            reject(res.data)
          }
        },
        fail: reject,
        complete: () => {
          console.info(`[API] ${String(method).toUpperCase()} ${url} ${Date.now() - startedAt}ms statusCode=${statusCode || 'NETWORK_ERROR'}`)
        }
      })
    })
  },

  goBack() {
    const pages = getCurrentPages ? getCurrentPages() : []

    if (this.data.explainMode) {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.redirectTo({
            url: '/pages/profile/profile'
          })
        }
      })
      return
    }

    if (pages.length > 1) {
      wx.navigateBack({
        delta: 1
      })
    } else {
      wx.redirectTo({
        url: '/pages/index/index'
      })
    }
  },

  goHome() {
    wx.redirectTo({
      url: this.data.isChild ? '/pages/child/index/index' : '/pages/index/index'
    })
  },

  goFinance() {
    wx.redirectTo({
      url: this.data.isChild ? '/pages/family/family' : '/pages/finance/finance'
    })
  },

  goProfile() {
    wx.redirectTo({
      url: this.data.isChild ? '/pages/child/profile/profile' : '/pages/profile/profile'
    })
  },

  understoodAndBack() {
    wx.showToast({
      title: '好的，已返回',
      icon: 'none'
    })

    setTimeout(() => {
      wx.navigateBack({
        fail: () => {
          wx.redirectTo({
            url: '/pages/profile/profile'
          })
        }
      })
    }, 300)
  },

  onUnload() {
    // 清理录音计时器
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    // 【修复L6】页面销毁时停止录音，防止后台持续录音
    if (recorderManager && this.data.recording) {
      try {
        recorderManager.stop()
      } catch (e) {
        // 静默处理
      }
    }
    // 清理 TTS 播放器
    if (ttsAudio) {
      ttsAudio.stop()
      ttsAudio.destroy()
      ttsAudio = null
    }
  }
})

},
"pages/child/alerts/alerts.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', items: [], permissionDenied: false },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }); this.load() },
  load() {
    getApp().request({ url: '/child/elders/' + this.data.elderId + '/alerts' }).then(res => {
      this.setData({ items: res.items || [], permissionDenied: false })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403
      this.setData({ items: [], permissionDenied: denied })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})


},
"pages/child/assist/assist.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', text: '', message: '' },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }) },
  onInput(e) { this.setData({ text: e.detail.value }) },
  generate() {
    if (!this.data.elderId) return wx.showToast({ title: '请先绑定长辈', icon: 'none' })
    getApp().request({
      url: '/child/elders/' + this.data.elderId + '/explain-to-elder',
      method: 'POST',
      data: { text: this.data.text },
      loading: true
    }).then(res => this.setData({ message: res.message || '' })).catch(err => {
      wx.showModal({ title: '暂不能生成', content: (err.data && err.data.detail) || '长辈尚未授权辅助解释', showCancel: false })
    })
  },
  read() { getApp().readText(this.data.message) }
})


},
"pages/child/bind/bind.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', code: '' },
  back: childCommon.back,
  onShow() { childCommon.syncGlobalFont(this) },
  onInput(e) { this.setData({ code: e.detail.value }) },
  submit() {
    if (!/^\d{6}$/.test(this.data.code)) return wx.showToast({ title: '请输入6位数字', icon: 'none' })
    getApp().request({
      url: '/family/bind/accept-code',
      method: 'POST',
      data: { code: this.data.code },
      loading: true
    }).then(res => {
      wx.showModal({ title: '已提交', content: res.message || '请等待长辈确认绑定', showCancel: false, success: () => wx.navigateBack() })
    }).catch(err => {
      wx.showModal({ title: '绑定失败', content: (err.data && err.data.detail) || '绑定码无效或已过期', showCancel: false })
    })
  }
})


},
"pages/child/common.js": function(require,module,exports){
function back() {
  const pages = getCurrentPages ? getCurrentPages() : []

  if (pages.length > 1) {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.redirectTo({ url: '/pages/child/index/index' })
    })
    return
  }

  wx.redirectTo({ url: '/pages/child/index/index' })
}

function syncGlobalFont(page) {
  const app = getApp()
  if (app && app.getGlobalFontSetting && page && page.setData) {
    const font = app.getGlobalFontSetting()
    page.setData({
      fontSizeMode: font.mode,
      globalFontPageClass: font.pageClass
    })
  }
}

function logout() {
  wx.showModal({
    title: '退出登录',
    content: '退出后需要重新登录，长辈和子女账号都可以用手机号或微信登录。',
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

      wx.reLaunch({ url: '/pages/login/login?role=child' })
    }
  })
}

module.exports = {
  back,
  logout,
  syncGlobalFont
}

},
"pages/child/elder-dashboard/elder-dashboard.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', overview: { profile_summary: {}, asset_summary: {}, risk_summary: {}, permissions: {} }, showCareModal: false, careType: 'health' },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }); this.load() },
  load() { getApp().request({ url: '/child/elders/' + this.data.elderId + '/overview' }).then(res => this.setData({ overview: res })) },
  allow(key) {
    if ((this.data.overview.permissions || {})[key]) return true
    wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    return false
  },
  goAlerts() { if (this.allow('receive_alerts')) wx.navigateTo({ url: '/pages/child/alerts/alerts?elder_id=' + this.data.elderId }) },
  goWeekly() {
    const permissions = this.data.overview.permissions || {}
    if (!permissions.view_ledger_summary && !permissions.view_positions) return this.allow('view_ledger_summary')
    wx.navigateTo({ url: '/pages/child/weekly/weekly?elder_id=' + this.data.elderId })
  },
  goLedger() { if (this.allow('view_ledger_summary')) wx.navigateTo({ url: '/pages/child/ledger/ledger?elder_id=' + this.data.elderId }) },
  goPositions() { if (this.allow('view_positions')) wx.navigateTo({ url: '/pages/child/positions/positions?elder_id=' + this.data.elderId }) },
  goHealth() { if (this.allow('view_health')) this.setData({ showCareModal: true, careType: 'health' }) },
  goLocation() { if (this.allow('view_location')) this.setData({ showCareModal: true, careType: 'location' }) },
  closeCareModal() { this.setData({ showCareModal: false }) }
})


},
"pages/child/elder-list/elder-list.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', items: [] },
  back: childCommon.back,
  onShow() { childCommon.syncGlobalFont(this);  this.load() },
  permissionText(perms) {
    return Object.keys(perms || {}).filter(k => perms[k]).join('、') || '暂无'
  },
  load() { getApp().request({ url: '/child/elders' }).then(res => this.setData({ items: res.items || [] })) },
  open(e) { wx.navigateTo({ url: '/pages/child/elder-dashboard/elder-dashboard?elder_id=' + e.currentTarget.dataset.id }) },
  bind() { wx.navigateTo({ url: '/pages/child/bind/bind' }) }
})


},
"pages/child/health/health.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', loading: true, permissionDenied: false, summary: null },
  back: childCommon.back,
  onLoad(options = {}) { this.setData({ elderId: options.elder_id || '' }); childCommon.syncGlobalFont(this); this.load() },
  onShow() { childCommon.syncGlobalFont(this) },
  load() {
    getApp().request({ url: `/child/elders/${this.data.elderId}/health-reminders`, loading: false }).then(res => {
      const formatTime = value => String(value || '').replace('T', ' ').slice(0, 16)
      const decorate = list => (list || []).map(item => ({ ...item, timeText: formatTime(item.created_at) }))
      this.setData({
        summary: Object.assign({ meds: [], meals: [], exercises: [] }, res || {}, {
          meals: decorate(res.meals),
          exercises: decorate(res.exercises)
        }),
        permissionDenied: false,
        loading: false
      })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      this.setData({ summary: null, permissionDenied: denied, loading: false })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})

},
"pages/child/index/index.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    dashboard: { bound_elders: [] },
    elders: [],
    weeklyReports: [],
    healthSummaries: [],
    latestMessages: [],
    elderCount: 0,
    alertCount: 0,
    messageCount: 0,
    accountName: '子女协同端',
    avatar: '/assets/ui/default_avatar.png',
    editNickname: '',
    weatherCard: { city: '当前区域', weather: '--', temperature: '--', suggestion: '' },
    newsItems: [],
    groupUnreadCount: 0,
    showMessageModal: false,
    messagePeerId: 0,
    showCareModal: false,
    careType: 'health',
    careElderId: 0
  },
  onShow() {
    childCommon.syncGlobalFont(this)
    this.loadChildHomeInfo()
    this.load()
    getApp().checkFamilyGroupUnread(true).then(count => this.setData({ groupUnreadCount: count }))
  },
  logout: childCommon.logout,
  load() {
    const resolveAvatar = value => getApp().resolveMediaUrl ? getApp().resolveMediaUrl(value) : value
    const user = wx.getStorageSync('user') || {}
    const profile = wx.getStorageSync('profile') || {}
    this.setData({
      accountName: user.nickname || profile.nickname || '子女协同端',
      editNickname: user.nickname || profile.nickname || '',
      avatar: resolveAvatar(user.avatar || user.avatarUrl || profile.avatar) || '/assets/ui/default_avatar.png'
    })
    getApp().request({ url: '/user/profile', loading: false }).then(res => {
      const p = res.profile || {}
      const u = res.user || user
      const nickname = p.nickname || u.nickname || this.data.accountName
      const avatar = resolveAvatar(p.avatar || u.avatar || this.data.avatar)
      this.setData({ accountName: nickname, editNickname: nickname, avatar })
      wx.setStorageSync('profile', Object.assign({}, p, { nickname, avatar }))
      wx.setStorageSync('user', Object.assign({}, user, u, { nickname, avatar, avatarUrl: avatar }))
    }).catch(() => {})
    getApp().request({ url: '/home/child-dashboard' }).then(res => {
      const elders = this.decorateElders(res.bound_elders || [])
      if (user.id && elders.length) wx.setStorageSync(`bound_family_members_${user.id}`, elders)
      this.setData({
        dashboard: res,
        elders,
        weeklyReports: res.weekly_reports || [],
        healthSummaries: res.health_summaries || [],
        latestMessages: res.latest_messages || [],
        elderCount: elders.length,
        alertCount: res.total_unread_alerts || 0,
        messageCount: res.message_unread_count || 0
      })
    }).catch(() => {
      getApp().request({ url: '/child/elders' }).then(res => {
        const elders = this.decorateElders(res.items || [])
        if (user.id && elders.length) wx.setStorageSync(`bound_family_members_${user.id}`, elders)
        this.setData({ elders, elderCount: elders.length, alertCount: elders.reduce((sum, item) => sum + Number(item.unread_alerts || 0), 0) })
      }).catch(() => {})
    })
  },
  decorateElders(list) {
    return (list || []).map(item => {
      const elderUserId = Number(item.elder_user_id || item.peer_id || item.user_id || item.id || 0)
      let permissions = item.permissions || {}
      if (typeof permissions === 'string') {
        try { permissions = JSON.parse(permissions) } catch (e) { permissions = {} }
      }
      const normalizedPermissions = {
        view_positions: !!permissions.view_positions,
        view_ledger_summary: !!permissions.view_ledger_summary,
        receive_alerts: !!permissions.receive_alerts,
        view_messages: !!permissions.view_messages,
        view_group_chat: !!permissions.view_group_chat,
        view_health: !!permissions.view_health,
        view_location: !!permissions.view_location
      }
      const remarkKey = `family_remark_${elderUserId}`
      const remark = item.remark || wx.getStorageSync(remarkKey) || ''
      return Object.assign({}, item, {
        elder_user_id: elderUserId,
        permissions: normalizedPermissions,
        remark,
        display_name: remark || item.display_name || item.nickname || '长辈'
      })
    })
  },
  loadChildHomeInfo() {
    getApp().request({ url: '/weather/today', loading: false }).then(res => {
      this.setData({ weatherCard: {
        city: res.city || '当前区域',
        weather: res.weather || '--',
        temperature: res.temperature || res.temp || '--',
        suggestion: res.suggestion || ''
      } })
    }).catch(() => {})
    if (this._newsLoaded) return
    this._newsLoaded = true
    getApp().request({ url: '/market/daily', loading: false }).then(res => {
      const items = res && res.success !== false ? (res.items || []).slice(0, 3) : []
      this.setData({ newsItems: items })
    }).catch(() => this.setData({ newsItems: [] }))
  },
  openChildNews(e) {
    const item = (this.data.newsItems || [])[Number(e.currentTarget.dataset.index)]
    if (!item) return
    wx.showModal({ title: item.title || '今日资讯', content: item.summary || item.title || '暂无摘要', showCancel: false, confirmText: '知道了' })
  },
  onNicknameInput(e) {
    this.setData({ editNickname: e.detail.value })
  },
  chooseAvatar() {
    const save = (filePath) => {
      const app = getApp()
      const token = wx.getStorageSync('token') || ''
      wx.showLoading({ title: '上传头像中', mask: true })
      wx.uploadFile({
        url: app.globalData.baseUrl + '/user/avatar/upload',
        filePath,
        name: 'file',
        header: { Authorization: token ? `Bearer ${token}` : '' },
        success: res => {
          try {
            const data = JSON.parse(res.data || '{}')
            if (!data.ok || !data.avatar) throw new Error('upload failed')
            const avatar = app.resolveMediaUrl ? app.resolveMediaUrl(data.avatar) : data.avatar
            this.setData({ avatar })
            this.saveProfile({ avatar, avatarUrl: avatar }, false)
            wx.showToast({ title: '头像已保存', icon: 'success' })
          } catch (e) {
            wx.showToast({ title: '头像上传失败', icon: 'none' })
          }
        },
        fail: () => wx.showToast({ title: '头像上传失败', icon: 'none' }),
        complete: () => wx.hideLoading()
      })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = (res.tempFiles || [])[0]
          if (file && file.tempFilePath) save(file.tempFilePath)
        }
      })
      return
    }
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => {
        const avatar = (res.tempFilePaths || [])[0]
        if (avatar) save(avatar)
      }
    })
  },
  saveProfile(extra = {}, toast = true) {
    const nickname = String(this.data.editNickname || this.data.accountName || '').trim() || '子女用户'
    const avatar = extra.avatar || this.data.avatar
    const payload = Object.assign({ nickname, avatar, avatarUrl: avatar }, extra)
    const user = wx.getStorageSync('user') || {}
    wx.setStorageSync('user', Object.assign({}, user, payload))
    wx.setStorageSync('profile', Object.assign({}, wx.getStorageSync('profile') || {}, payload))
    this.setData({ accountName: nickname, editNickname: nickname, avatar })
    getApp().request({
      url: '/user/profile/update',
      method: 'POST',
      data: payload,
      loading: false
    }).then(() => {
      if (toast) wx.showToast({ title: '资料已保存', icon: 'success' })
    }).catch(() => {
      if (toast) wx.showToast({ title: '已先保存到本机', icon: 'none' })
    })
  },
  setElderRemark(e) {
    const peerId = e.currentTarget.dataset.id
    if (!peerId) return
    wx.showModal({
      title: '设置家人备注',
      editable: true,
      placeholderText: '例如：妈妈、爸爸',
      success: (res) => {
        if (!res.confirm) return
        const remark = String(res.content || '').trim().slice(0, 40)
        wx.setStorageSync(`family_remark_${peerId}`, remark)
        getApp().request({
          url: '/family/member/remark',
          method: 'POST',
          data: { peer_id: peerId, remark },
          loading: false
        }).finally(() => this.load())
      }
    })
  },
  firstElderId() { return (this.data.elders[0] && this.data.elders[0].elder_user_id) || '' },
  elderById(elderId) { return (this.data.elders || []).find(item => String(item.elder_user_id) === String(elderId)) || (this.data.elders || [])[0] || {} },
  allowForElder(elderId, permissionKey) {
    const elder = this.elderById(elderId)
    if ((elder.permissions || {})[permissionKey]) return true
    wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    return false
  },
  goBind() { wx.navigateTo({ url: '/pages/child/bind/bind' }) },
  goList() { wx.navigateTo({ url: '/pages/child/elder-list/elder-list' }) },
  goAssist() { wx.navigateTo({ url: '/pages/child/assist/assist?elder_id=' + this.firstElderId() }) },
  goPermissions() { wx.navigateTo({ url: '/pages/child/permissions/permissions' }) },
  goMoney() { wx.navigateTo({ url: '/pages/money/money' }) },
  goDashboard(e) { wx.navigateTo({ url: '/pages/child/elder-dashboard/elder-dashboard?elder_id=' + e.currentTarget.dataset.id }) },
  goAlerts(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset.id
    if (!id) return wx.showToast({ title: '暂无绑定长辈', icon: 'none' })
    if (!this.allowForElder(id, 'receive_alerts')) return
    wx.navigateTo({ url: '/pages/child/alerts/alerts?elder_id=' + id })
  },
  goWeekly(e) {
    const id = e.currentTarget.dataset.id
    const permissions = (this.elderById(id).permissions || {})
    if (!permissions.view_ledger_summary && !permissions.view_positions) return this.allowForElder(id, 'view_ledger_summary')
    wx.navigateTo({ url: '/pages/child/weekly/weekly?elder_id=' + id })
  },
  goMessages(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset.id) || this.firstElderId()
    if (!this.allowForElder(id, 'view_messages')) return
    this.setData({ showMessageModal: true, messagePeerId: Number(id || 0) })
  },
  goGroupChat() { const id = this.firstElderId(); if (this.allowForElder(id, 'view_group_chat')) wx.navigateTo({ url: '/pages/family-group-chat/family-group-chat' }) },
  goHealth(e) { const id = (e && e.currentTarget && e.currentTarget.dataset.id) || this.firstElderId(); if (this.allowForElder(id, 'view_health')) this.setData({ showCareModal: true, careType: 'health', careElderId: Number(id) }) },
  goLocation(e) { const id = (e && e.currentTarget && e.currentTarget.dataset.id) || this.firstElderId(); if (this.allowForElder(id, 'view_location')) this.setData({ showCareModal: true, careType: 'location', careElderId: Number(id) }) },
  closeMessageModal() { this.setData({ showMessageModal: false, messagePeerId: 0 }) },
  closeCareModal() { this.setData({ showCareModal: false, careElderId: 0 }) },
  goChildHome() {},
  goAssistant() { wx.navigateTo({ url: '/pages/assistant/assistant' }) },
  goFamily() { wx.navigateTo({ url: '/pages/family/family' }) },
  goChildProfile() { wx.navigateTo({ url: '/pages/child/profile/profile' }) }
})

},
"pages/child/ledger/ledger.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', summary: {}, records: [], safeNote: '' },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }); this.load() },
  load() {
    getApp().request({ url: '/child/elders/' + this.data.elderId + '/ledger-summary' }).then(res => {
      this.setData({ summary: res.summary || {}, records: res.records || [], safeNote: res.safe_note || '' })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403
      this.setData({ summary: {}, records: [], safeNote: denied ? '长辈暂未开放该权限' : '账本暂时无法读取' })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})


},
"pages/child/location/location.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', loading: true, permissionDenied: false, location: null },
  back: childCommon.back,
  onLoad(options = {}) { this.setData({ elderId: options.elder_id || '' }); childCommon.syncGlobalFont(this); this.load() },
  onShow() { childCommon.syncGlobalFont(this) },
  load() {
    getApp().request({ url: `/child/elders/${this.data.elderId}/location`, loading: false }).then(res => {
      const location = res.location || null
      if (location) location.timeText = String(location.updated_at || '').replace('T', ' ').slice(0, 16)
      this.setData({ location, permissionDenied: false, loading: false })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      this.setData({ location: null, permissionDenied: denied, loading: false })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})

},
"pages/child/permissions/permissions.js": function(require,module,exports){
const labels = {
  view_positions: '理财记录',
  view_ledger_summary: '日常收支记录',
  receive_alerts: '风险提示',
  view_messages: '留言',
  view_group_chat: '群聊',
  view_health: '健康',
  view_location: '位置'
}
const keys = Object.keys(labels)
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', items: [], permissionKeys: keys },
  back: childCommon.back,
  onShow() { childCommon.syncGlobalFont(this);  this.load() },
  load() {
    getApp().request({ url: '/child/elders' }).then(res => {
      const items = (res.items || []).map(item => ({
        ...item,
        permissionRows: keys.map(k => ({ key: k, label: labels[k], enabled: !!(item.permissions && item.permissions[k]) }))
      }))
      this.setData({ items })
    })
  }
})


},
"pages/child/positions/positions.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', items: [], safeNote: '' },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }); this.load() },
  load() {
    getApp().request({ url: '/child/elders/' + this.data.elderId + '/positions' }).then(res => {
      this.setData({ items: res.items || [], safeNote: res.safe_note || '' })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403
      this.setData({ items: [], safeNote: denied ? '长辈暂未开放该权限' : '理财记录暂时无法读取' })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})


},
"pages/child/profile/profile.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    nickname: '',
    avatar: '/assets/ui/default_avatar.png',
    phone: '',
    familyMembers: []
  },
  onShow() {
    childCommon.syncGlobalFont(this)
    const user = wx.getStorageSync('user') || {}
    const profile = wx.getStorageSync('profile') || {}
    const resolve = value => getApp().resolveMediaUrl ? getApp().resolveMediaUrl(value) : value
    this.setData({
      nickname: user.nickname || profile.nickname || '',
      avatar: resolve(user.avatar || profile.avatar) || '/assets/ui/default_avatar.png',
      phone: user.phone || ''
    })
    getApp().request({ url: '/family/members', loading: false }).then(res => this.setData({ familyMembers: res.items || [] })).catch(() => {})
  },
  goBack() { wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/child/index/index' }) }) },
  onNicknameInput(e) { this.setData({ nickname: e.detail.value }) },
  onChooseAvatar(e) {
    const filePath = e.detail && e.detail.avatarUrl
    if (!filePath) return
    const app = getApp()
    wx.uploadFile({
      url: app.globalData.baseUrl + '/user/avatar/upload',
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${wx.getStorageSync('token') || ''}` },
      success: res => {
        try {
          const data = JSON.parse(res.data || '{}')
          if (data.avatar) this.setData({ avatar: app.resolveMediaUrl ? app.resolveMediaUrl(data.avatar) : data.avatar })
        } catch (err) { wx.showToast({ title: '头像上传失败', icon: 'none' }) }
      },
      fail: () => wx.showToast({ title: '头像上传失败', icon: 'none' })
    })
  },
  saveProfile() {
    const nickname = String(this.data.nickname || '').trim()
    if (!nickname) return wx.showToast({ title: '昵称不能为空', icon: 'none' })
    getApp().request({
      url: '/user/profile/update',
      method: 'POST',
      data: { nickname, avatar: this.data.avatar, avatarUrl: this.data.avatar },
      loading: true
    }).then(res => {
      const oldUser = wx.getStorageSync('user') || {}
      wx.setStorageSync('user', Object.assign({}, oldUser, { nickname, avatar: this.data.avatar }))
      wx.setStorageSync('profile', Object.assign({}, wx.getStorageSync('profile') || {}, res.profile || {}, { nickname, avatar: this.data.avatar }))
      wx.showToast({ title: '资料已保存', icon: 'success' })
    })
  },
  goBind() { wx.navigateTo({ url: '/pages/child/bind/bind' }) },
  goChildHome() { wx.redirectTo({ url: '/pages/child/index/index' }) },
  goAssistant() { wx.redirectTo({ url: '/pages/assistant/assistant' }) },
  goFamily() { wx.redirectTo({ url: '/pages/family/family' }) },
  logout: childCommon.logout
})

},
"pages/child/weekly/weekly.js": function(require,module,exports){
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', report: null, message: '正在读取金融周报' },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }); this.load() },
  load() {
    getApp().request({ url: '/child/elders/' + this.data.elderId + '/weekly-report' }).then(res => {
      this.setData({
        report: res.report || null,
        message: res.message || (res.report ? '' : '暂无金融周报数据')
      })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403
      this.setData({ report: null, message: denied ? '长辈暂未开放该权限' : '暂无金融周报数据' })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})


},
"pages/family/family.js": function(require,module,exports){
function safeText(text, maxLen, fallback) {
  let value = String(text || '').replace(/\s+/g, ' ').trim()

  if (!value) {
    value = fallback || ''
  }

  if (value.length > maxLen) {
    value = value.slice(0, maxLen - 1) + '。'
  }

  return value
}

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    isElder: true,
    familyCode: '',
    familyList: [],
    primaryMember: null,
    pendingBindings: [],
    phoneList: [],

    alertText: '暂无异常提醒',
    weeklyText: '暂无金融周报数据',

    aiLoading: false,

    showAddPanel: false,
    newName: '',
    newRelation: '',
    newPhone: '',
    groupUnreadCount: 0,
    showPermissionModal: false,
    permissionTarget: null,
    permissionDraft: {},
    showMessageModal: false,
    messagePeerId: 0,
    showCareModal: false,
    careType: 'health',
    careElderId: 0
  },

  onLoad() {
    this.syncRoleAndFont()
    if (this.data.isElder && typeof window === 'undefined') {
      wx.setStorageSync('openElderPermissionPanel', true)
      wx.redirectTo({ url: '/pages/index/index' })
      return
    }
    this.refreshPage()
    getApp().checkFamilyGroupUnread(false).then(count => this.setData({ groupUnreadCount: count }))
    this.refreshAIAnalysis()
  },

  onShow() {
    this.syncRoleAndFont()
    if (this.data.isElder && typeof window === 'undefined') return
    this.refreshPage()
    getApp().checkFamilyGroupUnread(false).then(count => this.setData({ groupUnreadCount: count }))
  },

  syncRoleAndFont() {
    const app = getApp()
    const font = app.getGlobalFontSetting ? app.getGlobalFontSetting() : { pageClass: 'font-global-normal' }
    const user = wx.getStorageSync('user') || {}
    const role = user.role || wx.getStorageSync('role') || 'elder'
    this.setData({
      globalFontPageClass: font.pageClass,
      isElder: role === 'elder'
    })
  },

  normalizeFamilyItem(item) {
    let permissions = item.permissions || {}
    if (typeof permissions === 'string') {
      try { permissions = JSON.parse(permissions) } catch (e) { permissions = {} }
    }
    const rawId = String(item.id || item.mid || Date.now())
    const isBinding = !!item.binding_id || rawId.indexOf('binding-') === 0
    const permissionMap = permissions && !Array.isArray(permissions) ? permissions : {}
    const elderUserId = Number(item.elder_user_id || item.peer_id || item.user_id || 0)
    return {
      ...item,
      id: rawId,
      elderUserId,
      isBinding,
      bindingId: isBinding ? Number(item.binding_id || rawId.replace('binding-', '')) : 0,
      canViewAlert: item.canViewAlert !== undefined
        ? item.canViewAlert
        : (item.enabled !== false && (
          permissionMap.receive_alerts !== undefined
            ? !!permissionMap.receive_alerts
            : (permissions.length === 0 || permissions.indexOf('异常提醒') >= 0)
        )),
      canViewReport: item.canViewReport !== undefined
        ? item.canViewReport
        : (item.enabled !== false && (
          permissionMap.view_weekly_report !== undefined
            ? !!permissionMap.view_weekly_report
            : (permissions.length === 0 || permissions.indexOf('资产周报') >= 0 || permissions.indexOf('家庭周报') >= 0)
        )),
      canViewLedger: permissionMap.view_ledger_summary !== undefined ? !!permissionMap.view_ledger_summary : true,
      canViewPositions: permissionMap.view_positions !== undefined ? !!permissionMap.view_positions : true,
      canViewMessages: permissionMap.view_messages !== undefined ? !!permissionMap.view_messages : true,
      canViewGroupChat: permissionMap.view_group_chat !== undefined ? !!permissionMap.view_group_chat : true,
      canViewHealth: permissionMap.view_health !== undefined ? !!permissionMap.view_health : !!permissionMap.view_health_reminders,
      canViewLocation: permissionMap.view_location !== undefined ? !!permissionMap.view_location : true
    }
  },

  setFamilyData(familyList) {
    const seen = {}
    const list = []
    ;(familyList || []).map(this.normalizeFamilyItem).forEach(item => {
      const phoneKey = String(item.phone || '').replace(/\D+/g, '')
      const key = phoneKey || `${item.name || ''}|${item.relation || ''}`
      if (seen[key]) return
      seen[key] = true
      list.push(item)
    })
    const phoneSeen = {}
    const phoneList = []
    list.forEach(item => {
      const phoneKey = String(item.phone || '').replace(/\D+/g, '')
      const key = phoneKey || `${item.name || ''}|${item.id}`
      if (!item.phone || phoneSeen[key]) return
      phoneSeen[key] = true
      phoneList.push({ id: item.id, name: item.name, phone: item.phone })
    })
    wx.setStorageSync('family_list', list)
    const user = wx.getStorageSync('user') || {}
    if (user.id && list.length) wx.setStorageSync(`bound_family_members_${user.id}`, list)
    this.setData({
      familyList: list,
      primaryMember: list[0] || null,
      phoneList
    })
  },

  refreshPage() {
    this.setData({ familyCode: wx.getStorageSync('family_code') || '' })
    this.setFamilyData([])

    getApp().request({ url: '/family/bind-code' }).then(res => {
      if (res.code) {
        wx.setStorageSync('family_code', res.code)
        this.setData({ familyCode: res.code })
      }
    }).catch(() => {
      this.setData({ familyCode: '' })
    })

    getApp().request({ url: '/family/members' }).then(res => {
      this.setFamilyData(res.items || [])
    }).catch(() => {
      this.setFamilyData([])
    })

    getApp().request({ url: '/family/pending-bindings' }).then(res => {
      this.setData({ pendingBindings: res.items || [] })
    }).catch(() => {})
  },

  openBindAction() {
    if (this.data.isElder) {
      wx.showActionSheet({
        itemList: ['复制或生成我的绑定码', '输入另一位长辈的绑定码'],
        success: res => {
          if (res.tapIndex === 0) {
            if (this.data.familyCode) this.copyCode()
            else this.refreshCode()
          } else {
            this.promptFamilyCode()
          }
        }
      })
      return
    }
    this.goChildBind()
  },

  promptFamilyCode() {
    wx.showModal({
      title: '输入家庭绑定码',
      editable: true,
      placeholderText: '请输入6位绑定码',
      success: res => {
        if (!res.confirm) return
        const code = String(res.content || '').trim()
        if (!/^\d{6}$/.test(code)) return wx.showToast({ title: '请输入6位绑定码', icon: 'none' })
        getApp().request({
          url: '/family/bind/accept-code',
          method: 'POST',
          data: { code, relation: '长辈' },
          loading: true
        }).then(() => {
          wx.showToast({ title: '家庭已合并', icon: 'success' })
          this.refreshPage()
        }).catch(() => wx.showToast({ title: '绑定码无效或已使用', icon: 'none' }))
      }
    })
  },

  ensureChildPermission(key) {
    if (this.data.isElder) return true
    const member = this.data.primaryMember || (this.data.familyList || [])[0] || {}
    if (member[key]) return true
    wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    return false
  },
  primaryElderId() {
    const member = this.data.primaryMember || (this.data.familyList || [])[0] || {}
    return Number(member.elderUserId || member.elder_user_id || member.peer_id || 0)
  },
  openChildFeature(permissionKey, path) {
    const elderId = this.primaryElderId()
    if (!elderId) {
      wx.showToast({ title: '请先在“我的”完成家庭绑定', icon: 'none' })
      return
    }
    if (!this.ensureChildPermission(permissionKey)) return
    const joiner = path.indexOf('?') >= 0 ? '&' : '?'
    wx.navigateTo({ url: `${path}${joiner}elder_id=${elderId}` })
  },
  goChildBind() { wx.navigateTo({ url: '/pages/child/bind/bind' }) },
  goFamilyLedger() { if (this.data.isElder) return wx.navigateTo({ url: '/pages/money/money?family=1' }); this.openChildFeature('canViewLedger', '/pages/child/ledger/ledger') },
  goPositions() { this.openChildFeature('canViewPositions', '/pages/child/positions/positions') },
  goAlerts() { this.openChildFeature('canViewAlert', '/pages/child/alerts/alerts') },
  goHealth() {
    const elderId = this.primaryElderId()
    if (elderId && this.ensureChildPermission('canViewHealth')) this.setData({ showCareModal: true, careType: 'health', careElderId: elderId })
  },
  goLocation() {
    const elderId = this.primaryElderId()
    if (elderId && this.ensureChildPermission('canViewLocation')) this.setData({ showCareModal: true, careType: 'location', careElderId: elderId })
  },
  goWeekly() {
    if (this.data.isElder) return wx.showModal({ title: '家庭金融周报', content: this.data.weeklyText, showCancel: false })
    const member = this.data.primaryMember || {}
    if (!member.canViewLedger && !member.canViewPositions) {
      this.ensureChildPermission('canViewLedger')
      return
    }
    this.openChildFeature(member.canViewLedger ? 'canViewLedger' : 'canViewPositions', '/pages/child/weekly/weekly')
  },
  goMessages() {
    if (this.data.isElder) return wx.navigateTo({ url: '/pages/family-messages/family-messages' })
    const elderId = this.primaryElderId()
    if (elderId && this.ensureChildPermission('canViewMessages')) this.setData({ showMessageModal: true, messagePeerId: elderId })
  },
  goGroupChat() { if (this.data.isElder) return wx.navigateTo({ url: '/pages/family-group-chat/family-group-chat' }); this.openChildFeature('canViewGroupChat', '/pages/family-group-chat/family-group-chat') },
  closeMessageModal() { this.setData({ showMessageModal: false, messagePeerId: 0 }) },
  closeCareModal() { this.setData({ showCareModal: false, careElderId: 0 }) },
  goAssistant() { wx.navigateTo({ url: '/pages/assistant/assistant' }) },
  goHome() {
    const role = wx.getStorageSync('role') || 'elder'
    wx.redirectTo({ url: role === 'child' ? '/pages/child/index/index' : '/pages/index/index' })
  },
  goProfile() {
    const role = wx.getStorageSync('role') || 'elder'
    wx.navigateTo({ url: role === 'child' ? '/pages/child/profile/profile' : '/pages/profile/profile' })
  },

  setFamilyRemark(e) {
    const peerId = e.currentTarget.dataset.id
    if (!peerId) return
    wx.showModal({
      title: '设置家人备注',
      editable: true,
      placeholderText: '例如：妈妈、爸爸、女儿',
      success: res => {
        if (!res.confirm) return
        const remark = String(res.content || '').trim().slice(0, 40)
        getApp().request({
          url: '/family/member/remark',
          method: 'POST',
          data: { peer_id: peerId, remark },
          loading: true
        }).then(() => this.refreshPage()).catch(() => wx.showToast({ title: '备注暂未保存，请稍后再试', icon: 'none' }))
      }
    })
  },

  openPermissionModal(e) {
    if (!this.data.isElder) return
    const id = String(e.currentTarget.dataset.id || '')
    const target = (this.data.familyList || []).find(item => String(item.id) === id)
    if (!target) return
    this.setData({
      showPermissionModal: true,
      permissionTarget: target,
      permissionDraft: {
        canViewPositions: !!target.canViewPositions,
        canViewLedger: !!target.canViewLedger,
        canViewAlert: !!target.canViewAlert,
        canViewMessages: !!target.canViewMessages,
        canViewGroupChat: !!target.canViewGroupChat,
        canViewHealth: !!target.canViewHealth,
        canViewLocation: !!target.canViewLocation
      }
    })
  },

  closePermissionModal() {
    this.setData({ showPermissionModal: false, permissionTarget: null, permissionDraft: {} })
  },

  changePermissionDraft(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ [`permissionDraft.${key}`]: !!e.detail.value })
  },

  savePermissionModal() {
    const target = this.data.permissionTarget
    const draft = this.data.permissionDraft || {}
    if (!this.data.isElder || !target || !target.bindingId) return
    getApp().request({
      url: `/family/bindings/${target.bindingId}/permissions`,
      method: 'PUT',
      data: {
        view_positions: !!draft.canViewPositions,
        view_ledger_summary: !!draft.canViewLedger,
        receive_alerts: !!draft.canViewAlert,
        view_messages: !!draft.canViewMessages,
        view_group_chat: !!draft.canViewGroupChat,
        view_health: !!draft.canViewHealth,
        view_location: !!draft.canViewLocation
      },
      loading: true
    }).then(() => {
      const familyList = (this.data.familyList || []).map(item => String(item.id) === String(target.id) ? { ...item, ...draft } : item)
      this.setFamilyData(familyList)
      this.closePermissionModal()
      wx.showToast({ title: '权限已保存', icon: 'success' })
    }).catch(() => wx.showToast({ title: '权限暂未保存', icon: 'none' }))
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.familyCode,
      success: () => {
        wx.showToast({
          title: '绑定码已复制',
          icon: 'success'
        })
      }
    })
  },

  refreshCode() {
    getApp().request({ url: '/family/bind-code/refresh', method: 'POST', loading: true }).then(res => {
      const code = res.code || ''
      if (!code) {
        wx.showToast({ title: '刷新失败', icon: 'none' })
        return
      }
      wx.setStorageSync('family_code', code)
      this.setData({ familyCode: code })
      wx.showToast({ title: '已刷新', icon: 'success' })
    }).catch(() => {
      wx.showToast({ title: '暂时没有刷新成功，请稍后再试', icon: 'none' })
    })
  },

  confirmBinding(e) {
    const id = e.currentTarget.dataset.id
    getApp().request({
      url: '/family/bindings/' + id + '/confirm',
      method: 'POST',
      loading: true
    }).then(() => {
      wx.showToast({ title: '已确认', icon: 'success' })
      this.refreshPage()
    })
  },

  rejectBinding(e) {
    const id = e.currentTarget.dataset.id
    getApp().request({
      url: '/family/bindings/' + id + '/reject',
      method: 'POST',
      loading: true
    }).then(() => {
      wx.showToast({ title: '已拒绝', icon: 'success' })
      this.refreshPage()
    })
  },

  openAddPanel() {
    this.setData({
      showAddPanel: true,
      newName: '',
      newRelation: '',
      newPhone: ''
    })
  },

  closeAddPanel() {
    this.setData({
      showAddPanel: false
    })
  },

  stopTap() {},

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({
      [key]: e.detail.value
    })
  },

  confirmAddFamily() {
    const name = (this.data.newName || '').trim()
    const relation = (this.data.newRelation || '').trim()
    const phone = (this.data.newPhone || '').trim()

    if (!name || !relation || !phone) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    if (phone.length < 6) {
      wx.showToast({ title: '手机号不完整', icon: 'none' })
      return
    }

    getApp().request({
      url: '/family/members',
      method: 'POST',
      data: { name, relation, phone },
      loading: true
    }).then(() => {
      this.setData({ showAddPanel: false })
      this.refreshPage()
      this.refreshAIAnalysis()
      wx.showToast({ title: '已添加家人', icon: 'success' })
    }).catch(err => {
      wx.showToast({
        title: '暂时没有添加成功，请检查绑定码后再试',
        icon: 'none'
      })
    })
  },

  togglePermission(e) {
    const id = String(e.currentTarget.dataset.id)
    const key = e.currentTarget.dataset.key
    const value = e.detail.value

    const familyList = this.data.familyList.map(item => {
      if (String(item.id) === id) {
        return { ...item, [key]: value }
      }
      return item
    })

    this.setFamilyData(familyList)

    const target = familyList.find(item => String(item.id) === id) || {}
    if (target.isBinding && target.bindingId) {
      getApp().request({
        url: '/family/bindings/' + target.bindingId + '/permissions',
        method: 'PUT',
        data: {
          view_positions: !!target.canViewPositions,
          view_ledger_summary: !!target.canViewLedger,
          receive_alerts: !!target.canViewAlert,
          view_messages: !!target.canViewMessages,
          view_group_chat: !!target.canViewGroupChat,
          view_health: !!target.canViewHealth,
          view_location: !!target.canViewLocation
        }
      }).catch(() => {})
    } else {
      getApp().request({
        url: '/family/members/' + id,
        method: 'PUT',
        data: { enabled: !!(target.canViewAlert || target.canViewReport) }
      }).catch(() => {})
    }

    this.refreshAIAnalysis()
  },

  deleteFamily(e) {
    const id = String(e.currentTarget.dataset.id)
    const target = (this.data.familyList || []).find(item => String(item.id) === id)

    wx.showModal({
      title: target && target.isBinding ? '解除绑定' : '删除家人',
      content: target && target.isBinding ? '确定解除这个子女协同账号吗？解除后对方不能再查看提醒和周报。' : '确定要删除这个协同家人吗？',
      confirmText: target && target.isBinding ? '解除' : '删除',
      success: (res) => {
        if (!res.confirm) return

        const localDelete = () => {
          const familyList = this.data.familyList.filter(item => String(item.id) !== id)
          this.setFamilyData(familyList)
          wx.showToast({ title: target && target.isBinding ? '已解除' : '已删除', icon: 'success' })
          this.refreshAIAnalysis()
        }

        if (target && target.isBinding && target.bindingId) {
          getApp().request({
            url: '/family/bindings/' + target.bindingId,
            method: 'DELETE',
            loading: true
          }).then(() => {
            localDelete()
          }).catch(() => {
            wx.showToast({ title: '暂时没有解除成功，请稍后再试', icon: 'none' })
          })
          return
        }

        getApp().request({
          url: '/family/members/' + id,
          method: 'DELETE',
          loading: true
        }).then(() => {
          localDelete()
        }).catch(() => {
          wx.showToast({ title: '暂时没有删除成功，请稍后再试', icon: 'none' })
        })
      }
    })
  },

  callPhone(e) {
    const phone = e.currentTarget.dataset.phone

    if (!phone) {
      wx.showToast({
        title: '暂无电话',
        icon: 'none'
      })
      return
    }

    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {
        wx.showToast({
          title: '无法拨打',
          icon: 'none'
        })
      }
    })
  },

  refreshAIAnalysis() {
    this.setData({ aiLoading: true })
    const anomalyReq = getApp().request({ url: '/family/anomaly' }).then(res => {
      this.setData({ alertText: safeText(res.summary || '暂无异常提醒', 42, '暂无异常提醒') })
    }).catch(() => {
      this.setData({ alertText: '暂无异常提醒' })
    })
    const weeklyReq = getApp().request({ url: '/family/weekly-report' }).then(res => {
      this.setData({ weeklyText: safeText(res.summary || '暂无金融周报数据', 48, '暂无金融周报数据') })
    }).catch(() => {
      this.setData({ weeklyText: '暂无金融周报数据' })
    })
    Promise.all([anomalyReq, weeklyReq]).then(() => {
      this.setData({ aiLoading: false })
    })
  },

  back() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  // ---- 语音输入 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/assistant/assistant?question=' + encodeURIComponent(text),
        fail: (err) => {
          console.error('[家庭] 语音跳转失败:', err)
          wx.showToast({ title: '跳转失败，请重试', icon: 'none' })
        }
      })
    }, 100)
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})

},
"pages/family-group-chat/family-group-chat.js": function(require,module,exports){
const termHelper = require('../../utils/termExplain.js')

const app = getApp()
let recorderManager = null
let recordTimer = null

try {
  recorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null
} catch (e) {
  recorderManager = null
}

function genId(prefix = 'local') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`
}

function formatTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16)
}

function domIdOf(id) {
  return `msg_${String(id || genId('msg')).replace(/[^A-Za-z0-9_-]/g, '_')}`
}

function firstChar(name, fallback) {
  const text = String(name || fallback || '').trim()
  return text ? text.slice(0, 1) : fallback
}

function decorateMessage(item, userId) {
  const id = item.id || genId('msg')
  const type = item.message_type || 'user'
  const isAssistant = type === 'assistant'
  const isImage = type === 'image'
  const isMine = !isAssistant && String(item.sender_id || '') === String(userId || '')
  const senderName = isAssistant ? '小享' : (item.sender_name || (isMine ? '我' : '家人'))

  return {
    ...item,
    id,
    domId: domIdOf(id),
    sender_name: senderName,
    timeText: formatTime(item.created_at),
    isMine,
    isAssistant,
    isImage,
    alignClass: isMine ? 'mine' : 'other',
    avatarText: isAssistant ? '享' : firstChar(senderName, '家'),
    avatar: isAssistant
      ? '/assets/ui/assistant_avatar.png'
      : ((getApp().resolveMediaUrl && getApp().resolveMediaUrl(item.avatar)) || item.avatar || ''),
    imageUrl: isImage ? (((getApp().resolveMediaUrl && getApp().resolveMediaUrl(item.content)) || item.content || '')) : '',
    segments: termHelper.buildTermSegments(item.content || '')
  }
}

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    inputText: '',
    inputMode: 'voice',
    recording: false,
    recordingSeconds: 0,
    loading: false,
    messages: [],
    familyId: 0,
    members: [],
    familyOptions: [],
    selectedFamilyIndex: 0,
    scrollTo: '',
    emptyText: '暂无群聊记录',
    showHistoryPanel: false,
    historyKeyword: '',
    historyMessages: [],
    termExplainPopups: [],
    assistantThinking: false
  },

  onShow() {
    this.syncGlobalFont()
    this.initVoice()
    this.loadMessages()
  },

  onUnload() {
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }

    if (this.data.recording && recorderManager) {
      recorderManager.stop()
    }
  },

  syncGlobalFont() {
    if (app.getGlobalFontSetting) {
      const font = app.getGlobalFontSetting()
      this.setData({ globalFontPageClass: font.pageClass })
    }
  },

  loadMessages(familyId) {
    const selectedId = familyId || this.data.familyId || 0
    app.request({
      url: '/family/group-chat' + (selectedId ? `?elder_id=${encodeURIComponent(selectedId)}` : ''),
      loading: false
    }).then(res => {
      const user = wx.getStorageSync('user') || {}
      const messages = (res.messages || res.items || []).map(item => decorateMessage(item, user.id))
      const role = user.role || wx.getStorageSync('role') || 'elder'
      const seen = {}
      const familyOptions = (res.members || []).map(item => ({
        familyId: role === 'child' ? (item.family_id || item.peer_id || item.id) : (item.family_id || res.family_id),
        label: item.display_name || item.name || item.nickname || '家庭群聊'
      })).filter(item => item.familyId && !seen[item.familyId] && (seen[item.familyId] = true))
      if (!familyOptions.length && res.family_id) familyOptions.push({ familyId: res.family_id, label: '我的家庭' })
      const selectedFamilyIndex = Math.max(0, familyOptions.findIndex(item => String(item.familyId) === String(res.family_id)))

      this.setData({
        familyId: res.family_id || 0,
        members: res.members || [],
        familyOptions,
        selectedFamilyIndex,
        messages,
        emptyText: res.message || '暂无群聊记录',
        scrollTo: messages.length ? messages[messages.length - 1].domId : '',
        historyMessages: this.filterHistory(messages, this.data.historyKeyword)
      })
      app.checkFamilyGroupUnread(false)
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      this.setData({
        messages: [],
        historyMessages: [],
        emptyText: denied ? '长辈暂未开放该权限' : '暂时无法读取家庭群聊，请稍后再试'
      })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  },

  switchFamilyChat(e) {
    const index = Number(e.detail.value || 0)
    const option = (this.data.familyOptions || [])[index]
    if (!option) return
    this.setData({ selectedFamilyIndex: index, familyId: option.familyId, messages: [], assistantThinking: false })
    this.loadMessages(option.familyId)
  },

  initVoice() {
    if (!recorderManager || this._voiceReady) return
    this._voiceReady = true

    recorderManager.onStop((res) => {
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }

      this.setData({
        recording: false,
        recordingSeconds: 0
      })

      if (!res.tempFilePath) {
        wx.showToast({
          title: '录音文件获取失败',
          icon: 'none'
        })
        return
      }

      this.uploadVoice(res.tempFilePath)
    })

    recorderManager.onError(() => {
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }

      this.setData({
        recording: false,
        recordingSeconds: 0
      })

      wx.showToast({
        title: '录音失败，请改用文字输入',
        icon: 'none'
      })
    })
  },

  uploadVoice(filePath) {
    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    const startedAt = Date.now()
    let statusCode = 0

    wx.showLoading({
      title: '识别中',
      mask: true
    })

    wx.uploadFile({
      url: baseUrl + '/assistant/voice-to-text?format=wav',
      timeout: 70000,
      filePath,
      name: 'file',
      header: {
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (uploadRes) => {
        statusCode = Number(uploadRes.statusCode || 0)
        wx.hideLoading()

        try {
          const data = JSON.parse(uploadRes.data || '{}')
          const text = String(data.text || '').trim()

          if ((data.ok || text) && text) {
            this.setData({
              inputText: text,
              inputMode: 'text'
            })

            setTimeout(() => this.sendMessage(), 60)
          } else {
            wx.showToast({
              title: data.message || data.hint || '没有听清楚，请再试一次',
              icon: 'none'
            })
          }
        } catch (e) {
          wx.showToast({
            title: '识别结果解析失败',
            icon: 'none'
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({
          title: '语音识别网络错误',
          icon: 'none'
        })
      },
      complete: () => {
        console.info(`[API] POST /assistant/voice-to-text ${Date.now() - startedAt}ms statusCode=${statusCode || 'NETWORK_ERROR'}`)
      }
    })
  },

  switchInputMode() {
    this.setData({
      inputMode: this.data.inputMode === 'voice' ? 'text' : 'voice'
    })
  },

  startHoldSpeak() {
    if (!recorderManager) {
      wx.showToast({ title: '当前设备不支持语音输入', icon: 'none' })
      return
    }
    if (this.data.loading || this.data.recording) return

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
            recordTimer = setInterval(() => {
              const seconds = this.data.recordingSeconds + 1
              this.setData({ recordingSeconds: seconds })
              if (seconds >= 28 && recorderManager) recorderManager.stop()
            }, 1000)
          },
          fail: (authErr) => {
            console.error('[语音] authorize失败:', JSON.stringify(authErr))
            this.setData({ recording: false, recordingSeconds: 0 })
            wx.showModal({
              title: '需要麦克风权限',
              content: '请在右上角「设置 > 权限管理」中开启麦克风权限，或切换为文字输入。',
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
            recordTimer = setInterval(() => {
              const seconds = this.data.recordingSeconds + 1
              this.setData({ recordingSeconds: seconds })
              if (seconds >= 28 && recorderManager) recorderManager.stop()
            }, 1000)
          },
          fail: () => {
            this.setData({ recording: false, recordingSeconds: 0 })
            wx.showModal({
              title: '需要麦克风权限',
              content: '请在设置中开启麦克风权限。',
              showCancel: false
            })
          }
        })
      }
    })
  },

  stopHoldSpeak() {
    if (!this.data.recording || !recorderManager) return

    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }

    recorderManager.stop()
  },

  onInput(e) {
    this.setData({
      inputText: e.detail.value
    })
  },

  clearInput() {
    this.setData({
      inputText: ''
    })
  },

  insertXiaoXiang() {
    const text = String(this.data.inputText || '')

    if (text.includes('@小享')) {
      this.setData({
        inputMode: 'text'
      })
      return
    }

    this.setData({
      inputText: `@小享 ${text}`,
      inputMode: 'text'
    })
  },

  sendMessage() {
    const content = String(this.data.inputText || '').trim()

    if (!content) {
      wx.showToast({
        title: '请先输入消息',
        icon: 'none'
      })
      return
    }

    if (this.data.loading) return

    const user = wx.getStorageSync('user') || {}
    const waitAssistant = /@小享/.test(content)

    const optimistic = decorateMessage({
      id: genId('local'),
      sender_id: user.id,
      sender_name: user.nickname || '我',
      sender_role: user.role || '',
      message_type: 'user',
      content,
      created_at: new Date().toISOString()
    }, user.id)

    const messages = this.data.messages.concat(optimistic)

    this.setData({
      messages,
      inputText: '',
      loading: true,
      assistantThinking: waitAssistant,
      scrollTo: waitAssistant ? 'assistant-thinking' : optimistic.domId,
      historyMessages: this.filterHistory(messages, this.data.historyKeyword)
    })

    app.request({
      url: '/family/group-chat',
      method: 'POST',
      data: {
        content,
        family_id: this.data.familyId || undefined
      },
      loading: false
    }).then(res => {
      const created = (res.messages || res.items || []).map(item => decorateMessage(item, user.id))
      const list = this.data.messages.filter(item => item.id !== optimistic.id).concat(created)

      this.setData({
        messages: list,
        loading: false,
        assistantThinking: false,
        scrollTo: list.length ? list[list.length - 1].domId : '',
        historyMessages: this.filterHistory(list, this.data.historyKeyword)
      })
    }).catch(err => {
      const fallback = waitAssistant ? decorateMessage({
        id: genId('assistant-fallback'),
        sender_id: 0,
        sender_name: '小享',
        sender_role: 'assistant',
        message_type: 'assistant',
        content: '小享暂时没连上服务，您可以稍后再问；如果涉及转账验证码，请先暂停操作。',
        created_at: new Date().toISOString()
      }, user.id) : null
      // @小享 失败时保留用户原消息，避免断网后看起来像“没发过”。
      const list = waitAssistant
        ? this.data.messages.concat(fallback)
        : this.data.messages.filter(item => item.id !== optimistic.id)

      this.setData({
        messages: list,
        loading: false,
        assistantThinking: false,
        scrollTo: fallback ? fallback.domId : '',
        historyMessages: this.filterHistory(list, this.data.historyKeyword)
      })

      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      wx.showModal({
        title: denied ? '暂时无法发送' : '发送失败',
        content: denied ? '长辈暂未开放该权限' : (waitAssistant ? '原消息已保留在当前对话中，稍后可以再试。' : '消息暂时没有发出，请确认已完成家庭绑定后重试。'),
        showCancel: false
      })
    })
  },

  chooseGroupImage() {
    const upload = (filePath) => this.sendImageMessage(filePath)
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

  sendImageMessage(filePath) {
    if (!filePath || this.data.loading) return
    const user = wx.getStorageSync('user') || {}
    const optimistic = decorateMessage({
      id: genId('img'),
      sender_id: user.id,
      sender_name: user.nickname || '我',
      sender_role: user.role || '',
      message_type: 'image',
      content: filePath,
      created_at: new Date().toISOString(),
      avatar: user.avatar || user.avatarUrl || ''
    }, user.id)
    const messages = this.data.messages.concat(optimistic)
    this.setData({
      messages,
      loading: true,
      scrollTo: optimistic.domId,
      historyMessages: this.filterHistory(messages, this.data.historyKeyword)
    })
    wx.uploadFile({
      url: app.globalData.baseUrl + '/family/group-chat/upload',
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${wx.getStorageSync('token') || ''}` },
      success: uploadRes => {
        let uploaded = null
        try { uploaded = JSON.parse(uploadRes.data || '{}') } catch (e) {}
        if (!uploaded || !uploaded.ok || !uploaded.url) {
          this.setData({ loading: false })
          return wx.showToast({ title: '图片暂时没有发出，请稍后再试', icon: 'none' })
        }
        app.request({
          url: '/family/group-chat',
          method: 'POST',
          data: { content: uploaded.url, message_type: 'image', family_id: this.data.familyId || undefined },
          loading: false
        }).then(res => {
          const created = (res.messages || res.items || []).map(item => decorateMessage(item, user.id))
          const list = this.data.messages.filter(item => item.id !== optimistic.id).concat(created)
          this.setData({ messages: list, loading: false, scrollTo: list.length ? list[list.length - 1].domId : '', historyMessages: this.filterHistory(list, this.data.historyKeyword) })
        }).catch(() => {
          this.setData({ loading: false })
          wx.showToast({ title: '图片暂时没有发出，请稍后再试', icon: 'none' })
        })
      },
      fail: () => {
        this.setData({ loading: false })
        wx.showToast({ title: '图片暂时没有发出，请稍后再试', icon: 'none' })
      }
    })
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    const urls = (this.data.messages || []).filter(item => item.isImage && item.imageUrl).map(item => item.imageUrl)
    wx.previewImage({ current: url, urls: urls.length ? urls : [url] })
  },

  openHistoryPanel() {
    this.setData({
      showHistoryPanel: true,
      historyMessages: this.filterHistory(this.data.messages, this.data.historyKeyword)
    })
  },

  closeHistoryPanel() {
    this.setData({
      showHistoryPanel: false,
      historyKeyword: ''
    })
  },

  onHistorySearch(e) {
    const historyKeyword = e.detail.value

    this.setData({
      historyKeyword,
      historyMessages: this.filterHistory(this.data.messages, historyKeyword)
    })
  },

  filterHistory(messages, keyword) {
    const kw = String(keyword || '').trim().toLowerCase()

    if (!kw) return messages || []

    return (messages || []).filter(item => {
      const text = `${item.sender_name || ''} ${item.content || ''} ${item.timeText || ''}`.toLowerCase()
      return text.includes(kw)
    })
  },

  jumpToMessage(e) {
    const id = e.currentTarget.dataset.id

    this.setData({
      showHistoryPanel: false,
      scrollTo: id || ''
    })
  },

  stopTap() {},

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    if (!term) return

    termHelper.handleDoubleTap(this, e, {
      term,
      nearbyText: () => (this.data.messages || []).map(item => item.content || '').join(' '),
      scene: 'family_group_chat'
    })
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  goBack() {
    const pages = getCurrentPages()

    if (pages.length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({
            url: '/pages/index/index',
            fail: () => {
              wx.redirectTo({
                url: '/pages/index/index'
              })
            }
          })
        }
      })
      return
    }

    wx.switchTab({
      url: '/pages/index/index',
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  back() {
    this.goBack()
  }
})

},
"pages/family-messages/family-messages.js": function(require,module,exports){
const termHelper = require('../../utils/termExplain.js')

function formatTime(value) {
  const raw = String(value || '')
  if (!raw) return ''
  return raw.replace('T', ' ').slice(0, 16)
}

function formatVoiceDuration(seconds) {
  const s = Math.round(Number(seconds) || 0)
  if (s < 60) return `${s}″`
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}′${sec.toString().padStart(2, '0')}″`
}

function resolveVoiceUrl(voiceUrl) {
  if (!voiceUrl) return ''
  if (voiceUrl.startsWith('http')) return voiceUrl
  const app = getApp()
  const base = (app && app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
  return base + voiceUrl
}

Page({
  data: {
    inputText: '',
    members: [],
    memberNames: [],
    selectedIndex: 0,
    selectedPeerId: 0,
    selectedName: '',
    messages: [],
    termExplainPopups: [],
    title: '家庭留言',
    subtitle: '选择已绑定家人，一对一留言。留言会保存到数据库，刷新后仍能看到。',
    emptyText: '暂无绑定家人，请先添加家人',
    showHistory: false,
    // 语音相关
    isRecording: false,
    recordTime: 0,
    playingId: 0,
    globalFontPageClass: 'font-global-normal',
  },

  syncGlobalFont() {
    const font = getApp().getGlobalFontSetting()
    this.setData({ globalFontPageClass: font.pageClass })
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    const peerId = Number(options.peer_id || options.elder_id || 0)
    this.setData({ selectedPeerId: peerId || 0 })
    // 初始化录音管理器
    this._recorder = wx.getRecorderManager()
    this._recorder.onStop(res => this._onRecordStop(res))
    this._recorder.onError(err => {
      wx.showToast({ title: '录音失败，请重试', icon: 'none' })
      this.setData({ isRecording: false, recordTime: 0 })
    })
    // 初始化音频播放器
    this._audioCtx = wx.createInnerAudioContext()
    this._audioCtx.onEnded(() => this.setData({ playingId: 0 }))
    this._audioCtx.onError(() => this.setData({ playingId: 0 }))
  },

  onShow() {
    this.syncGlobalFont()
    this.loadMembers()
    getApp().readText(this.data.subtitle)
  },

  onUnload() {
    if (this._recorder) this._recorder.stop()
    if (this._audioCtx) {
      this._audioCtx.stop()
      this._audioCtx.destroy()
    }
    if (this._recordTimer) clearInterval(this._recordTimer)
  },

  loadMembers() {
    getApp().request({ url: '/family/members' }).then(res => {
      if ((res.items || []).length) return res
      return getApp().request({ url: '/family/messages', loading: false }).then(messageRes => ({
        ...res,
        items: messageRes.members || [],
        message: messageRes.message || res.message || ''
      }))
    }).catch(() => {
      return getApp().request({ url: '/family/messages', loading: false }).then(messageRes => ({
        items: messageRes.members || [],
        message: messageRes.message || ''
      }))
    }).then(res => {
      const members = res.items || []
      const memberNames = members.map(item => `${item.display_name || item.name || '家人'}（${item.relation || '家人'}）`)
      let selectedIndex = 0
      let selectedPeerId = this.data.selectedPeerId
      if (selectedPeerId) {
        const idx = members.findIndex(item => String(item.peer_id || item.id) === String(selectedPeerId))
        selectedIndex = idx >= 0 ? idx : 0
      }
      if (members.length) {
        selectedPeerId = Number(members[selectedIndex].peer_id || members[selectedIndex].id)
      } else {
        selectedPeerId = 0
      }
      this.setData({
        members,
        memberNames,
        selectedIndex,
        selectedPeerId,
        selectedName: members[selectedIndex] ? (members[selectedIndex].display_name || members[selectedIndex].name || '家人') : '',
        emptyText: res.message || '暂无绑定家人，请先添加家人'
      })
      this.loadMessages()
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      this.setData({
        members: [],
        memberNames: [],
        selectedPeerId: 0,
        selectedName: '',
        messages: [],
        emptyText: denied ? '长辈暂未开放该权限' : '暂时无法读取家人列表'
      })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  },

  chooseMember(e) {
    const selectedIndex = Number(e.detail.value || 0)
    const member = this.data.members[selectedIndex]
    if (!member) return
    this.setData({
      selectedIndex,
      selectedPeerId: Number(member.peer_id || member.id),
      selectedName: member.display_name || member.name || '家人',
      messages: []
    })
    this.loadMessages()
  },

  loadMessages() {
    if (!this.data.selectedPeerId) {
      this.setData({ messages: [] })
      return
    }
    getApp().request({ url: `/family/messages?peer_id=${encodeURIComponent(this.data.selectedPeerId)}` }).then(res => {
      const user = wx.getStorageSync('user') || {}
      const messages = (res.items || []).reverse().map(item => ({
        ...item,
        timeText: formatTime(item.created_at),
        isMine: String(item.sender_id || item.from_user_id) === String(user.id),
        fromName: item.sender_name || item.from_name || '家人',
        segments: termHelper.buildTermSegments(item.content || ''),
        isVoice: item.message_type === 'voice',
        voiceFullUrl: resolveVoiceUrl(item.voice_url),
        voiceDurationText: formatVoiceDuration(item.voice_duration),
      }))
      this.setData({ messages })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
      else wx.showToast({ title: '暂时无法读取留言', icon: 'none' })
    })
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory })
  },

  sendMessage() {
    const content = String(this.data.inputText || '').trim()
    if (!content) {
      wx.showToast({ title: '请先输入留言', icon: 'none' })
      return
    }
    if (!this.data.selectedPeerId) {
      wx.showToast({ title: '请先选择已绑定家人', icon: 'none' })
      return
    }
    getApp().request({
      url: '/family/messages',
      method: 'POST',
      data: {
        receiver_id: this.data.selectedPeerId,
        content
      },
      loading: true
    }).then(() => {
      this.setData({ inputText: '' })
      this.loadMessages()
      wx.showToast({ title: '留言已发送', icon: 'success' })
      setTimeout(() => this.back(), 450)
    }).catch(err => {
      wx.showModal({
        title: '暂时发不了',
        content: (err && err.data && err.data.detail) || '请先完成家人绑定，再发送留言。',
        showCancel: false
      })
    })
  },

  // ------------------------- 语音录制 -------------------------

  startRecord() {
    if (!this.data.selectedPeerId) {
      wx.showToast({ title: '请先选择已绑定家人', icon: 'none' })
      return
    }
    this.setData({ isRecording: true, recordTime: 0 })
    this._recordTimer = setInterval(() => {
      this.setData({ recordTime: this.data.recordTime + 1 })
    }, 1000)
    this._recorder.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'wav'
    })
  },

  stopRecord() {
    if (this._recordTimer) {
      clearInterval(this._recordTimer)
      this._recordTimer = null
    }
    this._recorder.stop()
  },

  _onRecordStop(res) {
    const { tempFilePath, duration } = res
    if (!tempFilePath) {
      this.setData({ isRecording: false, recordTime: 0 })
      return
    }
    // 上传语音
    const app = getApp()
    const baseUrl = (app && app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    wx.uploadFile({
      url: `${baseUrl}/family/voice-message?receiver_id=${this.data.selectedPeerId}&duration=${Math.round(duration / 1000)}`,
      filePath: tempFilePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      success: () => {
        wx.showToast({ title: '语音已发送', icon: 'success' })
        this.loadMessages()
        setTimeout(() => this.back(), 450)
      },
      fail: err => {
        wx.showModal({
          title: '发送失败',
          content: '语音上传失败，请重试',
          showCancel: false
        })
      },
      complete: () => {
        this.setData({ isRecording: false, recordTime: 0 })
      }
    })
  },

  // ------------------------- 语音播放 -------------------------

  playVoice(e) {
    const id = Number(e.currentTarget.dataset.id || 0)
    if (!id) return
    if (this.data.playingId === id) {
      // 正在播放同一个，暂停
      this._audioCtx.pause()
      this.setData({ playingId: 0 })
      return
    }
    const msg = (this.data.messages || []).find(m => m.id === id)
    if (!msg || !msg.voiceFullUrl) return
    // 停止之前的播放
    this._audioCtx.stop()
    this._audioCtx.src = msg.voiceFullUrl
    this._audioCtx.play()
    this.setData({ playingId: id })
  },

  // ------------------------- 词汇解释 -------------------------

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    if (!term) return
    termHelper.handleDoubleTap(this, e, {
      term,
      nearbyText: () => (this.data.messages || []).map(item => item.content || '').join(' '),
      scene: 'family_message'
    })
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  goGroupChat() {
    wx.navigateTo({ url: '/pages/family-group-chat/family-group-chat' })
  },

  back() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/index/index' }) })
  },

  // ---- 语音输入：语音转文字留言 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    this.setData({ inputText: text })
    wx.showToast({ title: '已识别，可点发送', icon: 'none' })
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})

},
"pages/finance/finance.js": function(require,module,exports){
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
    .replace(/^\s*\d+(?:、|\.(?!\d))\s*/gm, '')
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

},
"pages/forgot-password/forgot-password.js": function(require,module,exports){
Page({
  data: { phone: '', question: '', answer: '', newPassword: '', loading: false, globalFontPageClass: 'font-global-normal' },
  syncGlobalFont() {
    const font = getApp().getGlobalFontSetting()
    this.setData({ globalFontPageClass: font.pageClass })
  },
  onLoad(options = {}) {
    this.setData({ phone: options.phone ? decodeURIComponent(options.phone) : '' })
    this.syncGlobalFont()
  },
  onShow() { this.syncGlobalFont() },
  onInput(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }) },
  loadQuestion() {
    if (!/^1\d{10}$/.test(this.data.phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' })
    getApp().request({ url: '/auth/security-question', data: { phone: this.data.phone }, loading: true }).then(res => {
      this.setData({ question: res.question || '' })
    }).catch(err => wx.showModal({ title: '无法找回', content: (err.data && err.data.detail) || '没有找到密保问题。', showCancel: false }))
  },
  resetPassword() {
    if (!this.data.answer.trim()) return wx.showToast({ title: '请填写密保答案', icon: 'none' })
    if (String(this.data.newPassword || '').length < 4) return wx.showToast({ title: '新密码至少4位', icon: 'none' })
    getApp().request({
      url: '/auth/password-reset', method: 'POST', loading: true,
      data: { phone: this.data.phone, answer: this.data.answer, new_password: this.data.newPassword }
    }).then(() => wx.showModal({ title: '密码已重置', content: '请使用新密码登录。', showCancel: false, success: () => wx.navigateBack() }))
      .catch(err => wx.showModal({ title: '重置失败', content: (err.data && err.data.detail) || '请核对答案后重试。', showCancel: false }))
  },
  back() { wx.navigateBack() }
})

},
"pages/health/health.js": function(require,module,exports){
// 守护健康页面 —— 开关直接控制每日闹钟
const app = getApp()

let ttsAudio = null
let recorderManager = null
let recordTimer = null

try {
  recorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null
} catch (e) {
  recorderManager = null
}

// 每日建议语料库（就医、买药、运动三类混合，每天轮换）
const advicePool = [
  '如果感觉身体不适，建议去社区医院做个常规检查，早发现早治疗。',
  '定期体检很重要，超过半年没检查的话，不妨安排一次血压血糖检测。',
  '最近天气变化大，如有头晕、胸闷等症状，不要硬扛，及时去附近医院就诊。',
  '慢性病需要定期复诊，检查一下上次开的药是否还合适，可以给医生打个电话咨询。',
  '换季时节容易感冒，如果出现发热、咳嗽症状，请佩戴口罩及时就医。',
  '关节疼痛不要忍，骨科或康复科医生可以帮您缓解不适。',
  '眼睛干涩或视力模糊的话，建议去眼科做个检查，保护视力很重要。',
  '牙齿不舒服要尽早看牙医，小问题拖久了更麻烦更花钱。',
  '睡眠长期不好的话，可以去神经内科或中医科看看，调理一下身体。',
  '买药记得带上医保卡，优先选择医保定点药店，能省不少钱。',
  '买药前核对药品名称和保质期，不要买临近过期的药品。',
  '不要轻信保健品推销，买药要去正规药店，听从医生建议最重要。',
  '同一种药不同品牌价格差别大，可以问问药师有没有性价比更高的选择。',
  '服药期间注意看说明书上的禁忌和副作用，有疑问及时问医生。',
  '中西药最好间隔半小时以上服用，避免相互影响效果。',
  '过期药品不要随便扔，可以送到药店回收，保护家人和环境。',
  '买药时要看清是处方药还是非处方药，处方药必须有医生处方。',
  '网上买药要认准有资质的正规平台，不要贪便宜买到假药。',
  '今天适合饭后散步20分钟，不用走太快，微微出汗就可以了。',
  '在家可以做做简单的伸展运动，活动活动关节，每次10分钟就很好。',
  '天气好时去公园打打太极拳，既能锻炼身体又能晒太阳补钙。',
  '坐着抬抬腿、转转脚踝，看电视时也能活动，每天坚持就有效果。',
  '做家务也是一种运动，拖地、擦桌子、整理房间都能活动筋骨。',
  '早上起床后做几个深呼吸，伸展一下手臂和腰背，唤醒身体。',
  '跳广场舞要量力而行，动作幅度不要太大，注意保护好膝盖。',
  '八段锦和五禽戏动作柔和，特别适合中老年人长期坚持。',
  '出门运动要穿防滑舒服的鞋子，安全永远是第一位。',
  '可以约上邻居或老朋友一起散步，边聊天边锻炼心情更好。'
]

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    meds: [],
    todayAdvice: '',
    healthJournal: [],
    healthBusy: false,
    showPanel: false,
    form: {
      name: '',
      time: '08:00',
      dose: '',
      alarm: true
    },
    recording: false,
    recordingSeconds: 0,
    recordingMax: 30,
    recordingField: ''
  },

  onShow() {
    this.syncGlobalFont()
    this.loadHealth()
    this.generateTodayAdvice()
  },

  onUnload() {
    if (ttsAudio) {
      ttsAudio.stop()
      ttsAudio.destroy()
      ttsAudio = null
    }
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    // 【修复C4】页面销毁时停止录音，防止后台持续录音
    if (recorderManager && this.data.recording) {
      try {
        recorderManager.stop()
      } catch (e) {
        // 静默处理
      }
    }
  },

  syncGlobalFont() {
    const font = app.getGlobalFontSetting()
    this.setData({ globalFontPageClass: font.pageClass })
  },

  // ---------- 今日建议生成 ----------

  generateTodayAdvice() {
    const day = new Date().getDate()
    const idx = (day - 1) % advicePool.length
    this.setData({ todayAdvice: advicePool[idx] })
  },

  // ---------- 语音播报今日建议 ----------

  speakAdvice() {
    this.speakText(`今日建议：${this.data.todayAdvice}`)
  },

  // ---------- 通用语音播报 ----------

  initTtsAudio() {
    if (ttsAudio) return
    ttsAudio = wx.createInnerAudioContext()
    ttsAudio.onEnded(() => {})
    ttsAudio.onError(() => {})
  },

  speakText(text) {
    if (!text) return
    this.initTtsAudio()
    if (ttsAudio) ttsAudio.stop()

    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''

    wx.request({
      url: baseUrl + '/assistant/text-to-voice',
      method: 'POST',
      timeout: 70000,
      data: { text: String(text).slice(0, 500) },
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          if (ttsAudio) {
            ttsAudio.src = baseUrl + res.data.url
            ttsAudio.play()
          }
        }
      },
      fail: () => {}
    })
  },

  // ---------- 返回 ----------

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

  // ---------- 数据加载 ----------

  loadHealth() {
    app.request({
      url: '/health/summary'
    }).then(res => {
      this.setData({
        meds: res.meds || [],
        healthJournal: res.journal || []
      })
      if (res.meds) {
        wx.setStorageSync('meds', res.meds)
        wx.setStorageSync('health_meds', res.meds)
      }
      if (res.today_advice) {
        this.setData({ todayAdvice: res.today_advice })
      }
    }).catch(() => {
      const meds = wx.getStorageSync('meds') || wx.getStorageSync('health_meds') || []
      this.setData({ meds })
    })
  },

  // ---------- 手机日历闹钟 ----------

  calcTimestamp(timeStr) {
    const now = new Date()
    const [h, m] = String(timeStr).split(':').map(Number)
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  },

  addPhoneCalendar(item) {
    const startTime = this.calcTimestamp(item.time)
    wx.addPhoneCalendar({
      title: `吃药：${item.name}`,
      startTime: startTime,
      allDay: false,
      description: `每次${item.dose}，每天${item.time}服用`,
      alarm: true,
      alarmOffset: 0,
      success: () => {
        wx.showToast({ title: '已添加到手机日历', icon: 'success' })
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) {
          wx.showToast({ title: '已取消日历授权', icon: 'none' })
        }
      }
    })
  },

  // ---------- 闹钟开关 ----------

  toggleAlarmSwitch(e) {
    const id = e.currentTarget.dataset.id
    const newAlarm = e.detail.value
    const item = this.data.meds.find(m => String(m.id) === String(id))
    if (!item) return

    if (newAlarm) {
      this.addPhoneCalendar(item)
      this.speakText(`已为${item.name}开启每日闹钟，每天${item.time}响铃`)
    } else {
      this.speakText(`已关闭${item.name}的每日闹钟`)
    }

    app.request({
      url: '/health/meds/' + id,
      method: 'PUT',
      data: { alarm: newAlarm }
    }).then(() => {
      this.loadHealth()
    }).catch(() => {
      const meds = this.data.meds.map(m => {
        if (String(m.id) === String(id)) return { ...m, alarm: newAlarm }
        return m
      })
      this.setData({ meds })
      wx.setStorageSync('meds', meds)
      wx.setStorageSync('health_meds', meds)
    })
  },

  // ---------- 添加面板 ----------

  showAddPanel() {
    this.setData({
      showPanel: true,
      form: {
        name: '',
        time: '08:00',
        dose: '',
        alarm: true
      }
    })
  },

  hideAddPanel() {
    this.setData({ showPanel: false })
  },

  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value })
  },

  onDoseInput(e) {
    this.setData({ 'form.dose': e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ 'form.time': e.detail.value })
  },

  onAlarmChange(e) {
    this.setData({ 'form.alarm': e.detail.value })
  },

  // ---------- 语音录入 ----------

  initRecorder() {
    if (!recorderManager || this._recorderInited) return
    this._recorderInited = true

    recorderManager.onStop((res) => {
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }

      const field = this.data.recordingField
      this.setData({ recording: false, recordingSeconds: 0, recordingField: '' })

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
        header: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        success: (uploadRes) => {
          wx.hideLoading()
          try {
            const data = JSON.parse(uploadRes.data)
            if (data.ok && data.text) {
              const text = String(data.text).trim()
              if (field === 'name') {
                this.setData({ 'form.name': text })
              } else if (field === 'dose') {
                this.setData({ 'form.dose': text })
              } else if (field === 'time') {
                const tr = this.parseTimeFromText(text)
                if (tr.time) this.setData({ 'form.time': tr.time })
                else wx.showToast({ title: '未识别到时间，请手动选择', icon: 'none' })
              } else {
                this.parseVoiceText(text)
              }
            } else {
              wx.showModal({
                title: '没有听清楚',
                content: '请靠近手机再说一遍，您也可以手动填写。',
                showCancel: false
              })
            }
          } catch (e) {
            wx.showModal({
              title: '语音暂时没有识别成功',
              content: '请再说一遍，或改用文字填写。',
              showCancel: false
            })
          }
        },
        fail: () => {
          wx.hideLoading()
          wx.showModal({
            title: '语音暂时不可用',
            content: '请检查网络后再试，您也可以改用文字填写。',
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
      this.setData({ recording: false, recordingSeconds: 0, recordingField: '' })
      wx.showToast({ title: '录音失败，请用文字输入', icon: 'none' })
    })
  },

  parseTimeFromText(text) {
    const cnNums = { '零': 0, '〇': 0, '一': 1, '壹': 1, '二': 2, '两': 2, '贰': 2,
      '三': 3, '叁': 3, '四': 4, '肆': 4, '五': 5, '伍': 5, '六': 6, '陆': 6,
      '七': 7, '柒': 7, '八': 8, '捌': 8, '九': 9, '玖': 9, '十': 10 }

    let hourOffset = 0
    if (/下午|傍晚|晚上|夜里|夜间/.test(text)) hourOffset = 12

    const cnNumToInt = (s) => {
      if (!s) return 0
      if (s === '十') return 10
      if (s.length === 2 && s[0] === '十') return 10 + (cnNums[s[1]] || 0)
      return cnNums[s] || 0
    }

    let found = ''

    let m = text.match(/(\d{1,2})[:：](\d{2})/)
    if (m) {
      let h = parseInt(m[1]), min = parseInt(m[2])
      if (h <= 12 && hourOffset > 0 && h < 12) h += hourOffset
      found = m[0]
      const result = String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0')
      return { time: result, cleaned: text.replace(found, '') }
    }

    m = text.match(/(\d{1,2})点(\d{1,2})?[分]?/)
    if (m) {
      let h = parseInt(m[1]), min = m[2] ? parseInt(m[2]) : 0
      if (h <= 12 && hourOffset > 0 && h < 12) h += hourOffset
      found = m[0]
      const result = String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0')
      return { time: result, cleaned: text.replace(found, '') }
    }

    m = text.match(/(\d{1,2})点半/)
    if (m) {
      let h = parseInt(m[1])
      if (h <= 12 && hourOffset > 0 && h < 12) h += hourOffset
      found = m[0]
      return { time: String(h).padStart(2, '0') + ':30', cleaned: text.replace(found, '') }
    }

    m = text.match(/(\d{1,2})点(?!\d)/)
    if (m) {
      let h = parseInt(m[1])
      if (h <= 12 && hourOffset > 0 && h < 12) h += hourOffset
      found = m[0]
      return { time: String(h).padStart(2, '0') + ':00', cleaned: text.replace(found, '') }
    }

    const cnDigit = '[零〇一二两三四五六七八九十]+'
    m = text.match(new RegExp('(' + cnDigit + ')点(' + cnDigit + ')?分?'))
    if (m) {
      let h = cnNumToInt(m[1]), min = m[2] ? cnNumToInt(m[2]) : 0
      if (h <= 12 && hourOffset > 0 && h < 12) h += hourOffset
      found = m[0]
      return { time: String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0'), cleaned: text.replace(found, '') }
    }

    m = text.match(new RegExp('(' + cnDigit + ')点半'))
    if (m) {
      let h = cnNumToInt(m[1])
      if (h <= 12 && hourOffset > 0 && h < 12) h += hourOffset
      found = m[0]
      return { time: String(h).padStart(2, '0') + ':30', cleaned: text.replace(found, '') }
    }

    m = text.match(new RegExp('(' + cnDigit + ')点(?!\\d|[零〇一二两三四五六七八九十])'))
    if (m) {
      let h = cnNumToInt(m[1])
      if (h <= 12 && hourOffset > 0 && h < 12) h += hourOffset
      found = m[0]
      return { time: String(h).padStart(2, '0') + ':00', cleaned: text.replace(found, '') }
    }

    return { time: '', cleaned: text }
  },

  parseVoiceText(text) {
    const t = text.replace(/[，,。.！!？?、\s]+/g, ' ').trim()

    const timeResult = this.parseTimeFromText(t)
    let remaining = timeResult.cleaned
    const timeVal = timeResult.time

    let dose = ''
    const doseRegex4 = /[0-9]+\s*[粒片颗毫克毫升袋包支次]/g
    let dMatch = remaining.match(doseRegex4)
    if (!dMatch) dMatch = remaining.match(/[0-9]+[粒片颗毫克毫升袋包支次]/g)
    if (!dMatch) {
      dMatch = remaining.match(/(?:[零一二两三四五六七八九十半]+)(?:粒|片|颗)/g)
    }
    if (dMatch) {
      dose = dMatch.join(' ')
      dMatch.forEach(d => { remaining = remaining.replace(d, '') })
    }

    let name = remaining
      .replace(/我要|想在|在|要|的|一下|一个|一次/g, '')
      .replace(/吃|服用|服|用/g, '')
      .replace(/每天|每日|每次|一日/g, '')
      .replace(/早上|上午|下午|傍晚|晚上|夜里|夜间|早晨|凌晨/g, '')
      .replace(/[，,。.！!？?、\s]+/g, ' ')
      .trim()

    if (!name && !dose && !timeVal) {
      this.setData({ 'form.name': text })
      return
    }

    this.setData({
      'form.name': name || '',
      'form.dose': dose || '',
      'form.time': timeVal || '08:00'
    })
  },

  startVoiceInput(e) {
    this.initRecorder()
    if (!recorderManager) {
      wx.showToast({ title: '当前设备不支持语音', icon: 'none' })
      return
    }
    if (this.data.recording) return

    const field = e.currentTarget.dataset.field || 'name'

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
          // 【修复L1】震动在权限确认后才触发
          wx.vibrateShort({ type: 'medium' })
          this.setData({ recording: true, recordingSeconds: 0, recordingField: field })
          recorderManager.start({
            duration: 15000,
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000,
            format: 'wav'
          })
          const that = this
          recordTimer = setInterval(() => {
            const sec = that.data.recordingSeconds + 1
            that.setData({ recordingSeconds: sec })
            if (sec >= 14) recorderManager.stop()
          }, 1000)
          return
        }
        // 未询问 → 发起授权
        wx.authorize({
          scope: 'scope.record',
          success: () => {
            wx.vibrateShort({ type: 'medium' })
            this.setData({ recording: true, recordingSeconds: 0, recordingField: field })
            recorderManager.start({
              duration: 15000,
              sampleRate: 16000,
              numberOfChannels: 1,
              encodeBitRate: 48000,
              format: 'wav'
            })
            const that = this
            recordTimer = setInterval(() => {
              const sec = that.data.recordingSeconds + 1
              that.setData({ recordingSeconds: sec })
              if (sec >= 14) recorderManager.stop()
            }, 1000)
          },
          fail: (authErr) => {
            console.error('[语音] authorize失败:', JSON.stringify(authErr))
            this.setData({ recording: false, recordingSeconds: 0, recordingField: '' })
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
            wx.vibrateShort({ type: 'medium' })
            this.setData({ recording: true, recordingSeconds: 0, recordingField: field })
            recorderManager.start({
              duration: 15000,
              sampleRate: 16000,
              numberOfChannels: 1,
              encodeBitRate: 48000,
              format: 'wav'
            })
            const that = this
            recordTimer = setInterval(() => {
              const sec = that.data.recordingSeconds + 1
              that.setData({ recordingSeconds: sec })
              if (sec >= 14) recorderManager.stop()
            }, 1000)
          },
          fail: () => {
            this.setData({ recording: false, recordingSeconds: 0, recordingField: '' })
            wx.showModal({
              title: '需要麦克风权限',
              content: '请在设置中开启麦克风权限。',
              showCancel: false
            })
          }
        })
      }
    })
  },

  recordExercise() {
    wx.showModal({
      title: '记录今天的运动',
      editable: true,
      placeholderText: '例如：饭后慢走20分钟，膝盖没有不舒服',
      confirmText: '保存并分析',
      success: res => {
        if (!res.confirm) return
        const content = String(res.content || '').trim()
        if (!content) return wx.showToast({ title: '请填写运动内容', icon: 'none' })
        this.setData({ healthBusy: true })
        app.request({ url: '/health/activity', method: 'POST', data: { content }, loading: true }).then(result => {
          const healthJournal = [result].concat(this.data.healthJournal || [])
          this.setData({ healthJournal })
          wx.showToast({ title: '运动已记录', icon: 'success' })
        }).finally(() => this.setData({ healthBusy: false }))
      }
    })
  },

  recordMeal() {
    wx.showModal({
      title: '记录今天吃了什么',
      editable: true,
      placeholderText: '例如：午饭吃了米饭、清蒸鱼和青菜',
      confirmText: '保存并分析',
      success: res => {
        if (!res.confirm) return
        const content = String(res.content || '').trim()
        if (!content) return wx.showToast({ title: '请填写这顿饭吃了什么', icon: 'none' })
        this.setData({ healthBusy: true })
        app.request({ url: '/health/meal', method: 'POST', data: { content }, loading: true }).then(result => {
          this.setData({ healthJournal: [result].concat(this.data.healthJournal || []) })
          wx.showToast({ title: '饮食已记录', icon: 'success' })
        }).finally(() => this.setData({ healthBusy: false }))
      }
    })
  },

  chooseFoodImage() {
    const upload = filePath => {
      this.setData({ healthBusy: true })
      wx.showLoading({ title: '小享正在看', mask: true })
      wx.uploadFile({
        url: app.globalData.baseUrl + '/health/food-image',
        filePath,
        name: 'file',
        header: { Authorization: `Bearer ${wx.getStorageSync('token') || ''}` },
        success: res => {
          try {
            const data = JSON.parse(res.data || '{}')
            if (!data.ok) return wx.showModal({ title: '没有看清', content: data.message || '请换一张清晰照片。', showCancel: false })
            this.setData({ healthJournal: [data].concat(this.data.healthJournal || []) })
          } catch (err) { wx.showToast({ title: '饮食分析失败', icon: 'none' }) }
        },
        fail: () => wx.showToast({ title: '图片上传失败', icon: 'none' }),
        complete: () => { wx.hideLoading(); this.setData({ healthBusy: false }) }
      })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['camera', 'album'], success: res => {
        const file = (res.tempFiles || [])[0]
        if (file) upload(file.tempFilePath)
      } })
    } else {
      wx.chooseImage({ count: 1, sourceType: ['camera', 'album'], success: res => upload(res.tempFilePaths[0]) })
    }
  },

  stopVoiceInput() {
    if (!this.data.recording || !recorderManager) return
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    recorderManager.stop()
  },

  startHoldSpeak() {
    this.initRecorder()
    if (!recorderManager) {
      wx.showToast({ title: '当前设备不支持语音', icon: 'none' })
      return
    }
    if (this.data.recording) return

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
          wx.vibrateShort({ type: 'medium' })
          this.setData({ recording: true, recordingSeconds: 0, recordingField: 'all' })
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
            wx.vibrateShort({ type: 'medium' })
            this.setData({ recording: true, recordingSeconds: 0, recordingField: 'all' })
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
          },
          fail: (authErr) => {
            console.error('[语音] authorize失败:', JSON.stringify(authErr))
            this.setData({ recording: false, recordingSeconds: 0, recordingField: '' })
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
            wx.vibrateShort({ type: 'medium' })
            this.setData({ recording: true, recordingSeconds: 0, recordingField: 'all' })
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
          },
          fail: () => {
            this.setData({ recording: false, recordingSeconds: 0, recordingField: '' })
            wx.showModal({
              title: '需要麦克风权限',
              content: '请在设置中开启麦克风权限。',
              showCancel: false
            })
          }
        })
      }
    })
  },

  stopHoldSpeak() {
    if (!this.data.recording) return
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    recorderManager.stop()
  },

  // ---------- 提交新药品 ----------

  submitMed() {
    const { name, time, dose, alarm } = this.data.form

    if (!name.trim()) {
      wx.showToast({ title: '请输入药品名称', icon: 'none' })
      return
    }
    if (!time) {
      wx.showToast({ title: '请选择吃药时间', icon: 'none' })
      return
    }

    const saveName = name.trim()
    const saveTime = time
    const saveDose = dose.trim() || '按医嘱'

    const doSave = () => {
      app.request({
        url: '/health/meds',
        method: 'POST',
        data: {
          name: saveName,
          time: saveTime,
          dose: saveDose,
          alarm: alarm
        },
        loading: true
      }).then(() => {
        this.hideAddPanel()
        this.loadHealth()
        if (alarm) {
          this.addPhoneCalendar({ name: saveName, time: saveTime, dose: saveDose })
        }
        this.speakText(`成功添加${saveName}的吃药提醒，每天${saveTime}服用${saveDose}`)
        wx.showToast({ title: '已添加', icon: 'success' })
      }).catch(() => {
        const newMed = {
          id: Date.now(),
          name: saveName,
          time: saveTime,
          dose: saveDose,
          done: false,
          alarm: alarm
        }
        const meds = [newMed].concat(this.data.meds)
        this.setData({ meds, showPanel: false })
        wx.setStorageSync('meds', meds)
        wx.setStorageSync('health_meds', meds)
        if (alarm) {
          this.addPhoneCalendar({ name: saveName, time: saveTime, dose: saveDose })
        }
        this.speakText(`成功添加${saveName}的吃药提醒，每天${saveTime}服用${saveDose}`)
        wx.showToast({ title: '已添加', icon: 'success' })
      })
    }

    doSave()
  },

  // ---------- 删除药品 ----------

  deleteMed(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.meds.find(m => String(m.id) === String(id))
    const name = item ? item.name : '该药品'

    this.speakText(`是否删除${name}的吃药提醒？`)

    wx.showModal({
      title: '删除提醒',
      content: '确定删除这个吃药提醒吗？',
      confirmText: '删除',
      confirmColor: '#d94b2b',
      success: (res) => {
        if (!res.confirm) return

        app.request({
          url: '/health/meds/' + id,
          method: 'DELETE',
          loading: true
        }).then(() => {
          this.loadHealth()
          this.speakText(`已删除${name}的吃药提醒`)
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(() => {
          const meds = this.data.meds.filter(m => String(m.id) !== String(id))
          this.setData({ meds })
          wx.setStorageSync('meds', meds)
          wx.setStorageSync('health_meds', meds)
          this.speakText(`已删除${name}的吃药提醒`)
          wx.showToast({ title: '已删除', icon: 'success' })
        })
      }
    })
  }

})

},
"pages/index/index.js": function(require,module,exports){
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
    newsMessage: '正在加载实时新闻',
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
    if (this._newsLoaded) {
      this.setData({ articles: cachedArticles, newsMessage: cachedArticles.length ? '' : '暂无实时新闻' })
    } else {
      this._newsLoaded = true
      app.request({ url: '/market/daily' }).then(res => {
        const rawItems = res && res.success !== false ? (res.items || []) : []
        const articles = decorateArticles(rawItems.slice(0, 4))
        wx.setStorageSync('home_articles', articles)
        this.setData({
          articles,
          newsMessage: articles.length ? '' : (res.message || '暂无实时新闻')
        })
      }).catch(() => {
        this.setData({
          articles: cachedArticles,
          newsMessage: cachedArticles.length ? '' : '暂无实时新闻'
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
      this.setData({
        articles,
        newsMessage: articles.length ? '' : (res.message || '暂无实时新闻')
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

},
"pages/login/login.js": function(require,module,exports){
const DEFAULT_AVATAR = '/assets/ui/default_avatar.png'

function avatarUrl(value) {
  const avatar = String(value || '')
  if (!avatar) return DEFAULT_AVATAR
  if (/^https?:\/\//.test(avatar) || avatar.startsWith('/assets/')) return avatar
  if (avatar.startsWith('/media/')) return getApp().globalData.baseUrl.replace(/\/$/, '') + avatar
  return avatar
}

function goHome(role) {
  wx.redirectTo({ url: role === 'child' ? '/pages/child/index/index' : '/pages/index/index' })
}

function friendlyLoginError(err, fallback) {
  const detail = String(err && err.data && err.data.detail || '')
  if (/APPID|SECRET|未配置|code2session|openid|接口|后端/i.test(detail)) return fallback
  if (/手机号|密码|身份|注册|绑定|微信免密|7天|七天/.test(detail)) return detail
  return fallback
}

function isWechatBindIssue(err) {
  const detail = String(err && err.data && err.data.detail || err && err.errMsg || '')
  return /微信.*绑定|绑定.*微信|绑定未完成|openid|code2session/i.test(detail)
}

Page({
  data: {
    phone: '',
    password: '',
    role: 'elder',
    rememberWeek: false,
    showLoginSuccess: false,
    successUser: null,
    questionnaireRequired: false,
    globalFontPageClass: 'font-global-normal'
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    this.setData({
      phone: options.phone ? decodeURIComponent(options.phone) : '',
      role: options.role === 'child' ? 'child' : 'elder'
    })
    this.tryRememberedLogin()
  },

  onShow() { this.syncGlobalFont() },

  syncGlobalFont() {
    const app = getApp()
    if (app.getGlobalFontSetting) this.setData({ globalFontPageClass: app.getGlobalFontSetting().pageClass })
  },

  onInput(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }) },
  chooseRole(e) { this.setData({ role: e.currentTarget.dataset.role === 'child' ? 'child' : 'elder' }) },
  onRememberChange(e) { this.setData({ rememberWeek: !!e.detail.value }) },

  goRegister() {
    wx.navigateTo({ url: '/pages/register/register?role=' + this.data.role })
  },

  goForgotPassword() {
    wx.navigateTo({ url: '/pages/forgot-password/forgot-password?phone=' + encodeURIComponent(this.data.phone || '') })
  },

  saveLogin(res, rememberWeek) {
    const app = getApp()
    const profile = Object.assign({}, res.profile || {})
    const resolvedAvatar = avatarUrl(profile.avatar || (res.user || {}).avatar || '')
    profile.avatar = resolvedAvatar
    const user = Object.assign({}, res.user || {}, { avatar: resolvedAvatar })
    wx.setStorageSync('token', res.token)
    wx.setStorageSync('user', user)
    wx.setStorageSync('profile', profile)
    wx.setStorageSync('role', user.role || 'elder')
    wx.setStorageSync('rememberLoginUntil', rememberWeek ? Date.now() + 7 * 24 * 60 * 60 * 1000 : 0)
    if (res.wechat && res.wechat.password_free_until) {
      wx.setStorageSync('wechatPasswordFreeUntil', res.wechat.password_free_until)
    }
    app.globalData.token = res.token
    app.globalData.user = user
    app.globalData.profile = profile
    app.globalData.role = user.role || 'elder'
    return { user, profile }
  },

  showSuccess(res, rememberWeek) {
    const saved = this.saveLogin(res, rememberWeek)
    this.setData({
      showLoginSuccess: true,
      successUser: Object.assign({}, saved.user, {
        avatarDisplay: avatarUrl(saved.user.avatar),
        roleLabel: saved.user.role === 'child' ? '子女端' : '长辈端'
      }),
      questionnaireRequired: !!res.questionnaire_required
    })
  },

  continueAfterSuccess() {
    const user = this.data.successUser || {}
    this.setData({ showLoginSuccess: false })
    if (this.data.questionnaireRequired) {
      wx.redirectTo({ url: '/pages/questionnaire/questionnaire?onboarding=1' })
      return
    }
    goHome(user.role || 'elder')
  },

  tryRememberedLogin() {
    const token = wx.getStorageSync('token') || ''
    const until = Number(wx.getStorageSync('rememberLoginUntil') || 0)
    if (!token || until <= Date.now()) return
    getApp().request({ url: '/auth/me' }).then(res => {
      const role = (res.user || {}).role || 'elder'
      wx.setStorageSync('user', res.user || {})
      wx.setStorageSync('profile', res.profile || {})
      wx.setStorageSync('role', role)
      getApp().globalData.user = res.user || null
      getApp().globalData.profile = res.profile || null
      getApp().globalData.role = role
      if (res.questionnaire_required) wx.redirectTo({ url: '/pages/questionnaire/questionnaire?onboarding=1' })
      else goHome(role)
    }).catch(() => {
      wx.removeStorageSync('token')
      wx.removeStorageSync('rememberLoginUntil')
    })
  },

  getWechatCode() {
    return new Promise(resolve => {
      wx.login({
        success: res => resolve(String(res.code || '')),
        fail: () => resolve('')
      })
    })
  },

  async login() {
    if (!this.data.phone || !this.data.password) return wx.showToast({ title: '请输入手机号和密码', icon: 'none' })
      getApp().request({
      url: '/auth/password-login',
      method: 'POST',
      data: { phone: this.data.phone, password: this.data.password, role: this.data.role },
      loading: true
    }).then(res => {
      this.showSuccess(res, this.data.rememberWeek)
    }).catch(err => {
      if (isWechatBindIssue(err)) return
      wx.showModal({ title: '登录失败', content: friendlyLoginError(err, '请检查网络、手机号和密码后再试。'), showCancel: false })
    })
  },

  wechatLogin() {
    const app = getApp()
    wx.showLoading({ title: '微信登录中', mask: true })
    wx.login({
      success: loginRes => {
        if (!loginRes.code) {
          wx.hideLoading()
          return wx.showModal({ title: '微信登录失败', content: '没有取得微信登录凭证，请稍后重试。', showCancel: false })
        }
        app.request({
          url: '/auth/wechat-login',
          method: 'POST',
          data: {
            code: loginRes.code,
            role: this.data.role,
            phone: this.data.phone || '',
            password: this.data.password || ''
          }
        }).then(res => this.showSuccess(res, this.data.rememberWeek)).catch(err => {
          if (isWechatBindIssue(err)) return
          wx.showModal({
            title: '微信登录失败',
            content: friendlyLoginError(err, '请先完成手机号注册；首次绑定微信时需要同时输入手机号和密码。'),
            confirmText: '知道了',
            showCancel: false
          })
        }).finally(() => wx.hideLoading())
      },
      fail: () => {
        wx.hideLoading()
        wx.showModal({ title: '微信登录失败', content: '请检查微信账号和网络后重试。', showCancel: false })
      }
    })
  }
})

},
"pages/money/money.js": function(require,module,exports){
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
    const parsed = this.data.lastParse
    if (!parsed) return
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
      this.speak('已导入' + (res.imported_count || 0) + '条记录')
      wx.showToast({ title: `已导入${res.imported_count || 0}条`, icon: 'success' })
      this.load()
    }).catch(() => {
      wx.showToast({ title: '暂时没有导入成功，请稍后再试', icon: 'none' })
    })
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

},
"pages/nearby/nearby.js": function(require,module,exports){
const app = getApp()
const { DEFAULT_CITY, DEFAULT_LOCATION } = require('../../utils/mapConfig.js')

const EARTH_RADIUS = 6371000
const USER_MARKER_SIZE = 34
const PLACE_MARKER_SIZE = 30
const DEFAULT_DIALOG_LEFT = 40
const DEFAULT_DIALOG_TOP = 620
const DIALOG_WIDTH = 660
const DIALOG_HEIGHT = 520
let guideRecorderManager = null
let guideRecordTimer = null

try {
  guideRecorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null
} catch (e) {
  guideRecorderManager = null
}

const CATEGORY_LIST = [
  { key: 'bank', label: '金融网点', keyword: '银行' },
  { key: 'pharmacy', label: '药店', keyword: '药店' },
  { key: 'hospital', label: '医院', keyword: '医院' },
  { key: 'community', label: '社区服务', keyword: '社区服务中心' }
]

function currentCategory(key) {
  return CATEGORY_LIST.find(item => item.key === key) || CATEGORY_LIST[0]
}

function categoryFromText(text) {
  const raw = decodeURIComponent(String(text || '')).trim()
  if (!raw) return 'bank'
  if (/医院|医疗|卫生|看病/.test(raw)) return 'hospital'
  if (/药店|药房|买药/.test(raw)) return 'pharmacy'
  if (/社区|养老|服务/.test(raw)) return 'community'
  if (/银行|金融|网点/.test(raw)) return 'bank'
  const matched = CATEGORY_LIST.find(item => item.key === raw || item.label === raw || item.keyword === raw)
  return matched ? matched.key : 'bank'
}

function toRad(value) {
  return Number(value) * Math.PI / 180
}

function distanceMeters(from, to) {
  if (!from || !to) return 0
  const lat1 = Number(from.latitude)
  const lng1 = Number(from.longitude)
  const lat2 = Number(to.latitude || to.lat)
  const lng2 = Number(to.longitude || to.lng)
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2)
  return Math.round(EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function distanceText(value) {
  const n = Number(String(value || '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return '附近'
  return n >= 1000 ? `约${(n / 1000).toFixed(1)}公里` : `约${Math.round(n)}米`
}

function mapPlace(item, index, category, currentLocation) {
  const loc = item.location || {}
  const latitude = Number(loc.lat || item.latitude || item.lat)
  const longitude = Number(loc.lng || item.longitude || item.lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const distance = item._distance || item.distance || distanceMeters(currentLocation, { latitude, longitude })
  return {
    id: String(item.id || `${category.key}_${index}_${latitude}_${longitude}`),
    markerId: index + 2,
    title: item.title || item.name || `${category.label}${index + 1}`,
    address: item.address || '暂无详细地址',
    phone: item.tel || item.phone || '',
    location: { lat: latitude, lng: longitude },
    category: category.label,
    distanceText: distanceText(distance),
    distanceValue: Number(distance || 0),
    source: item.source || 'backend_lbs',
    note: item.source === 'local_fallback'
      ? '实时地点暂时没有刷新成功，请出发前在微信地图中再次核对。'
      : '出发前先核对地点名称和地址，遇到不确定可以问小享。'
  }
}

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    categoryList: CATEGORY_LIST,
    currentCategory: 'bank',
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude,
    currentAddress: DEFAULT_LOCATION.address || DEFAULT_CITY,
    locating: false,
    loadingPlaces: false,
    places: [],
    markers: [],
    activePlaceId: '',
    activeMarkerId: 0,
    scrollIntoView: '',
    addressInput: '',
    locationSource: '',
    statusText: '请允许定位，或手动选择位置，小享会帮您查找附近常用服务点。',
    sourceText: '',
    mapScale: 15,

    showGuideDialog: false,
    guideDialogMinimized: false,
    guideDragging: false,
    guideRecording: false,
    guideRecordingSeconds: 0,
    guideInput: '',
    guideMessages: [],
    selectedGuidePlace: null,
    dialogLeft: DEFAULT_DIALOG_LEFT,
    dialogTop: DEFAULT_DIALOG_TOP,
    defaultDialogLeft: DEFAULT_DIALOG_LEFT,
    defaultDialogTop: DEFAULT_DIALOG_TOP,
    dragStartX: 0,
    dragStartY: 0,
    dragStartLeft: DEFAULT_DIALOG_LEFT,
    dragStartTop: DEFAULT_DIALOG_TOP,
    screenWidthRpx: 750,
    screenHeightRpx: 1334
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    this.initScreenInfo()
    this.initGuideVoice()
    const category = categoryFromText(options.category || options.type || options.keyword || '')
    this.setData({
      currentCategory: category,
      markers: this.buildMarkers([], DEFAULT_LOCATION)
    })
    this.getMyLocation()
  },

  onShow() {
    this.syncGlobalFont()
  },

  onUnload() {
    if (guideRecordTimer) {
      clearInterval(guideRecordTimer)
      guideRecordTimer = null
    }
    if (this.data.guideRecording && guideRecorderManager) {
      guideRecorderManager.stop()
    }
  },

  initScreenInfo() {
    try {
      const info = wx.getSystemInfoSync()
      const ratio = 750 / Number(info.windowWidth || 375)
      this.setData({
        screenWidthRpx: 750,
        screenHeightRpx: Math.round(Number(info.windowHeight || 667) * ratio)
      })
    } catch (e) {}
  },

  syncGlobalFont() {
    if (app.getGlobalFontSetting) {
      const font = app.getGlobalFontSetting()
      this.setData({ globalFontPageClass: font.pageClass })
    }
  },

  getMyLocation() {
    if (this.data.locating) return
    this.setData({
      locating: true,
      statusText: '正在获取所在区域，不需要非常精确，小享会按附近区域查找服务。'
    })
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 10000,
      success: (res) => {
        const location = {
          latitude: Number(res.latitude),
          longitude: Number(res.longitude),
          address: '当前位置'
        }
        this.applyLocation(location, '已定位到当前区域，正在查找附近服务。', 'getLocation')
        this.reverseGeocode(location)
      },
      fail: (err) => {
        this.setData({ locating: false })
        const msg = String(err && (err.errMsg || err.message || ''))
        if (/timeout/i.test(msg)) {
          this.locateByIp('定位超时，已改用所在城市区域查找附近服务。')
          return
        }
        wx.showModal({
          title: '需要定位权限',
          content: '请允许定位，才能为您查找附近银行、医院、药店和社区服务点。也可以手动选择位置。',
          confirmText: '去设置',
          cancelText: '手动选择',
          success: (res) => {
            if (res.confirm && wx.openSetting) {
              wx.openSetting({
                success: (setting) => {
                  const auth = setting.authSetting || {}
                  if (auth['scope.userLocation']) {
                    this.getMyLocation()
                  } else {
                    this.locateByIp('还没有开启定位，已改用所在城市区域。')
                  }
                },
                fail: () => this.locateByIp('无法打开设置，已改用所在城市区域。')
              })
            } else {
              this.chooseLocation()
            }
          },
          fail: () => this.locateByIp('定位未开启，已改用所在城市区域。')
        })
      }
    })
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        const latitude = Number(res.latitude)
        const longitude = Number(res.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          this.locateByIp('选择的位置缺少坐标，已改用所在城市区域。')
          return
        }
        this.applyLocation({
          latitude,
          longitude,
          address: res.address || res.name || '手动选择的位置'
        }, res.name ? `已选择：${res.name}` : '已选择地图位置，正在查找附近服务。', 'chooseLocation')
      },
      fail: () => wx.showToast({ title: '没有选择位置', icon: 'none' })
    })
  },

  useDefaultLocation(message) {
    this.applyLocation(DEFAULT_LOCATION, message || '已使用默认城市位置查找附近服务。', 'default')
  },

  locateByIp(message) {
    this.setData({
      locating: true,
      statusText: message || '正在按所在城市区域查找附近服务。'
    })
    app.request({
      url: '/lbs/ip-location',
      loading: false
    }).then(res => {
      const loc = (res && res.location) || {}
      const latitude = Number(loc.latitude || loc.lat)
      const longitude = Number(loc.longitude || loc.lng)
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        this.applyLocation({
          latitude,
          longitude,
          address: res.address || DEFAULT_CITY
        }, message || '已按所在城市区域查找附近服务。', 'ip')
      } else {
        this.useDefaultLocation(message || '暂时无法获取所在区域，已使用默认城市位置。')
      }
    }).catch(() => this.useDefaultLocation(message || '暂时无法获取所在区域，已使用默认城市位置。'))
  },

  applyLocation(location, message, source = 'location') {
    const latitude = Number(location.latitude)
    const longitude = Number(location.longitude)
    const nextLocation = {
      latitude: Number.isFinite(latitude) ? latitude : DEFAULT_LOCATION.latitude,
      longitude: Number.isFinite(longitude) ? longitude : DEFAULT_LOCATION.longitude,
      address: location.address || DEFAULT_CITY
    }
    this.setData({
      latitude: nextLocation.latitude,
      longitude: nextLocation.longitude,
      currentAddress: nextLocation.address,
      locating: false,
      activePlaceId: '',
      activeMarkerId: 0,
      locationSource: source,
      statusText: message || '正在查找附近服务。',
      markers: this.buildMarkers([], nextLocation)
    })
    if (['getLocation', 'chooseLocation', 'address'].includes(source)) this.saveAuthorizedLocation(nextLocation, source)
    this.searchNearby(this.data.currentCategory)
  },

  saveAuthorizedLocation(location, source) {
    if (!wx.getStorageSync('token')) return
    app.request({
      url: '/profile/location',
      method: 'POST',
      data: {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        address: location.address || this.data.currentAddress || '已授权位置',
        source: source || 'user_authorized'
      },
      loading: false
    }).catch(() => {})
  },

  reverseGeocode(location) {
    app.request({
      url: '/lbs/reverse-geocode',
      data: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      loading: false
    }).then(res => {
      if (res && res.address) {
        this.setData({ currentAddress: res.address })
        this.saveAuthorizedLocation({ latitude: location.latitude, longitude: location.longitude, address: res.address }, 'getLocation')
      }
    }).catch(() => {})
  },

  switchCategory(e) {
    const key = e.currentTarget.dataset.key || 'bank'
    this.setData({
      currentCategory: key,
      activePlaceId: '',
      activeMarkerId: 0
    })
    this.searchNearby(key)
  },

  onAddressInput(e) {
    this.setData({ addressInput: e.detail.value })
  },

  searchAddress() {
    const address = String(this.data.addressInput || '').trim()
    if (!address) {
      wx.showToast({ title: '请输入街道、小区或城市地址', icon: 'none' })
      return
    }
    app.request({
      url: '/lbs/geocode',
      data: { address },
      loading: false
    }).then(res => {
      const loc = (res && res.location) || {}
      const latitude = Number(loc.latitude || loc.lat)
      const longitude = Number(loc.longitude || loc.lng)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        wx.showToast({ title: '这个地址暂时没有坐标', icon: 'none' })
        return
      }
      this.applyLocation({
        latitude,
        longitude,
        address: res.address || address
      }, `已定位到：${res.address || address}`, 'address')
    }).catch(() => wx.showToast({ title: '地址解析服务暂不可用', icon: 'none' }))
  },

  searchNearby(categoryKey) {
    const category = currentCategory(categoryKey)
    const currentLocation = { latitude: this.data.latitude, longitude: this.data.longitude }
    const radius = this.data.locationSource === 'getLocation' ? 5000 : 12000
    this.setData({
      loadingPlaces: true,
      sourceText: '',
      statusText: `正在查找附近${category.label}。`
    })
    app.request({
      url: '/lbs/nearby',
      data: {
        type: category.key,
        keyword: category.keyword,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        city: DEFAULT_CITY,
        radius
      },
      loading: false
    }).then(payload => {
      const places = ((payload && payload.items) || [])
        .map((item, index) => mapPlace(item, index, category, currentLocation))
        .filter(Boolean)
      if (!places.length) {
        this.setData({
          places: [],
          markers: this.buildMarkers([], currentLocation),
          loadingPlaces: false,
          sourceText: payload && payload.source ? payload.source : '',
          statusText: (payload && payload.message) || `当前区域暂无搜索到的${category.label}，可扩大地址范围后重试。`
        })
        return
      }
      this.setData({
        places,
        markers: this.buildMarkers(places, currentLocation),
        loadingPlaces: false,
        statusText: `已找到附近${category.label}，可查看地图、导航或问小享指路。`,
        sourceText: payload.source === 'tencent_map' ? '腾讯地图实时搜索' : (payload.source || '后端位置服务')
      })
    }).catch(() => {
      this.setData({
        places: [],
        markers: this.buildMarkers([], currentLocation),
        loadingPlaces: false,
        sourceText: '',
        statusText: '附近服务暂时无法读取，请检查网络或稍后重试。'
      })
    })
  },

  buildMarkers(places, currentLocation) {
    const markers = [{
      id: 1,
      latitude: Number(currentLocation.latitude),
      longitude: Number(currentLocation.longitude),
      title: '当前位置',
      width: USER_MARKER_SIZE,
      height: USER_MARKER_SIZE,
      callout: {
        content: '当前位置',
        display: 'ALWAYS',
        padding: 8,
        borderRadius: 8,
        bgColor: '#fff8ec',
        color: '#5d3a08'
      }
    }]
    ;(places || []).forEach((item, index) => {
      markers.push({
        id: Number(item.markerId || index + 2),
        latitude: Number(item.location.lat),
        longitude: Number(item.location.lng),
        title: item.title,
        width: PLACE_MARKER_SIZE,
        height: PLACE_MARKER_SIZE,
        callout: {
          content: item.title,
          display: this.data.activeMarkerId === (item.markerId || index + 2) ? 'ALWAYS' : 'BYCLICK',
          padding: 8,
          borderRadius: 8,
          bgColor: '#fff8ec',
          color: '#5d3a08'
        }
      })
    })
    return markers
  },

  onMarkerTap(e) {
    const markerId = Number(e.markerId)
    if (markerId === 1) return
    const place = (this.data.places || []).find(item => Number(item.markerId) === markerId)
    if (!place) return
    this.setData({
      activeMarkerId: markerId,
      activePlaceId: place.id,
      scrollIntoView: `place-${place.id}`,
      markers: this.buildMarkers(this.data.places, { latitude: this.data.latitude, longitude: this.data.longitude })
    })
  },

  openNavigate(e) {
    const item = this.findPlace(e.currentTarget.dataset.id)
    if (!item || !item.location) {
      wx.showToast({ title: '该地点缺少坐标，请重新选择地点。', icon: 'none' })
      return
    }
    const latitude = Number(item.location.lat || item.latitude || item.lat)
    const longitude = Number(item.location.lng || item.longitude || item.lng)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      wx.showToast({ title: '该地点缺少坐标，请重新选择地点。', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude,
      longitude,
      name: item.title || '附近服务点',
      address: item.address || '',
      scale: 18,
      fail: () => wx.showModal({
        title: '请在手机上打开导航',
        content: '当前位置或目的地暂时无法交给微信地图，请重新定位后再试。',
        showCancel: false
      })
    })
  },

  drawRoute(e) {
    this.openGuideDialogById(e.currentTarget.dataset.id)
  },

  askXiaoXiang(e) {
    this.openGuideDialogById(e.currentTarget.dataset.id)
  },

  openGuideDialogById(id) {
    const item = this.findPlace(id)
    if (!item) return
    this.openGuideDialog(item)
  },

  openGuideDialog(item) {
    const nearbyNames = (this.data.places || [])
      .filter(place => place.id !== item.id)
      .slice(0, 2)
      .map(place => place.title)
      .join('、')
    const lines = [
      `已经为您选中 ${item.title}。`,
      item.address ? `地址：${item.address}` : '',
      item.distanceText ? `距离：${item.distanceText}` : '',
      '您可以点“打开导航”进入微信地图导航。',
      '出门前请确认手机电量、证件和随身药品。',
      nearbyNames ? `附近还可以考虑：${nearbyNames}。` : ''
    ].filter(Boolean)
    const guideMessages = [{
      id: `g_${Date.now()}`,
      role: 'assistant',
      sender: '小享',
      text: lines.join('\n')
    }]
    this.setData({
      showGuideDialog: true,
      guideDialogMinimized: false,
      guideDragging: false,
      selectedGuidePlace: item,
      guideInput: '',
      guideMessages,
      dialogLeft: this.data.defaultDialogLeft || DEFAULT_DIALOG_LEFT,
      dialogTop: this.data.defaultDialogTop || DEFAULT_DIALOG_TOP
    })
  },

  closeGuideDialog() {
    this.setData({
      showGuideDialog: false,
      guideDialogMinimized: false,
      guideDragging: false,
      guideRecording: false,
      dialogLeft: this.data.defaultDialogLeft || DEFAULT_DIALOG_LEFT,
      dialogTop: this.data.defaultDialogTop || DEFAULT_DIALOG_TOP
    })
  },

  initGuideVoice() {
    if (!guideRecorderManager || this._guideVoiceReady) return
    this._guideVoiceReady = true
    guideRecorderManager.onStop((res) => {
      if (guideRecordTimer) {
        clearInterval(guideRecordTimer)
        guideRecordTimer = null
      }
      this.setData({ guideRecording: false, guideRecordingSeconds: 0 })
      if (res && res.tempFilePath) {
        this.uploadGuideVoice(res.tempFilePath)
      }
    })
    guideRecorderManager.onError(() => {
      if (guideRecordTimer) {
        clearInterval(guideRecordTimer)
        guideRecordTimer = null
      }
      this.setData({ guideRecording: false, guideRecordingSeconds: 0 })
      wx.showToast({ title: '录音失败，请改用文字输入', icon: 'none' })
    })
  },

  startGuideVoice() {
    if (!guideRecorderManager) {
      wx.showToast({ title: '当前设备不支持语音输入', icon: 'none' })
      return
    }
    if (this.data.guideRecording) return

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
          this.setData({ guideRecording: true, guideRecordingSeconds: 0 })
          guideRecorderManager.start({
            duration: 30000,
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000,
            format: 'wav'
          })
          guideRecordTimer = setInterval(() => {
            const seconds = this.data.guideRecordingSeconds + 1
            this.setData({ guideRecordingSeconds: seconds })
            if (seconds >= 28 && guideRecorderManager) guideRecorderManager.stop()
          }, 1000)
          return
        }
        // 未询问 → 发起授权
        wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ guideRecording: true, guideRecordingSeconds: 0 })
        guideRecorderManager.start({
          duration: 30000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'wav'
        })
        guideRecordTimer = setInterval(() => {
          const seconds = this.data.guideRecordingSeconds + 1
          this.setData({ guideRecordingSeconds: seconds })
          if (seconds >= 28 && guideRecorderManager) guideRecorderManager.stop()
        }, 1000)
      },
      fail: (authErr) => {
            console.error('[语音] authorize失败:', JSON.stringify(authErr))
            this.setData({ guideRecording: false, guideRecordingSeconds: 0 })
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
            this.setData({ guideRecording: true, guideRecordingSeconds: 0 })
            guideRecorderManager.start({
              duration: 30000,
              sampleRate: 16000,
              numberOfChannels: 1,
              encodeBitRate: 48000,
              format: 'wav'
            })
            guideRecordTimer = setInterval(() => {
              const seconds = this.data.guideRecordingSeconds + 1
              this.setData({ guideRecordingSeconds: seconds })
              if (seconds >= 28 && guideRecorderManager) guideRecorderManager.stop()
            }, 1000)
          },
          fail: () => {
            this.setData({ guideRecording: false, guideRecordingSeconds: 0 })
            wx.showModal({ title: '需要麦克风权限', content: '请在设置中开启麦克风权限。', showCancel: false })
          }
        })
      }
    })
  },

  stopGuideVoice() {
    if (!this.data.guideRecording || !guideRecorderManager) return
    if (guideRecordTimer) {
      clearInterval(guideRecordTimer)
      guideRecordTimer = null
    }
    guideRecorderManager.stop()
  },

  uploadGuideVoice(filePath) {
    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    const thinkingId = `v_${Date.now()}`
    this.setData({
      guideMessages: this.data.guideMessages.concat({
        id: thinkingId,
        role: 'assistant',
        sender: '小享',
        text: '小享正在识别语音...'
      })
    })
    wx.uploadFile({
      url: baseUrl + '/assistant/voice-to-text?format=wav',
      timeout: 70000,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (uploadRes) => {
        let data = {}
        try { data = JSON.parse(uploadRes.data || '{}') } catch (e) {}
        const text = String(data.text || '').trim()
        if (text) {
          this.replaceGuideMessage(thinkingId, `已识别：${text}`)
          this.setData({ guideInput: text })
        } else {
          this.replaceGuideMessage(thinkingId, data.message || '语音暂时没有识别清楚，请改用文字输入。')
        }
      },
      fail: () => this.replaceGuideMessage(thinkingId, '语音上传失败，请改用文字输入。')
    })
  },

  chooseGuideImage() {
    const upload = (filePath) => this.analyzeGuideImage(filePath)
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

  analyzeGuideImage(filePath) {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!fs) {
      wx.showToast({ title: '当前设备暂不支持图片读取', icon: 'none' })
      return
    }
    const place = this.data.selectedGuidePlace || {}
    const userMsg = { id: `img_${Date.now()}`, role: 'user', sender: '我', text: '发了一张图片，请小享结合目的地帮忙看。' }
    const thinkingId = `img_a_${Date.now()}`
    this.setData({
      guideMessages: this.data.guideMessages.concat(userMsg, {
        id: thinkingId,
        role: 'assistant',
        sender: '小享',
        text: '小享正在看图片...'
      })
    })
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        this.requestAssistantImage({
          image_base64: res.data,
          text: `附近服务指路。目的地：${place.title || ''}，地址：${place.address || ''}。请结合图片给出老人能懂的操作建议。`,
          scene: 'nearby_navigation_image'
        }).then(answer => {
          this.replaceGuideMessage(thinkingId, answer || '图片已收到。请继续点“打开导航”，出门前核对地点名称和地址。')
        }).catch(() => {
          this.replaceGuideMessage(thinkingId, '图片识别暂不可用。请直接输入您想问的路线问题。')
        })
      },
      fail: () => this.replaceGuideMessage(thinkingId, '图片读取失败，请换一张图片或改用文字输入。')
    })
  },

  toggleGuideMinimize() {
    this.setData({ guideDialogMinimized: !this.data.guideDialogMinimized })
  },

  onGuideInput(e) {
    this.setData({ guideInput: e.detail.value })
  },

  sendGuideQuestion() {
    const content = String(this.data.guideInput || '').trim()
    if (!content) {
      wx.showToast({ title: '请先输入想问的问题', icon: 'none' })
      return
    }
    const place = this.data.selectedGuidePlace || {}
    const userMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      sender: '我',
      text: content
    }
    const thinking = {
      id: `a_${Date.now()}`,
      role: 'assistant',
      sender: '小享',
      text: '小享正在帮您整理指路建议...'
    }
    this.setData({
      guideInput: '',
      guideMessages: this.data.guideMessages.concat(userMsg, thinking)
    })
    const prompt = [
      '请用适合长辈听懂的话回答附近服务指路问题。',
      `目的地：${place.title || ''}`,
      `地址：${place.address || ''}`,
      `距离：${place.distanceText || ''}`,
      `分类：${place.category || ''}`,
      `当前位置：${this.data.currentAddress}`,
      `用户问题：${content}`,
      '不要输出复杂路线坐标，不要让用户打开外部 scheme。可以提醒用户点击页面里的“打开导航”。'
    ].join('\n')
    this.requestAssistant(prompt, {
      scene: 'nearby_navigation',
      place,
      current_location: {
        latitude: this.data.latitude,
        longitude: this.data.longitude,
        address: this.data.currentAddress
      }
    }).then(answer => {
      this.replaceGuideMessage(thinking.id, answer || this.localGuideAnswer(place, content))
    }).catch(() => {
      this.replaceGuideMessage(thinking.id, this.localGuideAnswer(place, content))
    })
  },

  requestAssistant(message, context) {
    if (app.request) {
      return app.request({
        url: '/assistant/chat',
        method: 'POST',
        loading: false,
        data: {
          session_id: `nearby_${Date.now()}`,
          message,
          scene: 'nearby_navigation',
          mode: 'nearby_navigation',
          context
        }
      }).then(res => res.reply || res.answer || '')
    }
    return Promise.reject(new Error('request_unavailable'))
  },

  requestAssistantImage(payload) {
    return app.request({
      url: '/assistant/multimodal-analyze',
      method: 'POST',
      loading: false,
      data: payload
    }).then(res => res.answer || res.reply || res.extracted_text || '')
  },

  replaceGuideMessage(id, text) {
    const guideMessages = (this.data.guideMessages || []).map(item => {
      if (item.id === id) return { ...item, text }
      return item
    })
    this.setData({ guideMessages })
  },

  localGuideAnswer(place, question) {
    const ask = String(question || '')
    if (/远|多久|时间/.test(ask)) {
      return `从当前区域到 ${place.title || '这个地点'} 大约是 ${place.distanceText || '附近'}。实际时间要以微信地图导航为准，出门前请先看天气和路况。`
    }
    if (/安全|老人|自己/.test(ask)) {
      return `如果是老人自己去，建议先确认目的地名称和地址，手机保持有电，必要时把行程告诉家人。到达前不要给陌生人转账或出示验证码。`
    }
    if (/电话|联系/.test(ask)) {
      return place.phone ? `这个地点有电话：${place.phone}。您可以先电话确认营业时间和要带的材料。` : '这个地点暂时没有电话，建议点“打开导航”进入微信地图查看详情。'
    }
    return `您可以先点“打开导航”，用微信地图带路去 ${place.title || '这个地点'}。出门前确认手机电量、身份证件、医保卡或银行卡是否带齐。`
  },

  openGuideNavigation() {
    const place = this.data.selectedGuidePlace
    if (!place) return
    this.openNavigate({ currentTarget: { dataset: { id: place.id } } })
  },

  guideDragStart(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return
    this.setData({
      guideDragging: true,
      dragStartX: touch.clientX,
      dragStartY: touch.clientY,
      dragStartLeft: this.data.dialogLeft,
      dragStartTop: this.data.dialogTop
    })
  },

  guideDragMove(e) {
    if (!this.data.guideDragging) return
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const left = this.data.dragStartLeft + (touch.clientX - this.data.dragStartX) * 2
    const top = this.data.dragStartTop + (touch.clientY - this.data.dragStartY) * 2
    const maxLeft = Math.max(16, this.data.screenWidthRpx - DIALOG_WIDTH - 16)
    const maxTop = Math.max(180, this.data.screenHeightRpx - DIALOG_HEIGHT - 80)
    this.setData({
      dialogLeft: Math.max(16, Math.min(maxLeft, left)),
      dialogTop: Math.max(80, Math.min(maxTop, top))
    })
  },

  guideDragEnd() {
    this.setData({ guideDragging: false })
  },

  findPlace(id) {
    return (this.data.places || []).find(item => String(item.id) === String(id))
  },

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

  // ---- 语音输入：识别后填入地址搜索 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    const needle = String(text).trim()
    // 如果包含地点关键词，直接搜索
    if (needle) {
      this.setData({ addressInput: needle })
      wx.showToast({ title: '已识别：' + needle.slice(0, 15), icon: 'none', duration: 1000 })
      // 自动触发搜索
      setTimeout(() => { this.searchAddress() }, 500)
    }
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})

},
"pages/news-detail/news-detail.js": function(require,module,exports){
const termHelper = require('../../utils/termExplain.js')

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '')
  } catch (e) {
    return value || ''
  }
}

function decorateArticle(item) {
  const article = item || {}
  const title = article.title || '养老理财资讯'
  const summary = article.summary || article.desc || ''
  const content = article.content || article.detail || summary || '暂无更多详情，请以官方渠道发布的信息为准。'
  const paragraphs = String(content)
    .split(/\n+/)
    .map(text => text.trim())
    .filter(Boolean)

  return {
    ...article,
    title,
    summary,
    content,
    titleSegments: termHelper.buildTermSegments(title),
    summarySegments: termHelper.buildTermSegments(summary),
    paragraphs: (paragraphs.length ? paragraphs : [content]).map(text => ({
      text,
      segments: termHelper.buildTermSegments(text)
    }))
  }
}

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    article: decorateArticle(null),
    articleLoading: false,
    termExplainPopups: []
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    this.loadArticle(options)
  },

  onShow() {
    this.syncGlobalFont()
  },

  syncGlobalFont() {
    const app = getApp()
    if (app && app.getGlobalFontSetting) {
      const font = app.getGlobalFontSetting()
      this.setData({ globalFontPageClass: font.pageClass })
    }
  },

  loadArticle(options) {
    const list = wx.getStorageSync('home_articles') || []
    const idx = Number(options.index)
    const id = safeDecode(options.id)
    let item = null

    if (!Number.isNaN(idx) && list[idx]) {
      item = list[idx]
    } else if (id) {
      item = list.find(news => String(news.id || news.title || '') === id)
    }

    // 先用基础信息渲染（标题、来源、日期可见）
    this.setData({
      article: decorateArticle(item),
      articleLoading: false
    })

    // 如果有 URL，抓取完整文章
    const articleUrl = item && (item.url || item.link || item.share_url)
    if (articleUrl) {
      this.setData({ articleLoading: true })
      const app = getApp()
      if (app && app.request) {
        app.request({
          url: '/news/article-content',
          data: { url: articleUrl },
          loading: false
        }).then(res => {
          if (res && res.ok && res.paragraphs && res.paragraphs.length) {
            const fullArticle = {
              ...item,
              title: res.title || item.title,
              source: res.source || item.source,
              date: res.date || item.time,
              content: res.paragraphs.join('\n')
            }
            this.setData({
              article: decorateArticle(fullArticle),
              articleLoading: false
            })
          } else {
            this.setData({ articleLoading: false })
          }
        }).catch(() => {
          this.setData({ articleLoading: false })
        })
      }
    }
  },

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    if (!term) return
    // 点击难词直接跳转AI助手页面一键询问
    termHelper.goAskTerm(term)
  },

  readArticle() {
    const article = this.data.article
    getApp().readText(`资讯：${article.title}。${article.summary || article.content}`)
  },

  askXiang() {
    const article = this.data.article
    wx.navigateTo({
      url: `/pages/assistant/assistant?ask=${encodeURIComponent(`请用适合长辈理解的话，解释这条资讯和我的养老资金有什么关系：${article.title}。${article.summary || article.content}`)}`
    })
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

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

  // ---- 语音输入：语音提问这篇新闻 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    const title = this.data.article && this.data.article.title ? this.data.article.title : ''
    const question = title ? `关于「${title.slice(0, 20)}」的新闻，${text}` : text
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/assistant/assistant?question=' + encodeURIComponent(question),
        fail: (err) => {
          console.error('[新闻详情] 语音跳转失败:', err)
          wx.showToast({ title: '跳转失败，请重试', icon: 'none' })
        }
      })
    }, 100)
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})

},
"pages/profile/profile.js": function(require,module,exports){
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

},
"pages/questionnaire/questionnaire.js": function(require,module,exports){
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

},
"pages/register/register.js": function(require,module,exports){
const DEFAULT_AVATAR = '/assets/ui/default_avatar.png'

Page({
  data: {
    phone: '',
    password: '',
    nickname: '',
    avatar: DEFAULT_AVATAR,
    role: 'elder',
    bind_code: '',
    setSecurityQuestion: false,
    submitting: false,
    globalFontPageClass: 'font-global-normal'
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    if (options.role) this.setData({ role: options.role === 'child' ? 'child' : 'elder' })
  },

  onShow() { this.syncGlobalFont() },

  syncGlobalFont() {
    const app = getApp()
    if (!app.getGlobalFontSetting) return
    this.setData({ globalFontPageClass: app.getGlobalFontSetting().pageClass })
  },

  back() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/login/login' }) })
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.k]: e.detail.value })
  },

  onChooseAvatar(e) {
    if (e.detail && e.detail.avatarUrl) this.setData({ avatar: e.detail.avatarUrl })
  },

  onSecuritySwitch(e) {
    this.setData({ setSecurityQuestion: !!e.detail.value })
  },

  chooseRole(e) {
    const role = e.currentTarget.dataset.role === 'child' ? 'child' : 'elder'
    this.setData({ role, bind_code: role === 'elder' ? '' : this.data.bind_code })
  },

  validate() {
    const phone = String(this.data.phone || '').trim()
    const password = String(this.data.password || '')
    const nickname = String(this.data.nickname || '').trim()
    const bindCode = String(this.data.bind_code || '').trim()
    if (!nickname) return wx.showToast({ title: '请先设置昵称', icon: 'none' }), false
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' }), false
    if (password.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' }), false
    if (this.data.role === 'child' && !/^\d{6}$/.test(bindCode)) {
      wx.showToast({ title: '子女端必须输入6位家庭绑定码', icon: 'none' })
      return false
    }
    return true
  },

  uploadAvatar(filePath, token) {
    if (!filePath || filePath === DEFAULT_AVATAR || filePath.startsWith('/assets/')) return Promise.resolve(null)
    const baseUrl = getApp().globalData.baseUrl
    return new Promise(resolve => {
      wx.uploadFile({
        url: baseUrl + '/user/avatar/upload',
        filePath,
        name: 'file',
        header: { Authorization: `Bearer ${token}` },
        success: res => {
          try { resolve(JSON.parse(res.data || '{}')) } catch (e) { resolve(null) }
        },
        fail: () => resolve(null)
      })
    })
  },

  bindWechatAfterRegistration(phone, password, role) {
    return new Promise(resolve => {
      wx.login({
        success: loginRes => {
          if (!loginRes.code) return resolve(false)
          getApp().request({
            url: '/auth/wechat-login',
            method: 'POST',
            data: { code: loginRes.code, phone, password, role },
            loading: false
          }).then(() => resolve(true)).catch(() => resolve(false))
        },
        fail: () => resolve(false)
      })
    })
  },

  clearTemporaryLogin() {
    wx.removeStorageSync('token')
    wx.removeStorageSync('rememberLoginUntil')
    getApp().globalData.token = ''
  },

  finishRegistration(phone, role) {
    this.clearTemporaryLogin()
    wx.redirectTo({
      url: `/pages/login/login?phone=${encodeURIComponent(phone)}&role=${role}&registered=1`
    })
  },

  register() {
    if (this.data.submitting || !this.validate()) return
    const phone = String(this.data.phone || '').trim()
    const role = this.data.role === 'child' ? 'child' : 'elder'
    this.setData({ submitting: true })
    getApp().request({
      url: '/auth/register',
      method: 'POST',
      data: {
        phone,
        password: this.data.password,
        nickname: String(this.data.nickname || '').trim(),
        avatar: '',
        role,
        bind_code: role === 'child' ? String(this.data.bind_code || '').trim() : ''
      },
      loading: true
    }).then(async res => {
      wx.setStorageSync('token', res.token)
      wx.setStorageSync('user', res.user)
      wx.setStorageSync('profile', res.profile || {})
      wx.setStorageSync('role', role)
      getApp().globalData.token = res.token
      const avatarResult = await this.uploadAvatar(this.data.avatar, res.token)
      if (avatarResult && avatarResult.avatar) {
        const profile = avatarResult.profile || res.profile || {}
        const user = Object.assign({}, res.user, { avatar: avatarResult.avatar })
        wx.setStorageSync('profile', profile)
        wx.setStorageSync('user', user)
      }
      const wechatBound = await this.bindWechatAfterRegistration(phone, this.data.password, role)
      wx.showModal({
        title: '注册成功',
        content: this.data.setSecurityQuestion
          ? '接下来设置一个密保问题，忘记密码时可以用它找回。'
          : (wechatBound ? '微信已绑定。请返回登录页，可使用手机号或微信登录。' : '请返回登录页使用手机号密码登录；微信绑定可在登录时继续完成。'),
        showCancel: false,
        confirmText: this.data.setSecurityQuestion ? '设置密保' : '去登录',
        success: () => {
          if (this.data.setSecurityQuestion) {
            wx.redirectTo({
              url: `/pages/security-question/security-question?registration=1&phone=${encodeURIComponent(phone)}&role=${role}`
            })
          } else {
            this.finishRegistration(phone, role)
          }
        }
      })
    }).catch(err => {
      const detail = String(err && err.data && err.data.detail || '')
      const message = /已注册|手机号|密码|绑定码|昵称|身份/.test(detail)
        ? detail
        : '暂时没有注册成功，请检查网络和填写内容后再试。'
      wx.showModal({
        title: '注册失败',
        content: message,
        showCancel: false
      })
    }).finally(() => this.setData({ submitting: false }))
  }
})

},
"pages/security-question/security-question.js": function(require,module,exports){
const QUESTIONS = [
  '您小时候最喜欢的一道菜是什么？',
  '您印象最深的一位老师姓什么？',
  '您第一次工作的城市是哪里？',
  '您最喜欢的传统节日是什么？',
  '您小时候常去的公园或街道叫什么？',
  '您最喜欢的一首老歌叫什么？'
]

Page({
  data: {
    question: '',
    answer: '',
    phone: '',
    role: 'elder',
    registration: false,
    submitting: false,
    globalFontPageClass: 'font-global-normal'
  },

  onLoad(options = {}) {
    this.setData({
      phone: options.phone ? decodeURIComponent(options.phone) : '',
      role: options.role === 'child' ? 'child' : 'elder',
      registration: options.registration === '1'
    })
    this.refreshQuestion()
    this.syncGlobalFont()
  },

  onShow() { this.syncGlobalFont() },

  syncGlobalFont() {
    const font = getApp().getGlobalFontSetting()
    this.setData({ globalFontPageClass: font.pageClass })
  },

  refreshQuestion() {
    const current = this.data.question
    const choices = QUESTIONS.filter(item => item !== current)
    this.setData({ question: choices[Math.floor(Math.random() * choices.length)], answer: '' })
  },

  onAnswer(e) { this.setData({ answer: e.detail.value }) },

  finish() {
    wx.removeStorageSync('token')
    wx.removeStorageSync('rememberLoginUntil')
    getApp().globalData.token = ''
    wx.redirectTo({ url: `/pages/login/login?phone=${encodeURIComponent(this.data.phone)}&role=${this.data.role}&registered=1` })
  },

  skip() {
    wx.showModal({
      title: '暂不设置密保',
      content: '以后忘记密码时将无法通过问题找回。确定暂不设置吗？',
      confirmText: '暂不设置',
      success: res => { if (res.confirm) this.finish() }
    })
  },

  submit() {
    const answer = String(this.data.answer || '').trim()
    if (answer.length < 2) return wx.showToast({ title: '答案至少填写2个字', icon: 'none' })
    this.setData({ submitting: true })
    getApp().request({
      url: '/auth/security-question',
      method: 'POST',
      data: { question: this.data.question, answer },
      loading: true
    }).then(() => {
      wx.showModal({ title: '设置成功', content: '请记住您的答案。现在返回登录页。', showCancel: false, success: () => this.finish() })
    }).catch(err => {
      wx.showModal({ title: '保存失败', content: (err.data && err.data.detail) || '请检查网络后重试。', showCancel: false })
    }).finally(() => this.setData({ submitting: false }))
  },

  back() { this.data.registration ? this.skip() : wx.navigateBack() }
})

},
"pages/service/service.js": function(require,module,exports){
// 常用号码页面 —— 优化版：支持语音输入和语音播报
const app = getApp()

let recorderManager = null
let recordTimer = null
let ttsAudio = null

try {
  recorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null
} catch (e) {
  recorderManager = null
}

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    phones: [],
    phoneList: [],
    tip: '',
    showPanel: false,
    form: {
      name: '',
      phone: ''
    },
    recording: false,
    recordingSeconds: 0,
    recordingMax: 30,
    recordingField: ''  // 'name' | 'phone' | 'all' — 当前正在录音的字段
  },

  onShow() {
    this.syncGlobalFont()
    this.loadPhones()
  },

  onUnload() {
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    if (ttsAudio) {
      ttsAudio.stop()
      ttsAudio.destroy()
      ttsAudio = null
    }
  },

  // ---------- 全局字体 ----------

  syncGlobalFont() {
    const font = app.getGlobalFontSetting()
    this.setData({ globalFontPageClass: font.pageClass })
  },

  // ---------- 数据加载 ----------

  loadPhones() {
    app.request({
      url: '/service/phones'
    }).then(res => {
      const phones = res.items || res.phones || []
      this.setData({ phones, phoneList: phones })
      wx.setStorageSync('phones', phones)
      wx.setStorageSync('phoneList', phones)
      wx.setStorageSync('service_phones', phones)
    }).catch(() => {
      const phones =
        wx.getStorageSync('phones') ||
        wx.getStorageSync('phoneList') ||
        wx.getStorageSync('service_phones') ||
        []
      this.setData({ phones, phoneList: phones })
    })
  },

  goNearbyService() {
    wx.navigateTo({
      url: '/pages/nearby/nearby?category=' + encodeURIComponent('社区服务中心')
    })
  },

  // ---------- 通用语音播报 ----------

  initTtsAudio() {
    if (ttsAudio) return
    ttsAudio = wx.createInnerAudioContext()
    ttsAudio.onEnded(() => {})
    ttsAudio.onError(() => {})
  },

  // 播报指定文字（通用方法），onDone 在语音播完后回调
  speakText(text, onDone) {
    if (!text) {
      if (onDone) onDone()
      return
    }
    this.initTtsAudio()
    if (ttsAudio) ttsAudio.stop()

    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''

    // 设置播完回调
    if (onDone) {
      ttsAudio.onEnded(() => {
        ttsAudio.onEnded(() => {})
        onDone()
      })
      ttsAudio.onError(() => {
        ttsAudio.onError(() => {})
        onDone()
      })
    }

    wx.request({
      url: baseUrl + '/assistant/text-to-voice',
      method: 'POST',
      timeout: 70000,
      data: { text: String(text).slice(0, 500) },
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.ok) {
          if (ttsAudio) {
            ttsAudio.src = baseUrl + res.data.url
            ttsAudio.play()
          }
        } else {
          if (onDone) onDone()
        }
      },
      fail: () => {
        if (onDone) onDone()
      }
    })
  },

  // 点击联系人播报电话号码
  speakContact(e) {
    const name = e.currentTarget.dataset.name || ''
    const phone = e.currentTarget.dataset.phone || ''
    if (!name && !phone) return

    const text = phone
      ? `${name}的电话号码是${phone.split('').join(' ')}`
      : name

    this.speakText(text)
  },

  // ---------- 拨打 ----------

  callPhone(e) {
    const rawPhone = e.currentTarget.dataset.phone
    const phone = String(rawPhone || '').replace(/[^\d+]/g, '')
    if (!phone) {
      wx.showToast({ title: '暂无电话号码', icon: 'none' })
      return
    }

    // 查找联系人姓名用于语音播报
    const item = this.data.phones.find(p => String(p.phone || '').replace(/[^\d+]/g, '') === String(phone))
    const name = item ? item.name : '该号码'

    this.speakText(`打给${name}`)
    wx.makePhoneCall({
      phoneNumber: String(phone),
      fail: () => {
        wx.showModal({
          title: '拨号失败',
          content: `请确认当前设备支持拨号，或手动拨打：${phone}`,
          showCancel: false
        })
      }
    })
  },

  // ---------- 删除 ----------

  deletePhone(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.phones.find(p => String(p.id) === String(id))
    const name = item ? item.name : '该联系人'

    // 语音询问确认
    this.speakText(`是否删除${name}？`)

    wx.showModal({
      title: '删除电话',
      content: `确定删除${name}的电话吗？`,
      confirmText: '删除',
      confirmColor: '#d94b2b',
      success: (res) => {
        if (!res.confirm) return
        const doDelete = () => {
          app.request({
            url: '/service/phones/' + id,
            method: 'DELETE',
            loading: true
          }).then(() => {
            this.loadPhones()
            // 语音确认已删除
            this.speakText(`已删除${name}的电话`)
            wx.showToast({ title: '已删除', icon: 'success' })
          }).catch(() => {
            const phones = (this.data.phones || this.data.phoneList || []).filter(item => {
              return String(item.id) !== String(id)
            })
            this.setData({ phones, phoneList: phones })
            wx.setStorageSync('phones', phones)
            wx.setStorageSync('phoneList', phones)
            wx.setStorageSync('service_phones', phones)
            this.speakText(`已删除${name}的电话`)
            wx.showToast({ title: '已删除', icon: 'success' })
          })
        }
        doDelete()
      }
    })
  },

  // ---------- 添加面板 ----------

  showAddPanel() {
    this.setData({
      showPanel: true,
      form: { name: '', phone: '' }
    })
  },

  hideAddPanel() {
    this.setData({ showPanel: false })
  },

  onNameInput(e) {
    this.setData({ 'form.name': e.detail.value })
  },

  onPhoneInput(e) {
    this.setData({ 'form.phone': e.detail.value })
  },

  // ---------- 提交新联系人 ----------

  submitPhone() {
    const { name, phone } = this.data.form
    if (!name.trim()) {
      wx.showToast({ title: '请输入联系人名称', icon: 'none' })
      return
    }
    if (!phone.trim()) {
      wx.showToast({ title: '请输入电话号码', icon: 'none' })
      return
    }

    const saveName = name.trim()
    const savePhone = phone.trim()

    app.request({
      url: '/service/phones',
      method: 'POST',
      data: {
        name: saveName,
        phone: savePhone
      },
      loading: true
    }).then(() => {
      this.hideAddPanel()
      this.loadPhones()
      this.speakText(`成功添加${saveName}的电话`)
      wx.showToast({ title: '已添加', icon: 'success' })
    }).catch(() => {
      const newPhone = {
        id: Date.now(),
        name: saveName,
        phone: savePhone
      }
      const phones = [newPhone].concat(this.data.phones || [])
      this.setData({ phones, phoneList: phones, showPanel: false })
      wx.setStorageSync('phones', phones)
      wx.setStorageSync('phoneList', phones)
      wx.setStorageSync('service_phones', phones)
      this.speakText(`成功添加${saveName}的电话`)
      wx.showToast({ title: '已添加', icon: 'success' })
    })
  },

  // ---------- 语音录制（参考找小享页面） ----------

  initRecorder() {
    if (!recorderManager) return

    recorderManager.onStop((res) => {
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }

      const field = this.data.recordingField
      this.setData({ recording: false, recordingSeconds: 0, recordingField: '' })

      const tempFilePath = res.tempFilePath
      if (!tempFilePath) {
        wx.showToast({ title: '录音文件获取失败', icon: 'none' })
        return
      }

      wx.showLoading({ title: '识别中…' })
      const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
      const token = wx.getStorageSync('token') || ''

      wx.uploadFile({
        url: baseUrl + '/assistant/voice-to-text',
        timeout: 70000,
        filePath: tempFilePath,
        name: 'file',
        header: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        success: (uploadRes) => {
          wx.hideLoading()
          try {
            const data = JSON.parse(uploadRes.data)
            if (data.ok && data.text) {
              const text = String(data.text).trim()
              // 根据录音字段填入对应输入框
              if (field === 'name') {
                // 姓名栏：过滤掉可能的数字/号码片段
                const cleanName = text
                  .replace(/[0-9零一二三四五六七八九幺拐洞]{7,}/g, '')
                  .replace(/电话|手机|号码|拨打|联系|方式|是|的|为|号|码/g, '')
                  .replace(/[，,。.！!？?、\s]+/g, ' ')
                  .trim()
                this.setData({ 'form.name': cleanName || text })
              } else if (field === 'phone') {
                // 号码栏：先转中文数字再提取
                const converted = this.chineseToDigits(text)
                const nums = converted.replace(/[^0-9]/g, '')
                this.setData({ 'form.phone': nums || text })
              } else {
                // 整体录音：尝试拆分姓名和号码
                this.parseVoiceText(text)
              }
            } else {
              wx.showToast({ title: data.message || data.hint || '没有听清楚，请再试一次', icon: 'none' })
            }
          } catch (e) {
            wx.showToast({ title: '识别结果解析失败', icon: 'none' })
          }
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '语音识别网络错误', icon: 'none' })
        }
      })
    })

    recorderManager.onError(() => {
      if (recordTimer) {
        clearInterval(recordTimer)
        recordTimer = null
      }
      this.setData({ recording: false, recordingSeconds: 0, recordingField: '' })
      wx.showToast({ title: '录音失败，请用文字输入', icon: 'none' })
    })
  },

  // 中文数字/口语 → 阿拉伯数字
  chineseToDigits(text) {
    const map = {
      '零': '0', '〇': '0', '零': '0',
      '一': '1', '壹': '1', '幺': '1', '呀': '1',
      '二': '2', '贰': '2', '两': '2',
      '三': '3', '叁': '3', '仨': '3',
      '四': '4', '肆': '4',
      '五': '5', '伍': '5',
      '六': '6', '陆': '6',
      '七': '7', '柒': '7', '拐': '7',
      '八': '8', '捌': '8',
      '九': '9', '玖': '9', '勾': '9',
      '十': '', '百': '', '千': '', '万': '',
      '洞': '0', '点': '', '号': '', '码': '',
      '是': '', '的': '', '为': '', '电话': '', '手机': '',
      '号码': '', '拨打': '', '联系': '', '方式': ''
    }
    let result = ''
    for (const ch of text) {
      if (ch >= '0' && ch <= '9') {
        result += ch
      } else if (map[ch] !== undefined) {
        result += map[ch]
      }
    }
    return result
  },

  // 从文本中提取电话号码（支持多种格式）
  extractPhone(text) {
    // 先尝试转换中文数字
    const converted = this.chineseToDigits(text)

    // 匹配手机号：1开头的11位数字
    const mobileMatch = converted.match(/1[3-9]\d{9}/)
    if (mobileMatch) return mobileMatch[0]

    // 匹配带区号的座机号：3-4位区号 + 7-8位号码
    const landlineMatch = converted.match(/0\d{2,3}[-\s]?\d{7,8}/)
    if (landlineMatch) return landlineMatch[0].replace(/[^\d]/g, '')

    // 匹配连续7-12位数字（宽松匹配）
    const looseMatch = converted.match(/\d{7,12}/)
    if (looseMatch) return looseMatch[0]

    return ''
  },

  // 解析整段语音：提取姓名和号码
  parseVoiceText(text) {
    // 1. 尝试提取电话号码
    const phone = this.extractPhone(text)

    if (phone) {
      // 2. 从原文中移除号码部分得到姓名
      // 先在原文中找号码对应的原始文本片段并移除
      let name = text

      // 尝试匹配原文中的数字串
      const digitsOnly = text.replace(/[^0-9]/g, '')
      if (digitsOnly.length >= 7 && phone.includes(digitsOnly.slice(0, 7))) {
        // 找到原文中数字的起止位置
        const firstDigit = text.search(/\d/)
        const lastDigit = text.search(/\d(?=\D*$)/)
        if (firstDigit >= 0) {
          const before = text.slice(0, firstDigit).trim()
          const after = text.slice(lastDigit >= 0 ? lastDigit + 1 : firstDigit + 1).trim()
          name = (before + ' ' + after).trim()
        }
      }

      // 清理姓名中的常见干扰词
      name = name
        .replace(/[，,。.！!？?、\s]+/g, ' ')
        .replace(/电话|手机|号码|拨打|联系|方式|是|的|为|号|码/g, '')
        .trim()

      this.setData({
        'form.name': name || '',
        'form.phone': phone || ''
      })
    } else {
      // 没匹配到号码，尝试智能拆分
      // 如"老王 13812345678"被语音识别成"老王一三八一二三四五六七八"
      const converted = this.chineseToDigits(text)
      const phoneFromCN = converted.match(/1[3-9]\d{9}/) || converted.match(/\d{7,12}/)

      if (phoneFromCN) {
        // 从原文中找到号码对应的中文部分并移除
        const phoneStr = phoneFromCN[0]
        // 尝试在原文定位数字区域
        let nameFromText = text
        const firstNumIdx = text.search(/[\d一二三四五六七八九零幺两叁肆伍陆柒捌玖拐勾洞]/)
        if (firstNumIdx >= 0) {
          // 找到最后一个数字字符位置
          const numChars = '0123456789一二三四五六七八九零幺两叁肆伍陆柒捌玖拐勾洞'
          let lastNumIdx = -1
          for (let i = text.length - 1; i >= firstNumIdx; i--) {
            if (numChars.includes(text[i])) {
              lastNumIdx = i
              break
            }
          }
          nameFromText = (text.slice(0, firstNumIdx) + ' ' + text.slice(Math.min(lastNumIdx + 1, text.length))).trim()
        }

        nameFromText = nameFromText
          .replace(/[，,。.！!？?、\s]+/g, ' ')
          .replace(/电话|手机|号码|拨打|联系|方式|是|的|为|号|码/g, '')
          .trim()

        this.setData({
          'form.name': nameFromText || '',
          'form.phone': phoneStr || ''
        })
      } else {
        // 实在找不到号码，全当名称
        const cleanName = text
          .replace(/电话|手机|号码|拨打|联系|方式|是|的|为|号|码/g, '')
          .replace(/[，,。.！!？?、\s]+/g, ' ')
          .trim()
        this.setData({ 'form.name': cleanName || text })
      }
    }
  },

  // 按住说话（整体识别：姓名+号码）
  startHoldSpeak() {
    this.initRecorder()
    if (!recorderManager) {
      wx.showToast({ title: '当前设备不支持语音', icon: 'none' })
      return
    }
    if (this.data.recording) return

    wx.vibrateShort({ type: 'medium' })

    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ recording: true, recordingSeconds: 0, recordingField: 'all' })
        recorderManager.start({
          duration: 30000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'aac'
        })
        const that = this
        recordTimer = setInterval(() => {
          const sec = that.data.recordingSeconds + 1
          that.setData({ recordingSeconds: sec })
          if (sec >= 28) {
            recorderManager.stop()
          }
        }, 1000)
      },
      fail: () => {
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在设置中允许麦克风权限后使用语音功能。',
          showCancel: false
        })
      }
    })
  },

  stopHoldSpeak() {
    if (!this.data.recording) return
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    recorderManager.stop()
  },

  // 单字段语音输入（名称或号码旁的🎤按钮）
  startVoiceInput(e) {
    this.initRecorder()
    if (!recorderManager) {
      wx.showToast({ title: '当前设备不支持语音', icon: 'none' })
      return
    }
    if (this.data.recording) return

    const field = e.currentTarget.dataset.field || 'name'

    wx.vibrateShort({ type: 'medium' })

    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ recording: true, recordingSeconds: 0, recordingField: field })
        recorderManager.start({
          duration: 15000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'aac'
        })
        const that = this
        recordTimer = setInterval(() => {
          const sec = that.data.recordingSeconds + 1
          that.setData({ recordingSeconds: sec })
          if (sec >= 14) {
            recorderManager.stop()
          }
        }, 1000)
      },
      fail: () => {
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在设置中允许麦克风权限后使用语音功能。',
          showCancel: false
        })
      }
    })
  },

  stopVoiceInput() {
    if (!this.data.recording) return
    if (recordTimer) {
      clearInterval(recordTimer)
      recordTimer = null
    }
    recorderManager.stop()
  },

  // ---------- 返回 ----------

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
  }
})

},
"utils/api.js": function(require,module,exports){
const LOCAL_API_BASE_URL = 'https://yixiangzhicai.com'
const RELEASE_API_BASE_URL = 'https://yixiangzhicai.com'
const DEFAULT_TIMEOUT = 20000
const AI_TIMEOUT = 70000

function getAppSafe() {
  try {
    return getApp()
  } catch (e) {
    return null
  }
}

function defaultBaseUrl() {
  try {
    const account = wx.getAccountInfoSync()
    const envVersion = account && account.miniProgram && account.miniProgram.envVersion
    return envVersion === 'release' ? RELEASE_API_BASE_URL : LOCAL_API_BASE_URL
  } catch (e) {
    return LOCAL_API_BASE_URL
  }
}

function isReleaseOrRealDevice() {
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
  return envVersion === 'release' || platform !== 'devtools'
}

function normalizeBaseUrl(value, options = {}) {
  const fallback = String(options.fallback || RELEASE_API_BASE_URL).replace(/\/+$/, '')
  const releaseLike = options.releaseLike === undefined ? isReleaseOrRealDevice() : !!options.releaseLike
  const raw = String(value || '').trim().replace(/\/+$/, '')
  const matched = raw.match(/^(https?):\/\/([^/?#]+)(\/[^?#]*)?$/i)
  if (!matched || matched[2].includes('@')) return fallback

  const protocol = matched[1].toLowerCase()
  const authority = matched[2].toLowerCase()
  const hostname = authority.replace(/^\[|\]$/g, '').split(':')[0]
  if (!hostname) return fallback

  // 真机和发布版只信任正式 HTTPS 域名，自动淘汰历史调试地址和错误缓存。
  if (releaseLike && (protocol !== 'https' || authority !== 'yixiangzhicai.com' || matched[3])) return fallback
  return raw
}

function baseUrl() {
  const stored = String(wx.getStorageSync('baseUrl') || '').trim()
  const app = getAppSafe()
  const configured = app && app.globalData && app.globalData.baseUrl
  return normalizeBaseUrl(stored || configured || defaultBaseUrl(), {
    fallback: defaultBaseUrl()
  })
}

function isAiRequest(url, method, data) {
  const path = String(url || '').split('?')[0]
  if (['/assistant/chat', '/assistant/multimodal-analyze', '/assistant/voice-to-text', '/assistant/text-to-voice'].includes(path)) return true
  return path === '/family/group-chat' && String(method || 'GET').toUpperCase() === 'POST' && /@小享/.test(String((data || {}).content || ''))
}

function request({ url, method = 'GET', data = {}, header = {}, loading = false, timeout = DEFAULT_TIMEOUT }) {
  if (loading) wx.showLoading({ title: '小享处理中', mask: true })
  const token = wx.getStorageSync('token') || ''
  const requestTimeout = isAiRequest(url, method, data) ? Math.max(Number(timeout) || 0, AI_TIMEOUT) : timeout
  const startedAt = Date.now()
  let statusCode = 0
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl() + url,
      method,
      data,
      timeout: requestTimeout,
      header: Object.assign({
        'content-type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      }, header),
      success(res) {
        statusCode = Number(res.statusCode || 0)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        reject({
          statusCode: res.statusCode,
          data: res.data,
          errMsg: `HTTP ${res.statusCode}`
        })
      },
      fail(err) {
        reject(err)
      },
      complete() {
        console.info(`[API] ${String(method).toUpperCase()} ${url} ${Date.now() - startedAt}ms statusCode=${statusCode || 'NETWORK_ERROR'}`)
        if (loading) wx.hideLoading()
      }
    })
  })
}

function queryProduct(productCode) {
  return request({
    url: '/products/query',
    method: 'POST',
    data: { product_code: productCode },
    loading: true
  })
}

function verifyProduct(code) {
  return request({
    url: '/products/verify',
    method: 'GET',
    data: { code }
  })
}

function searchProducts(params = {}) {
  return request({
    url: '/products/search',
    method: 'GET',
    data: params
  })
}

function getBankList() {
  return request({
    url: '/products/banks',
    method: 'GET'
  })
}

function getProductExamples() {
  return request({
    url: '/products/example',
    method: 'GET'
  })
}

module.exports = {
  request,
  baseUrl,
  normalizeBaseUrl,
  isAiRequest,
  AI_TIMEOUT,
  queryProduct,
  verifyProduct,
  searchProducts,
  getBankList,
  getProductExamples
}

},
"utils/auth.js": function(require,module,exports){
function currentUser() {
  return wx.getStorageSync('user') || null
}

function requireLogin() {
  const token = wx.getStorageSync('token')
  if (!token) {
    wx.redirectTo({ url: '/pages/login/login' })
    return false
  }
  return true
}

module.exports = { currentUser, requireLogin }

},
"utils/mapConfig.js": function(require,module,exports){
module.exports = {
  QQ_MAP_KEY: '',
  DEFAULT_CITY: '天津市',
  DEFAULT_LOCATION: {
    latitude: 39.0851,
    longitude: 117.1994,
    address: '天津市'
  }
}

},
"utils/permission.js": function(require,module,exports){
function can(permissions, key) {
  if (!permissions) return false
  if (Array.isArray(permissions)) return permissions.indexOf(key) >= 0
  return !!permissions[key]
}

module.exports = { can }

},
"utils/phone.js": function(require,module,exports){
function callPhone(phone) {
  const clean = String(phone || '').replace(/[^0-9+]/g, '')
  if (!clean) {
    wx.showToast({ title: '暂无电话', icon: 'none' })
    return
  }
  wx.makePhoneCall({
    phoneNumber: clean,
    fail: () => wx.showToast({ title: '无法拨打', icon: 'none' })
  })
}

module.exports = { callPhone }

},
"utils/role.js": function(require,module,exports){
function homeByRole(role) {
  return role === 'child' ? '/pages/child/index/index' : '/pages/index/index'
}

function goHomeByRole(role) {
  wx.redirectTo({ url: homeByRole(role || wx.getStorageSync('role') || 'elder') })
}

module.exports = { homeByRole, goHomeByRole }

},
"utils/termExplain.js": function(require,module,exports){
function explainTerm(term, nearbyText, scene) {
  const cleanTerm = normalizeTermInput(term)
  return getApp().request({
    url: '/term/explain',
    method: 'POST',
    data: { term: cleanTerm, nearby_text: nearbyText || '', scene: scene || 'miniapp', force_llm: false },
    loading: true
  })
}

const DOUBLE_TAP_MS = 420
const MAX_POPUPS = 6
const TERM_CANDIDATES = [
  // === 理财基础 ===
  '业绩比较基准', '七日年化', '年化收益率', '参考收益', '净值', '单位净值',
  '风险等级', '风险测评', 'R1', 'R2', 'R3', 'R4', 'R5', '流动性', '期限',
  '申购', '赎回', '买入', '卖出', '到期', '分红', '利息', '收益',
  '本金', '保本', '非保本', '大额存单', '储蓄国债', '国债', '货币基金',
  '债券基金', '银行理财', '养老理财', '存款保险', '登记编码', '官方渠道',
  '起购金额', '封闭期', '开放期', '提前支取', '管理费', '托管费',
  '申购费', '认购费', '赎回费', '销售服务费', '转换费', '手续费', '业绩报酬',
  '募集期', '锁定期', '到期日', '赎回到账', 'T+1', 'T+2',
  '持仓', '回撤', '波动', '备用金', '延时到账',
  '资产配置', '分散配置', '期限匹配', '资金安全', '养老钱', '医疗备用金',
  '理财资金', '生活备用金', '固定收益', '固收', '债券', '基金', '股票', '保险',
  '养老金', '个人养老金', '收益来源', '到账方式', '发行机构', '持牌机构',
  '银行柜台', '银行App', '银行客服', '金融网点', '风险偏好', '风险承受能力',
  '产品说明书', '理财说明书', '合格投资者', '代销机构', '理财子公司',
  '净值型理财', '现金管理', '转账', '陌生链接', '私人二维码', '验证码',
  '高收益诱导', '冒充客服', '非法集资', '虚假平台', '个人收款码', '内部消息',
  '稳赚不赔', '保证收益', '先交保证金', '刷单返利', '杀猪盘', '养老项目骗局',
  '收益率', '利率', '贷款', '还本付息', '自动续作', '赎回到账',
  '稳健型', '稳健', '银发群体', '老年用户', '适老化', '防诈骗',
  '反诈提醒', '医疗资金', '生活费', '结余', '日常收支', '理财收益',
  '生活支出', '理财持仓', '收支明细', '账本分析', '金融认知', '风险提示',
  '月收入', '月支出', '流动资金', '固定资金', '子女权限',
  '用钱时间', '期限搭配', '风险评估', '亲情协同', '家庭协同', '家庭金融周报',
  '家人消息', '绑定码', '协同账号', '健康状态', '身体情况', '高风险内容',
  '联系子女', '蔬菜生鲜', '水果生鲜', '安全优先',

  // === 银行与信贷 ===
  '存款', '贷款', '信用卡', '房贷', '车贷', '征信', '央行', '商业银行',
  '储蓄', '定期', '活期', '通知存款', '大额存款', '协定存款',
  'LPR', '基准利率', '浮动利率', '固定利率', '优惠利率',
  '首付', '按揭', '抵押', '质押', '担保', '授信', '放款',
  '逾期', '呆账', '坏账', '不良贷款', '拨备', '核销',
  '存款准备金', '逆回购', 'MLF', 'SLF', 'PSL', '公开市场操作',
  '银保监会', '央行', '人民银行', '商业银行', '政策性银行',

  // === 股市与证券 ===
  '股市', 'A股', '港股', '美股', '大盘', '牛市', '熊市', '涨停', '跌停',
  'IPO', '上市公司', '市值', '市盈率', '分红派息', '除权除息',
  '创业板', '科创板', '北交所', '新三板', '主板', '中小板',
  '权重股', '蓝筹股', '白马股', '成长股', '价值股', '周期股',
  '概念股', '题材股', '妖股', '次新股', 'ST股',
  'K线', '阳线', '阴线', '成交量', '换手率', '振幅',
  '支撑位', '压力位', '突破', '回调', '反弹', '反转',
  '解禁', '减持', '增持', '回购', '定增', '配股', '送股',
  '熔断', '做空', '做多', '杠杆', '保证金', '强平',
  'QFII', '北向资金', '南向资金', '主力资金', '游资',

  // === 基金与资管 ===
  'ETF', 'LOF', 'QDII', 'REITs', 'FOF', 'MOM',
  '指数基金', '主动基金', '被动基金', '量化基金', '对冲基金',
  '信托', '私募', '公募', '专户', '资管计划',
  '净值', '累计净值', '估算净值', '分红', '拆分',
  '申购费', '赎回费', '管理费', '托管费', '销售服务费',
  '权益类', '固收类', '混合类', '货币类', '另类投资',

  // === 债券与固收 ===
  '国债收益率', '地方债', '城投债', '企业债', '公司债', '可转债',
  '信用评级', '违约', '兑付', '到期收益率', '票面利率', '久期',
  '利率债', '信用债', '短融', '中票', '定向工具',

  // === 保险 ===
  '社保', '医保', '失业保险', '工伤保险', '生育保险',
  '养老保险', '商业保险', '重疾险', '医疗险', '意外险', '寿险',
  '年金险', '万能险', '投连险', '分红险',
  '投保', '续保', '理赔', '免赔额', '等待期', '犹豫期',
  '退保', '现金价值', '保额', '保费',

  // === 房地产 ===
  '房价', '楼市', '调控', '住房公积金', '限购', '限贷', '限售',
  '公租房', '廉租房', '保障房', '共有产权', '租购并举',
  '房价收入比', '空置率', '去库存', '棚改', '旧改',

  // === 宏观经济 ===
  'GDP', 'PMI', 'CPI', 'PPI', '宏观经济', '财政政策', '货币政策',
  '通胀', '通货膨胀', '通缩', '贬值', '增值', '加息', '降息', '降准',
  '赤字', '国债', '地方债', '城投债', '信用评级',
  '经济增速', '三驾马车', '内需', '外需', '进出口',
  '工业增加值', '社会消费品零售总额', '固定资产投资',
  '居民消费', '人均收入', '可支配收入', '恩格尔系数',
  '基尼系数', '贫富差距', '共同富裕', '乡村振兴',

  // === 国际金融 ===
  '汇率', '人民币', '美元', '欧元', '外汇', '外汇储备', '离岸人民币',
  '美联储', '欧央行', '加息周期', '缩表', '量化宽松', 'QE',
  '贸易顺差', '贸易逆差', '关税', '贸易战', '制裁',
  '金砖国家', '一带一路', 'RCEP', 'WTO', 'IMF',

  // === 数字经济 ===
  '数字经济', '金融科技', '移动支付', '数字货币', '区块链',
  '人工智能', '大数据', '云计算', '物联网', '5G',
  '互联网金融', 'P2P', '众筹', '第三方支付', '刷脸支付',

  // === 税收与财政 ===
  '印花税', '个人所得税', '增值税', '企业所得税', '起征点',
  '消费税', '房产税', '遗产税', '关税', '出口退税',
  '财政收入', '财政支出', '转移支付', '专项债', '特别国债',

  // === 监管与合规 ===
  '反洗钱', '证监会', '国务院', '发改委', '财政部',
  '银保监会', '央行', '国务院金融稳定发展委员会',
  '退市', '停牌', '问询函', '监管函', '立案调查', '处罚',
  '内幕交易', '操纵市场', '老鼠仓', '信披违规',

  // === 退休与养老 ===
  '退休金', '延迟退休', '养老金', '企业年金', '职业年金',
  '以房养老', '社区养老', '居家养老', '机构养老', '医养结合',

  // === 日常生活财经 ===
  '消费', '投资', '理财', '薪资', '年终奖', '加班费',
  '公积金', '五险一金', '个税起征点', '专项附加扣除',
  '油价', '电价', '水价', '气价', '菜价', '肉价',
  '最低工资', '平均工资', '灵活就业', '新就业形态',

  // === 公司财务 ===
  '营收', '净利润', '毛利润', '毛利率', '净利率', 'ROE', 'ROA',
  '现金流', '负债', '资产负债率', '应收账款', '存货',
  '分红', '股息率', '每股收益', '每股净资产',
  '并购', '重组', '剥离', '拆分上市', '借壳上市',

  // === 新兴领域 ===
  '碳中和', '碳达峰', '新能源', 'ESG', '绿色金融', '可持续投资',
  '元宇宙', 'Web3', 'NFT', 'DeFi', '智能合约',
]

function normalizeTermInput(term) {
  const raw = String(term || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const detected = extractTermsFromText(raw, 1)
  if (detected.length && (raw.length > detected[0].length || raw.length > 16 || /[，。；：,.!?！？]/.test(raw))) {
    return detected[0]
  }
  if (raw.length > 24) return raw.slice(0, 24)
  return raw
}

function getEventTerm(e, fallback) {
  return normalizeTermInput(
    fallback ||
    (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.term) ||
    ''
  )
}

function popupPosition(index) {
  const n = index % 6
  return {
    top: 220 + n * 100,
    left: (n % 2 === 0) ? 40 : 70
  }
}

function ensurePopupList(page) {
  if (!page) return []
  const list = (page.data && page.data.termExplainPopups) || []
  if (!page.data || !page.data.termExplainPopups) {
    page.setData({ termExplainPopups: list })
  }
  return list
}

function setPopupList(page, list) {
  if (!page || !page.setData) return
  page.setData({ termExplainPopups: list.slice(-MAX_POPUPS) })
}

function updatePopup(page, id, patch) {
  const list = ensurePopupList(page).map(item => {
    if (item.id === id) return { ...item, ...patch }
    return item
  })
  setPopupList(page, list)
}

function openTermPopup(page, term, nearbyText, scene) {
  if (!term) {
    wx.showToast({ title: '暂无可解释内容', icon: 'none' })
    return Promise.resolve(null)
  }

  const current = ensurePopupList(page)
  const pos = popupPosition(current.length)
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`
  const loadingItem = {
    id,
    term: normalizeTermInput(term),
    explanation: '小享正在解释这个词...',
    risk_tip: '',
    loading: true,
    top: pos.top,
    left: pos.left
  }

  setPopupList(page, current.concat(loadingItem))

  return explainTerm(loadingItem.term, nearbyText, scene).then(res => {
    updatePopup(page, id, {
      term: normalizeTermInput(res.term || loadingItem.term),
      explanation: res.explanation || `${loadingItem.term}需要结合风险、期限、收益来源和官方渠道理解。`,
      risk_tip: res.risk_tip || '不懂的词先问清楚，再操作。',
      loading: false
    })
    return res
  }).catch(() => {
    updatePopup(page, id, {
      explanation: `${loadingItem.term}要结合风险、期限、收益来源和官方渠道理解。`,
      risk_tip: '不要因为别人催促或承诺高收益就急着转账。',
      loading: false
    })
    return null
  })
}

function handleDoubleTap(page, e, options = {}) {
  const term = getEventTerm(e, options.term)
  const scene = options.scene || 'miniapp'
  const nearbyText = typeof options.nearbyText === 'function'
    ? options.nearbyText()
    : (options.nearbyText || '')

  if (!term) {
    wx.showToast({ title: '暂无可解释内容', icon: 'none' })
    return Promise.resolve(null)
  }

  return openTermPopup(page, term, nearbyText, scene)
}

function closeTermPopup(page, e) {
  const id = String(
    (e && e.detail && e.detail.id) ||
    (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) ||
    e ||
    ''
  )
  if (!id) return
  const list = ensurePopupList(page).filter(item => item.id !== id)
  setPopupList(page, list)
}

function extractTermsFromText(text, limit = 12) {
  const raw = String(text || '')
  if (!raw.trim()) return []
  const found = []
  TERM_CANDIDATES.forEach(term => {
    if (raw.includes(term) && !found.includes(term)) {
      found.push(term)
    }
  })
  const riskMatches = raw.match(/\bR[1-5]\b/g) || []
  riskMatches.forEach(term => {
    if (!found.includes(term)) found.push(term)
  })
  return found.slice(0, limit)
}

function buildTermSegments(text, limit = 24) {
  const raw = String(text || '')
  const terms = extractTermsFromText(raw, limit)
    .map(term => ({ term, index: raw.indexOf(term) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index || b.term.length - a.term.length)
  if (!terms.length) return [{ text: raw, term: '' }]
  const segments = []
  let cursor = 0
  terms.forEach(item => {
    if (item.index < cursor) return
    if (item.index > cursor) {
      segments.push({ text: raw.slice(cursor, item.index), term: '' })
    }
    segments.push({ text: item.term, term: item.term })
    cursor = item.index + item.term.length
  })
  if (cursor < raw.length) segments.push({ text: raw.slice(cursor), term: '' })
  return segments
}

function mergeTerms(base, extra, limit = 16) {
  const list = []
  ;[].concat(base || [], extra || []).forEach(term => {
    const clean = String(term || '').trim()
    if (clean && !list.includes(clean)) list.push(clean)
  })
  return list.slice(0, limit)
}

function showTermExplain(term, nearbyText, scene) {
  if (!term) {
    wx.showToast({ title: '暂无可解释内容', icon: 'none' })
    return Promise.resolve(null)
  }
  return explainTerm(term, nearbyText, scene).then(res => {
    wx.showModal({
      title: res.term || term,
      content: `${res.explanation || ''}\n\n提醒：${res.risk_tip || '不懂的词先问清楚，再操作。'}`,
      showCancel: false,
      confirmText: '知道了'
    })
    return res
  }).catch(() => {
    wx.showModal({
      title: term,
      content: `${term}要结合风险、期限、收益来源和官方渠道理解。提醒：不要因为别人催促或承诺高收益就急着转账。`,
      showCancel: false,
      confirmText: '知道了'
    })
    return null
  })
}

// 点击难词直接跳转AI助手页面一键询问
function goAskTerm(term) {
  const cleanTerm = normalizeTermInput(term)
  if (!cleanTerm) {
    wx.showToast({ title: '暂无可解释内容', icon: 'none' })
    return
  }
  const question = `请帮我解释一下「${cleanTerm}」是什么意思，和我的养老理财有什么关系？`
  wx.navigateTo({
    url: `/pages/assistant/assistant?question=${encodeURIComponent(question)}`
  })
}

module.exports = {
  explainTerm,
  showTermExplain,
  handleDoubleTap,
  openTermPopup,
  closeTermPopup,
  extractTermsFromText,
  buildTermSegments,
  mergeTerms,
  goAskTerm
}

},
"utils/upload.js": function(require,module,exports){
function uploadFile(url, filePath, name) {
  const app = getApp()
  const token = wx.getStorageSync('token') || ''
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: app.globalData.baseUrl + url,
      filePath,
      name: name || 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success(res) {
        try { resolve(JSON.parse(res.data)) } catch (e) { reject(e) }
      },
      fail: reject
    })
  })
}

module.exports = { uploadFile }

},
"utils/voice.js": function(require,module,exports){
// 语音工具集：录音、识别、TTS合成、播放
// 各页面可直接使用这些函数，也可配合 voice-input 组件使用

let recorderManager = null
let recordTimer = null

function getRecorder() {
  if (!recorderManager && wx.getRecorderManager) {
    recorderManager = wx.getRecorderManager()
  }
  return recorderManager
}

// ---- 录音基础 ----

function startRecord(options) {
  const r = getRecorder()
  if (!r) return false
  r.start(Object.assign({
    duration: 30000,
    sampleRate: 16000,
    numberOfChannels: 1,
    encodeBitRate: 48000,
    format: 'wav'
  }, options || {}))
  return true
}

function stopRecord() {
  const r = getRecorder()
  if (r) r.stop()
}

// ---- 语音识别（上传到后端 /assistant/voice-to-text） ----

function uploadVoice(filePath, dialect) {
  const app = getApp()
  const baseUrl = (app && app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
  const token = wx.getStorageSync('token') || ''
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: baseUrl + '/assistant/voice-to-text?format=wav' + (dialect ? '&dialect=1' : ''),
      timeout: 70000,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success(res) {
        try { resolve(JSON.parse(res.data)) } catch (e) { reject(e) }
      },
      fail: reject
    })
  })
}

function speechToText(filePath, dialect) {
  return uploadVoice(filePath, dialect)
}

// ---- TTS 语音合成 ----

function textToSpeech(text) {
  getApp().readText(text)
}

// ---- 音频播放 ----

function playAudio(url) {
  const audio = wx.createInnerAudioContext()
  audio.src = url
  audio.play()
  return audio
}

// ---- 按住说话完整流程（嵌入页面JS中使用） ----

/**
 * 在页面中初始化语音识别回调
 * 调用后将自动监听录音结束事件，上传并识别
 * onResult(text) - 识别成功回调
 * onError(msg)  - 识别失败回调
 */
function initPageVoice(page, callbacks) {
  const r = getRecorder()
  if (!r) return

  r.onStop((res) => {
    if (page._voiceTimer) {
      clearInterval(page._voiceTimer)
      page._voiceTimer = null
    }
    page.setData({ recording: false, recordingSeconds: 0 })

    const tempFilePath = res.tempFilePath
    if (!tempFilePath) {
      wx.showToast({ title: '录音文件获取失败', icon: 'none' })
      if (callbacks.onError) callbacks.onError('录音文件获取失败')
      return
    }

    wx.showLoading({ title: '识别中…' })
    uploadVoice(tempFilePath).then(data => {
      wx.hideLoading()
      if (data.ok && data.text) {
        if (callbacks.onResult) callbacks.onResult(data.text)
        else wx.showToast({ title: data.text, icon: 'none' })
      } else {
        const hint = data.hint || data.message || '没有听清楚，请再试一次'
        wx.showToast({ title: hint, icon: 'none' })
        if (callbacks.onEmpty) callbacks.onEmpty(hint)
      }
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '语音识别网络错误', icon: 'none' })
      if (callbacks.onError) callbacks.onError('网络错误')
    })
  })

  r.onError(() => {
    if (page._voiceTimer) {
      clearInterval(page._voiceTimer)
      page._voiceTimer = null
    }
    page.setData({ recording: false, recordingSeconds: 0 })
    wx.showToast({ title: '录音失败，请用文字输入', icon: 'none' })
    if (callbacks.onError) callbacks.onError('录音失败')
  })
}

/**
 * 开始按住说话（需先调用 initPageVoice）
 * page 需有 data.recording 和 data.recordingSeconds
 */
function startHoldSpeak(page, maxDuration = 30000) {
  const r = getRecorder()
  if (!r) {
    wx.showToast({ title: '当前设备不支持语音', icon: 'none' })
    return
  }

  wx.vibrateShort({ type: 'medium' })
  wx.authorize({
    scope: 'scope.record',
    success: () => {
      page.setData({ recording: true, recordingSeconds: 0 })
      r.start({
        duration: maxDuration,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'wav'
      })
      const autoStopSec = Math.floor(maxDuration / 1000) - 2
      page._voiceTimer = setInterval(() => {
        const sec = (page.data.recordingSeconds || 0) + 1
        page.setData({ recordingSeconds: sec })
        if (sec >= autoStopSec) {
          stopRecord()
        }
      }, 1000)
    },
    fail: () => {
      wx.showModal({
        title: '需要麦克风权限',
        content: '请在设置中允许麦克风权限使用语音功能。',
        showCancel: false
      })
    }
  })
}

/**
 * 松手停止录音
 */
function stopHoldSpeak(page) {
  if (!page.data.recording) return
  if (page._voiceTimer) {
    clearInterval(page._voiceTimer)
    page._voiceTimer = null
  }
  stopRecord()
}

module.exports = {
  getRecorder,
  startRecord,
  stopRecord,
  uploadVoice,
  speechToText,
  textToSpeech,
  playAudio,
  initPageVoice,
  startHoldSpeak,
  stopHoldSpeak
}

}
};
