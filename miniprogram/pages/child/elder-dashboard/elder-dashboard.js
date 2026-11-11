const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', elderId: '', overview: { profile_summary: {}, asset_summary: {}, risk_summary: {}, permissions: {} }, showCareModal: false, careType: 'health' },
  back: childCommon.back,
  onLoad(options) { childCommon.syncGlobalFont(this);  this.setData({ elderId: options.elder_id || '' }); this.load() },
  load() { getApp().request({ url: '/child/elders/' + this.data.elderId + '/overview' }).then(res => this.setData({ overview: res })) },
  allow(key) {
    if ((this.data.overview.permissions || {})[key]) return true
    wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    return false
  },
  goAlerts() { if (this.allow('receive_alerts')) wx.navigateTo({ url: '/pages/child/alerts/alerts?elder_id=' + this.data.elderId }) },
  goWeekly() {
    const permissions = this.data.overview.permissions || {}
    if (!permissions.view_ledger_summary && !permissions.view_positions) return this.allow('view_ledger_summary')
    wx.navigateTo({ url: '/pages/child/weekly/weekly?elder_id=' + this.data.elderId })
  },
  goLedger() { if (this.allow('view_ledger_summary')) wx.navigateTo({ url: '/pages/child/ledger/ledger?elder_id=' + this.data.elderId }) },
  goPositions() { if (this.allow('view_positions')) wx.navigateTo({ url: '/pages/child/positions/positions?elder_id=' + this.data.elderId }) },
  goHealth() { if (this.allow('view_health')) this.setData({ showCareModal: true, careType: 'health' }) },
  goLocation() { if (this.allow('view_location')) this.setData({ showCareModal: true, careType: 'location' }) },
  closeCareModal() { this.setData({ showCareModal: false }) }
})

