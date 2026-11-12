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
    const greeting = isChild
      ? `您好${nickname !== '您' ? '，' + nickname : ''}。我是小享。可以直接提问，也可以发语音或图片；家人授权后的账本和健康信息，也能在这里查看。`
      : `您好${nickname !== '您' ? '，' + nickname : ''}。我是小享。可以直接提问，也可以发语音或图片；记账、查路线、看理财信息都可以。`

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
