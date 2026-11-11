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
