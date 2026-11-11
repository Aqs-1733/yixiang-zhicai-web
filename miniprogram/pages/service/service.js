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
