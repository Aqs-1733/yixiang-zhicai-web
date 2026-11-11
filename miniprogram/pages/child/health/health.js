const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', loading: true, permissionDenied: false, summary: null },
  back: childCommon.back,
  onLoad(options = {}) { this.setData({ elderId: options.elder_id || '' }); childCommon.syncGlobalFont(this); this.load() },
  onShow() { childCommon.syncGlobalFont(this) },
  load() {
    getApp().request({ url: `/child/elders/${this.data.elderId}/health-reminders`, loading: false }).then(res => {
      const formatTime = value => String(value || '').replace('T', ' ').slice(0, 16)
      const decorate = list => (list || []).map(item => ({ ...item, timeText: formatTime(item.created_at) }))
      this.setData({
        summary: Object.assign({ meds: [], meals: [], exercises: [] }, res || {}, {
          meals: decorate(res.meals),
          exercises: decorate(res.exercises)
        }),
        permissionDenied: false,
        loading: false
      })
    }).catch(err => {
      const denied = Number(err && err.statusCode) === 403 || /未开放/.test(String(err && err.data && err.data.detail || ''))
      this.setData({ summary: null, permissionDenied: denied, loading: false })
      if (denied) wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    })
  }
})
