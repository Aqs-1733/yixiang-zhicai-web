const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', report: null, message: '正在读取金融周报' },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }); this.load() },
  load() {
    getApp().request({ url: '/child/elders/' + this.data.elderId + '/weekly-report' }).then(res => {
      this.setData({
        report: res.report || null,
        message: res.message || (res.report ? '' : '暂无金融周报数据')
      })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403
      this.setData({ report: null, message: denied ? '长辈暂未开放该权限' : '暂无金融周报数据' })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})

