const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', items: [], permissionDenied: false },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }); this.load() },
  load() {
    getApp().request({ url: '/child/elders/' + this.data.elderId + '/alerts' }).then(res => {
      this.setData({ items: res.items || [], permissionDenied: false })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403
      this.setData({ items: [], permissionDenied: denied })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})

