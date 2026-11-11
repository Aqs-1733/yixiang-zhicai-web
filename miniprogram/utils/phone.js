function callPhone(phone) {
  const clean = String(phone || '').replace(/[^0-9+]/g, '')
  if (!clean) {
    wx.showToast({ title: '暂无电话', icon: 'none' })
    return
  }
  wx.makePhoneCall({
    phoneNumber: clean,
    fail: () => wx.showToast({ title: '无法拨打', icon: 'none' })
  })
}

module.exports = { callPhone }
