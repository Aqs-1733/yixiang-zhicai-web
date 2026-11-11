function back() {
  const pages = getCurrentPages ? getCurrentPages() : []

  if (pages.length > 1) {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.redirectTo({ url: '/pages/child/index/index' })
    })
    return
  }

  wx.redirectTo({ url: '/pages/child/index/index' })
}

function syncGlobalFont(page) {
  const app = getApp()
  if (app && app.getGlobalFontSetting && page && page.setData) {
    const font = app.getGlobalFontSetting()
    page.setData({
      fontSizeMode: font.mode,
      globalFontPageClass: font.pageClass
    })
  }
}

function logout() {
  wx.showModal({
    title: '退出登录',
    content: '退出后需要重新登录，长辈和子女账号都可以用手机号或微信登录。',
    confirmText: '退出',
    success: (res) => {
      if (!res.confirm) return

      const app = getApp()
      const keys = [
        'token',
        'user',
        'role',
        'profile',
        'userProfile',
        'user_profile',
        'me',
        'nickname',
        'avatar',
        'risk_answers'
      ]

      keys.forEach(key => wx.removeStorageSync(key))

      if (app.globalData) {
        app.globalData.token = ''
        app.globalData.user = null
        app.globalData.profile = null
        app.globalData.role = 'elder'
      }

      wx.reLaunch({ url: '/pages/login/login?role=child' })
    }
  })
}

module.exports = {
  back,
  logout,
  syncGlobalFont
}
