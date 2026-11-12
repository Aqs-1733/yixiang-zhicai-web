const termHelper = require('../../utils/termExplain.js')

function formatTime(value) {
  const raw = String(value || '')
  if (!raw) return ''
  return raw.replace('T', ' ').slice(0, 16)
}

function formatVoiceDuration(seconds) {
  const s = Math.round(Number(seconds) || 0)
  if(s<=0)return ''
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
    showHistory: true,
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
    return getApp().request({ url: `/family/messages?peer_id=${encodeURIComponent(this.data.selectedPeerId)}`,loading:false }).then(res => {
      const user = wx.getStorageSync('user') || {}
      const messages = (res.items || []).reverse().map(item => ({
        ...item,
        timeText: formatTime(item.created_at),
        isMine: String(item.sender_id || item.from_user_id) === String(user.id),
        fromName: item.sender_name || item.from_name || '家人',
        segments: termHelper.buildTermSegments(item.content || ''),
        isVoice: item.message_type === 'voice',
        voiceFullUrl: resolveVoiceUrl(item.voice_url || (item.message_type==='voice'?item.content:'')),
        voiceDurationText: formatVoiceDuration(item.voice_duration),
      }))
      const signature=JSON.stringify(messages)
      if(signature!==this._messageSignature){this._messageSignature=signature;this.setData({ messages })}
      this._messageDenied=false
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      if(denied){this._messageSignature=null;this.setData({messages:[],emptyText:'长辈暂未开放该权限'});if(!this._messageDenied)wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' });this._messageDenied=true}
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
      success: (res) => {
        if(res.statusCode<200||res.statusCode>=300){wx.showToast({title:'语音未发送，请确认家庭授权后重试',icon:'none'});return}
        wx.showToast({ title: '语音已发送', icon: 'success' })
        this.loadMessages()

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
