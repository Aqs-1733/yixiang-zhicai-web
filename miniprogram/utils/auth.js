function currentUser() {
  return wx.getStorageSync('user') || null
}

function requireLogin() {
  const token = wx.getStorageSync('token')
  if (!token) {
    wx.redirectTo({ url: '/pages/login/login' })
    return false
  }
  return true
}

module.exports = { currentUser, requireLogin }
