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
