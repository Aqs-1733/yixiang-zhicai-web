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
