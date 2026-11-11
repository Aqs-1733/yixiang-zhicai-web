const DEFAULT_AVATAR = '/assets/ui/default_avatar.png'

function avatarUrl(value) {
  const avatar = String(value || '')
  if (!avatar) return DEFAULT_AVATAR
  if (/^https?:\/\//.test(avatar) || avatar.startsWith('/assets/')) return avatar
  if (avatar.startsWith('/media/')) return getApp().globalData.baseUrl.replace(/\/$/, '') + avatar
  return avatar
}

function goHome(role) {
  wx.redirectTo({ url: role === 'child' ? '/pages/child/index/index' : '/pages/index/index' })
}

function friendlyLoginError(err, fallback) {
  const detail = String(err && err.data && err.data.detail || '')
  if (/APPID|SECRET|未配置|code2session|openid|接口|后端/i.test(detail)) return fallback
  if (/手机号|密码|身份|注册|绑定|微信免密|7天|七天/.test(detail)) return detail
  return fallback
}

function isWechatBindIssue(err) {
  const detail = String(err && err.data && err.data.detail || err && err.errMsg || '')
  return /微信.*绑定|绑定.*微信|绑定未完成|openid|code2session/i.test(detail)
}

Page({
  data: {
    phone: '',
    password: '',
    role: 'elder',
    rememberWeek: false,
    showLoginSuccess: false,
    successUser: null,
    questionnaireRequired: false,
    globalFontPageClass: 'font-global-normal'
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    this.setData({
      phone: options.phone ? decodeURIComponent(options.phone) : '',
      role: options.role === 'child' ? 'child' : 'elder'
    })
    this.tryRememberedLogin()
  },

  onShow() { this.syncGlobalFont() },

  syncGlobalFont() {
    const app = getApp()
    if (app.getGlobalFontSetting) this.setData({ globalFontPageClass: app.getGlobalFontSetting().pageClass })
  },

  onInput(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }) },
  chooseRole(e) { this.setData({ role: e.currentTarget.dataset.role === 'child' ? 'child' : 'elder' }) },
  onRememberChange(e) { this.setData({ rememberWeek: !!e.detail.value }) },

  goRegister() {
    wx.navigateTo({ url: '/pages/register/register?role=' + this.data.role })
  },

  goForgotPassword() {
    wx.navigateTo({ url: '/pages/forgot-password/forgot-password?phone=' + encodeURIComponent(this.data.phone || '') })
  },

  saveLogin(res, rememberWeek) {
    const app = getApp()
    const profile = Object.assign({}, res.profile || {})
    const resolvedAvatar = avatarUrl(profile.avatar || (res.user || {}).avatar || '')
    profile.avatar = resolvedAvatar
    const user = Object.assign({}, res.user || {}, { avatar: resolvedAvatar })
    wx.setStorageSync('token', res.token)
    wx.setStorageSync('user', user)
    wx.setStorageSync('profile', profile)
    wx.setStorageSync('role', user.role || 'elder')
    wx.setStorageSync('rememberLoginUntil', rememberWeek ? Date.now() + 7 * 24 * 60 * 60 * 1000 : 0)
    if (res.wechat && res.wechat.password_free_until) {
      wx.setStorageSync('wechatPasswordFreeUntil', res.wechat.password_free_until)
    }
    app.globalData.token = res.token
    app.globalData.user = user
    app.globalData.profile = profile
    app.globalData.role = user.role || 'elder'
    return { user, profile }
  },

  showSuccess(res, rememberWeek) {
    const saved = this.saveLogin(res, rememberWeek)
    this.setData({
      showLoginSuccess: true,
      successUser: Object.assign({}, saved.user, {
        avatarDisplay: avatarUrl(saved.user.avatar),
        roleLabel: saved.user.role === 'child' ? '子女端' : '长辈端'
      }),
      questionnaireRequired: !!res.questionnaire_required
    })
  },

  continueAfterSuccess() {
    const user = this.data.successUser || {}
    this.setData({ showLoginSuccess: false })
    if (this.data.questionnaireRequired) {
      wx.redirectTo({ url: '/pages/questionnaire/questionnaire?onboarding=1' })
      return
    }
    goHome(user.role || 'elder')
  },

  tryRememberedLogin() {
    const token = wx.getStorageSync('token') || ''
    const until = Number(wx.getStorageSync('rememberLoginUntil') || 0)
    if (!token || until <= Date.now()) return
    getApp().request({ url: '/auth/me' }).then(res => {
      const role = (res.user || {}).role || 'elder'
      wx.setStorageSync('user', res.user || {})
      wx.setStorageSync('profile', res.profile || {})
      wx.setStorageSync('role', role)
      getApp().globalData.user = res.user || null
      getApp().globalData.profile = res.profile || null
      getApp().globalData.role = role
      if (res.questionnaire_required) wx.redirectTo({ url: '/pages/questionnaire/questionnaire?onboarding=1' })
      else goHome(role)
    }).catch(() => {
      wx.removeStorageSync('token')
      wx.removeStorageSync('rememberLoginUntil')
    })
  },

  getWechatCode() {
    return new Promise(resolve => {
      wx.login({
        success: res => resolve(String(res.code || '')),
        fail: () => resolve('')
      })
    })
  },

  async login() {
    if (!this.data.phone || !this.data.password) return wx.showToast({ title: '请输入手机号和密码', icon: 'none' })
      getApp().request({
      url: '/auth/password-login',
      method: 'POST',
      data: { phone: this.data.phone, password: this.data.password, role: this.data.role },
      loading: true
    }).then(res => {
      this.showSuccess(res, this.data.rememberWeek)
    }).catch(err => {
      if (isWechatBindIssue(err)) return
      wx.showModal({ title: '登录失败', content: friendlyLoginError(err, '请检查网络、手机号和密码后再试。'), showCancel: false })
    })
  },

  wechatLogin() {
    const app = getApp()
    wx.showLoading({ title: '微信登录中', mask: true })
    wx.login({
      success: loginRes => {
        if (!loginRes.code) {
          wx.hideLoading()
          return wx.showModal({ title: '微信登录失败', content: '没有取得微信登录凭证，请稍后重试。', showCancel: false })
        }
        app.request({
          url: '/auth/wechat-login',
          method: 'POST',
          data: {
            code: loginRes.code,
            role: this.data.role,
            phone: this.data.phone || '',
            password: this.data.password || ''
          }
        }).then(res => this.showSuccess(res, this.data.rememberWeek)).catch(err => {
          if (isWechatBindIssue(err)) return
          wx.showModal({
            title: '微信登录失败',
            content: friendlyLoginError(err, '请先完成手机号注册；首次绑定微信时需要同时输入手机号和密码。'),
            confirmText: '知道了',
            showCancel: false
          })
        }).finally(() => wx.hideLoading())
      },
      fail: () => {
        wx.hideLoading()
        wx.showModal({ title: '微信登录失败', content: '请检查微信账号和网络后重试。', showCancel: false })
      }
    })
  }
})
