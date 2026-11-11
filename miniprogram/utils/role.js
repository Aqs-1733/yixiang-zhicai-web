function homeByRole(role) {
  return role === 'child' ? '/pages/child/index/index' : '/pages/index/index'
}

function goHomeByRole(role) {
  wx.redirectTo({ url: homeByRole(role || wx.getStorageSync('role') || 'elder') })
}

module.exports = { homeByRole, goHomeByRole }
