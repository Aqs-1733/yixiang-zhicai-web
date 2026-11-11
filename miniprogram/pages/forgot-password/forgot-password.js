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
