const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', items: [] },
  back: childCommon.back,
  onShow() { childCommon.syncGlobalFont(this);  this.load() },
  permissionText(perms) {
    return Object.keys(perms || {}).filter(k => perms[k]).join('、') || '暂无'
  },
  load() { getApp().request({ url: '/child/elders' }).then(res => this.setData({ items: res.items || [] })) },
  open(e) { wx.navigateTo({ url: '/pages/child/elder-dashboard/elder-dashboard?elder_id=' + e.currentTarget.dataset.id }) },
  bind() { wx.navigateTo({ url: '/pages/child/bind/bind' }) }
})

