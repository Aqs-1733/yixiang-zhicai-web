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

