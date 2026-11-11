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
