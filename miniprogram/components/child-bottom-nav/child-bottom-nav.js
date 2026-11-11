Component({
  properties: {
    active: { type: String, value: '' }
  },
  data: { unread: 0, globalFontPageClass: 'font-global-normal' },
  lifetimes: {
    attached() {
      const app = getApp()
      const cached = Number(wx.getStorageSync('familyGroupUnread') || 0)
      const font = app.getGlobalFontSetting ? app.getGlobalFontSetting() : { pageClass: 'font-global-normal' }
      this.setData({ unread: cached, globalFontPageClass: font.pageClass })
      if (app.checkFamilyGroupUnread) {
        app.checkFamilyGroupUnread(false).then(unread => this.setData({ unread }))
      }
    }
  },
  methods: {
    goHome() { wx.redirectTo({ url: '/pages/child/index/index' }) },
    goAssistant() { wx.redirectTo({ url: '/pages/assistant/assistant' }) },
    goFamily() { wx.redirectTo({ url: '/pages/family/family' }) },
    goProfile() { wx.redirectTo({ url: '/pages/child/profile/profile' }) }
  }
})
