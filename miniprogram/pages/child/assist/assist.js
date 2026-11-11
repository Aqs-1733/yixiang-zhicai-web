const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', text: '', message: '' },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }) },
  onInput(e) { this.setData({ text: e.detail.value }) },
  generate() {
    if (!this.data.elderId) return wx.showToast({ title: '请先绑定长辈', icon: 'none' })
    getApp().request({
      url: '/child/elders/' + this.data.elderId + '/explain-to-elder',
      method: 'POST',
      data: { text: this.data.text },
      loading: true
    }).then(res => this.setData({ message: res.message || '' })).catch(err => {
      wx.showModal({ title: '暂不能生成', content: (err.data && err.data.detail) || '长辈尚未授权辅助解释', showCancel: false })
    })
  },
  read() { getApp().readText(this.data.message) }
})

