const labels = {
  view_positions: '理财记录',
  view_ledger_summary: '日常收支记录',
  receive_alerts: '风险提示',
  view_messages: '留言',
  view_group_chat: '群聊',
  view_health: '健康',
  view_location: '位置'
}
const keys = Object.keys(labels)
const childCommon = require('../common.js')

Page({
  data: { globalFontPageClass: 'font-global-normal', items: [], permissionKeys: keys },
  back: childCommon.back,
  onShow() { childCommon.syncGlobalFont(this);  this.load() },
  load() {
    getApp().request({ url: '/child/elders' }).then(res => {
      const items = (res.items || []).map(item => ({
        ...item,
        permissionRows: keys.map(k => ({ key: k, label: labels[k], enabled: !!(item.permissions && item.permissions[k]) }))
      }))
      this.setData({ items })
    })
  }
})

