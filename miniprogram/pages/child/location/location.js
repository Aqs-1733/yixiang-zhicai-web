const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', loading: true, permissionDenied: false, location: null },
  back: childCommon.back,
  onLoad(options = {}) { this.setData({ elderId: options.elder_id || '' }); childCommon.syncGlobalFont(this); this.load() },
  onShow() { childCommon.syncGlobalFont(this) },
  load() {
    getApp().request({ url: `/child/elders/${this.data.elderId}/location`, loading: false }).then(res => {
      const location = res.location || null
      if (location) location.timeText = String(location.updated_at || '').replace('T', ' ').slice(0, 16)
      this.setData({ location, permissionDenied: false, loading: false })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      this.setData({ location: null, permissionDenied: denied, loading: false })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})
