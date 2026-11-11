const childCommon = require('../common.js')

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    nickname: '',
    avatar: '/assets/ui/default_avatar.png',
    phone: '',
    familyMembers: []
  },
  onShow() {
    childCommon.syncGlobalFont(this)
    const user = wx.getStorageSync('user') || {}
    const profile = wx.getStorageSync('profile') || {}
    const resolve = value => getApp().resolveMediaUrl ? getApp().resolveMediaUrl(value) : value
    this.setData({
      nickname: user.nickname || profile.nickname || '',
      avatar: resolve(user.avatar || profile.avatar) || '/assets/ui/default_avatar.png',
      phone: user.phone || ''
    })
    getApp().request({ url: '/family/members', loading: false }).then(res => this.setData({ familyMembers: res.items || [] })).catch(() => {})
  },
  goBack() { wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/child/index/index' }) }) },
  onNicknameInput(e) { this.setData({ nickname: e.detail.value }) },
  onChooseAvatar(e) {
    const filePath = e.detail && e.detail.avatarUrl
    if (!filePath) return
    const app = getApp()
    wx.uploadFile({
      url: app.globalData.baseUrl + '/user/avatar/upload',
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${wx.getStorageSync('token') || ''}` },
      success: res => {
        try {
          const data = JSON.parse(res.data || '{}')
          if (data.avatar) this.setData({ avatar: app.resolveMediaUrl ? app.resolveMediaUrl(data.avatar) : data.avatar })
        } catch (err) { wx.showToast({ title: '头像上传失败', icon: 'none' }) }
      },
      fail: () => wx.showToast({ title: '头像上传失败', icon: 'none' })
    })
  },
  saveProfile() {
    const nickname = String(this.data.nickname || '').trim()
    if (!nickname) return wx.showToast({ title: '昵称不能为空', icon: 'none' })
    getApp().request({
      url: '/user/profile/update',
      method: 'POST',
      data: { nickname, avatar: this.data.avatar, avatarUrl: this.data.avatar },
      loading: true
    }).then(res => {
      const oldUser = wx.getStorageSync('user') || {}
      wx.setStorageSync('user', Object.assign({}, oldUser, { nickname, avatar: this.data.avatar }))
      wx.setStorageSync('profile', Object.assign({}, wx.getStorageSync('profile') || {}, res.profile || {}, { nickname, avatar: this.data.avatar }))
      wx.showToast({ title: '资料已保存', icon: 'success' })
    })
  },
  goBind() { wx.navigateTo({ url: '/pages/child/bind/bind' }) },
  goChildHome() { wx.redirectTo({ url: '/pages/child/index/index' }) },
  goAssistant() { wx.redirectTo({ url: '/pages/assistant/assistant' }) },
  goFamily() { wx.redirectTo({ url: '/pages/family/family' }) },
  logout: childCommon.logout
})
