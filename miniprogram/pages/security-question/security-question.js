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
