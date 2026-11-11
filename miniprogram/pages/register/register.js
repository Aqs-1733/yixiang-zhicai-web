const DEFAULT_AVATAR = '/assets/ui/default_avatar.png'

Page({
  data: {
    phone: '',
    password: '',
    nickname: '',
    avatar: DEFAULT_AVATAR,
    role: 'elder',
    bind_code: '',
    setSecurityQuestion: false,
    submitting: false,
    globalFontPageClass: 'font-global-normal'
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    if (options.role) this.setData({ role: options.role === 'child' ? 'child' : 'elder' })
  },

  onShow() { this.syncGlobalFont() },

  syncGlobalFont() {
    const app = getApp()
    if (!app.getGlobalFontSetting) return
    this.setData({ globalFontPageClass: app.getGlobalFontSetting().pageClass })
  },

  back() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/login/login' }) })
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.k]: e.detail.value })
  },

  onChooseAvatar(e) {
    if (e.detail && e.detail.avatarUrl) this.setData({ avatar: e.detail.avatarUrl })
  },

  onSecuritySwitch(e) {
    this.setData({ setSecurityQuestion: !!e.detail.value })
  },

  chooseRole(e) {
    const role = e.currentTarget.dataset.role === 'child' ? 'child' : 'elder'
    this.setData({ role, bind_code: role === 'elder' ? '' : this.data.bind_code })
  },

  validate() {
    const phone = String(this.data.phone || '').trim()
    const password = String(this.data.password || '')
    const nickname = String(this.data.nickname || '').trim()
    const bindCode = String(this.data.bind_code || '').trim()
    if (!nickname) return wx.showToast({ title: '请先设置昵称', icon: 'none' }), false
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' }), false
    if (password.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' }), false
    if (this.data.role === 'child' && !/^\d{6}$/.test(bindCode)) {
      wx.showToast({ title: '子女端必须输入6位家庭绑定码', icon: 'none' })
      return false
    }
    return true
  },

  uploadAvatar(filePath, token) {
    if (!filePath || filePath === DEFAULT_AVATAR || filePath.startsWith('/assets/')) return Promise.resolve(null)
    const baseUrl = getApp().globalData.baseUrl
    return new Promise(resolve => {
      wx.uploadFile({
        url: baseUrl + '/user/avatar/upload',
        filePath,
        name: 'file',
        header: { Authorization: `Bearer ${token}` },
        success: res => {
          try { resolve(JSON.parse(res.data || '{}')) } catch (e) { resolve(null) }
        },
        fail: () => resolve(null)
      })
    })
  },

  bindWechatAfterRegistration(phone, password, role) {
    return new Promise(resolve => {
      wx.login({
        success: loginRes => {
          if (!loginRes.code) return resolve(false)
          getApp().request({
            url: '/auth/wechat-login',
            method: 'POST',
            data: { code: loginRes.code, phone, password, role },
            loading: false
          }).then(() => resolve(true)).catch(() => resolve(false))
        },
        fail: () => resolve(false)
      })
    })
  },

  clearTemporaryLogin() {
    wx.removeStorageSync('token')
    wx.removeStorageSync('rememberLoginUntil')
    getApp().globalData.token = ''
  },

  finishRegistration(phone, role) {
    this.clearTemporaryLogin()
    wx.redirectTo({
      url: `/pages/login/login?phone=${encodeURIComponent(phone)}&role=${role}&registered=1`
    })
  },

  register() {
    if (this.data.submitting || !this.validate()) return
    const phone = String(this.data.phone || '').trim()
    const role = this.data.role === 'child' ? 'child' : 'elder'
    this.setData({ submitting: true })
    getApp().request({
      url: '/auth/register',
      method: 'POST',
      data: {
        phone,
        password: this.data.password,
        nickname: String(this.data.nickname || '').trim(),
        avatar: '',
        role,
        bind_code: role === 'child' ? String(this.data.bind_code || '').trim() : ''
      },
      loading: true
    }).then(async res => {
      wx.setStorageSync('token', res.token)
      wx.setStorageSync('user', res.user)
      wx.setStorageSync('profile', res.profile || {})
      wx.setStorageSync('role', role)
      getApp().globalData.token = res.token
      const avatarResult = await this.uploadAvatar(this.data.avatar, res.token)
      if (avatarResult && avatarResult.avatar) {
        const profile = avatarResult.profile || res.profile || {}
        const user = Object.assign({}, res.user, { avatar: avatarResult.avatar })
        wx.setStorageSync('profile', profile)
        wx.setStorageSync('user', user)
      }
      const isWeb = typeof window !== 'undefined'
      const wechatBound = isWeb ? false : await this.bindWechatAfterRegistration(phone, this.data.password, role)
      wx.showModal({
        title: '注册成功',
        content: this.data.setSecurityQuestion
          ? '接下来设置一个密保问题，忘记密码时可以用它找回。'
          : (isWeb ? '请使用手机号和密码登录。' : (wechatBound ? '微信已绑定。请返回登录页，可使用手机号或微信登录。' : '请返回登录页使用手机号密码登录；微信绑定可在登录时继续完成。')),
        showCancel: false,
        confirmText: this.data.setSecurityQuestion ? '设置密保' : '去登录',
        success: () => {
          if (this.data.setSecurityQuestion) {
            wx.redirectTo({
              url: `/pages/security-question/security-question?registration=1&phone=${encodeURIComponent(phone)}&role=${role}`
            })
          } else {
            this.finishRegistration(phone, role)
          }
        }
      })
    }).catch(err => {
      const detail = String(err && err.data && err.data.detail || '')
      const message = /已注册|手机号|密码|绑定码|昵称|身份/.test(detail)
        ? detail
        : '暂时没有注册成功，请检查网络和填写内容后再试。'
      wx.showModal({
        title: '注册失败',
        content: message,
        showCancel: false
      })
    }).finally(() => this.setData({ submitting: false }))
  }
})
