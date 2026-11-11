const childCommon = require('../common.js')

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    dashboard: { bound_elders: [] },
    elders: [],
    weeklyReports: [],
    healthSummaries: [],
    latestMessages: [],
    elderCount: 0,
    alertCount: 0,
    messageCount: 0,
    accountName: '子女协同端',
    avatar: '/assets/ui/default_avatar.png',
    editNickname: '',
    weatherCard: { city: '当前区域', weather: '--', temperature: '--', suggestion: '' },
    newsItems: [],
    groupUnreadCount: 0,
    showMessageModal: false,
    messagePeerId: 0,
    showCareModal: false,
    careType: 'health',
    careElderId: 0
  },
  onShow() {
    childCommon.syncGlobalFont(this)
    this.loadChildHomeInfo()
    this.load()
    getApp().checkFamilyGroupUnread(true).then(count => this.setData({ groupUnreadCount: count }))
  },
  logout: childCommon.logout,
  load() {
    const resolveAvatar = value => getApp().resolveMediaUrl ? getApp().resolveMediaUrl(value) : value
    const user = wx.getStorageSync('user') || {}
    const profile = wx.getStorageSync('profile') || {}
    this.setData({
      accountName: user.nickname || profile.nickname || '子女协同端',
      editNickname: user.nickname || profile.nickname || '',
      avatar: resolveAvatar(user.avatar || user.avatarUrl || profile.avatar) || '/assets/ui/default_avatar.png'
    })
    getApp().request({ url: '/user/profile', loading: false }).then(res => {
      const p = res.profile || {}
      const u = res.user || user
      const nickname = p.nickname || u.nickname || this.data.accountName
      const avatar = resolveAvatar(p.avatar || u.avatar || this.data.avatar)
      this.setData({ accountName: nickname, editNickname: nickname, avatar })
      wx.setStorageSync('profile', Object.assign({}, p, { nickname, avatar }))
      wx.setStorageSync('user', Object.assign({}, user, u, { nickname, avatar, avatarUrl: avatar }))
    }).catch(() => {})
    getApp().request({ url: '/home/child-dashboard' }).then(res => {
      const elders = this.decorateElders(res.bound_elders || [])
      if (user.id && elders.length) wx.setStorageSync(`bound_family_members_${user.id}`, elders)
      this.setData({
        dashboard: res,
        elders,
        weeklyReports: res.weekly_reports || [],
        healthSummaries: res.health_summaries || [],
        latestMessages: res.latest_messages || [],
        elderCount: elders.length,
        alertCount: res.total_unread_alerts || 0,
        messageCount: res.message_unread_count || 0
      })
    }).catch(() => {
      getApp().request({ url: '/child/elders' }).then(res => {
        const elders = this.decorateElders(res.items || [])
        if (user.id && elders.length) wx.setStorageSync(`bound_family_members_${user.id}`, elders)
        this.setData({ elders, elderCount: elders.length, alertCount: elders.reduce((sum, item) => sum + Number(item.unread_alerts || 0), 0) })
      }).catch(() => {})
    })
  },
  decorateElders(list) {
    return (list || []).map(item => {
      const elderUserId = Number(item.elder_user_id || item.peer_id || item.user_id || item.id || 0)
      let permissions = item.permissions || {}
      if (typeof permissions === 'string') {
        try { permissions = JSON.parse(permissions) } catch (e) { permissions = {} }
      }
      const normalizedPermissions = {
        view_positions: !!permissions.view_positions,
        view_ledger_summary: !!permissions.view_ledger_summary,
        receive_alerts: !!permissions.receive_alerts,
        view_messages: !!permissions.view_messages,
        view_group_chat: !!permissions.view_group_chat,
        view_health: !!permissions.view_health,
        view_location: !!permissions.view_location
      }
      const remarkKey = `family_remark_${elderUserId}`
      const remark = item.remark || wx.getStorageSync(remarkKey) || ''
      return Object.assign({}, item, {
        elder_user_id: elderUserId,
        permissions: normalizedPermissions,
        remark,
        display_name: remark || item.display_name || item.nickname || '长辈'
      })
    })
  },
  loadChildHomeInfo() {
    getApp().request({ url: '/weather/today', loading: false }).then(res => {
      this.setData({ weatherCard: {
        city: res.city || '当前区域',
        weather: res.weather || '--',
        temperature: res.temperature || res.temp || '--',
        suggestion: res.suggestion || ''
      } })
    }).catch(() => {})
    if (this._newsLoaded) return
    this._newsLoaded = true
    getApp().request({ url: '/market/daily', loading: false }).then(res => {
      const items = res && res.success !== false ? (res.items || []).slice(0, 3) : []
      this.setData({ newsItems: items })
    }).catch(() => this.setData({ newsItems: [] }))
  },
  openChildNews(e) {
    const item = (this.data.newsItems || [])[Number(e.currentTarget.dataset.index)]
    if (!item) return
    wx.showModal({ title: item.title || '今日资讯', content: item.summary || item.title || '暂无摘要', showCancel: false, confirmText: '知道了' })
  },
  onNicknameInput(e) {
    this.setData({ editNickname: e.detail.value })
  },
  chooseAvatar() {
    const save = (filePath) => {
      const app = getApp()
      const token = wx.getStorageSync('token') || ''
      wx.showLoading({ title: '上传头像中', mask: true })
      wx.uploadFile({
        url: app.globalData.baseUrl + '/user/avatar/upload',
        filePath,
        name: 'file',
        header: { Authorization: token ? `Bearer ${token}` : '' },
        success: res => {
          try {
            const data = JSON.parse(res.data || '{}')
            if (!data.ok || !data.avatar) throw new Error('upload failed')
            const avatar = app.resolveMediaUrl ? app.resolveMediaUrl(data.avatar) : data.avatar
            this.setData({ avatar })
            this.saveProfile({ avatar, avatarUrl: avatar }, false)
            wx.showToast({ title: '头像已保存', icon: 'success' })
          } catch (e) {
            wx.showToast({ title: '头像上传失败', icon: 'none' })
          }
        },
        fail: () => wx.showToast({ title: '头像上传失败', icon: 'none' }),
        complete: () => wx.hideLoading()
      })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = (res.tempFiles || [])[0]
          if (file && file.tempFilePath) save(file.tempFilePath)
        }
      })
      return
    }
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => {
        const avatar = (res.tempFilePaths || [])[0]
        if (avatar) save(avatar)
      }
    })
  },
  saveProfile(extra = {}, toast = true) {
    const nickname = String(this.data.editNickname || this.data.accountName || '').trim() || '子女用户'
    const avatar = extra.avatar || this.data.avatar
    const payload = Object.assign({ nickname, avatar, avatarUrl: avatar }, extra)
    const user = wx.getStorageSync('user') || {}
    wx.setStorageSync('user', Object.assign({}, user, payload))
    wx.setStorageSync('profile', Object.assign({}, wx.getStorageSync('profile') || {}, payload))
    this.setData({ accountName: nickname, editNickname: nickname, avatar })
    getApp().request({
      url: '/user/profile/update',
      method: 'POST',
      data: payload,
      loading: false
    }).then(() => {
      if (toast) wx.showToast({ title: '资料已保存', icon: 'success' })
    }).catch(() => {
      if (toast) wx.showToast({ title: '已先保存到本机', icon: 'none' })
    })
  },
  setElderRemark(e) {
    const peerId = e.currentTarget.dataset.id
    if (!peerId) return
    wx.showModal({
      title: '设置家人备注',
      editable: true,
      placeholderText: '例如：妈妈、爸爸',
      success: (res) => {
        if (!res.confirm) return
        const remark = String(res.content || '').trim().slice(0, 40)
        wx.setStorageSync(`family_remark_${peerId}`, remark)
        getApp().request({
          url: '/family/member/remark',
          method: 'POST',
          data: { peer_id: peerId, remark },
          loading: false
        }).finally(() => this.load())
      }
    })
  },
  firstElderId() { return (this.data.elders[0] && this.data.elders[0].elder_user_id) || '' },
  elderById(elderId) { return (this.data.elders || []).find(item => String(item.elder_user_id) === String(elderId)) || (this.data.elders || [])[0] || {} },
  allowForElder(elderId, permissionKey) {
    const elder = this.elderById(elderId)
    if ((elder.permissions || {})[permissionKey]) return true
    wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    return false
  },
  goBind() { wx.navigateTo({ url: '/pages/child/bind/bind' }) },
  goList() { wx.navigateTo({ url: '/pages/child/elder-list/elder-list' }) },
  goAssist() { wx.navigateTo({ url: '/pages/child/assist/assist?elder_id=' + this.firstElderId() }) },
  goPermissions() { wx.navigateTo({ url: '/pages/child/permissions/permissions' }) },
  goMoney() { wx.navigateTo({ url: '/pages/money/money' }) },
  goDashboard(e) { wx.navigateTo({ url: '/pages/child/elder-dashboard/elder-dashboard?elder_id=' + e.currentTarget.dataset.id }) },
  goAlerts(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset.id
    if (!id) return wx.showToast({ title: '暂无绑定长辈', icon: 'none' })
    if (!this.allowForElder(id, 'receive_alerts')) return
    wx.navigateTo({ url: '/pages/child/alerts/alerts?elder_id=' + id })
  },
  goWeekly(e) {
    const id = e.currentTarget.dataset.id
    const permissions = (this.elderById(id).permissions || {})
    if (!permissions.view_ledger_summary && !permissions.view_positions) return this.allowForElder(id, 'view_ledger_summary')
    wx.navigateTo({ url: '/pages/child/weekly/weekly?elder_id=' + id })
  },
  goMessages(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset.id) || this.firstElderId()
    if (!this.allowForElder(id, 'view_messages')) return
    this.setData({ showMessageModal: true, messagePeerId: Number(id || 0) })
  },
  goGroupChat() { const id = this.firstElderId(); if (this.allowForElder(id, 'view_group_chat')) wx.navigateTo({ url: '/pages/family-group-chat/family-group-chat' }) },
  goHealth(e) { const id = (e && e.currentTarget && e.currentTarget.dataset.id) || this.firstElderId(); if (this.allowForElder(id, 'view_health')) this.setData({ showCareModal: true, careType: 'health', careElderId: Number(id) }) },
  goLocation(e) { const id = (e && e.currentTarget && e.currentTarget.dataset.id) || this.firstElderId(); if (this.allowForElder(id, 'view_location')) this.setData({ showCareModal: true, careType: 'location', careElderId: Number(id) }) },
  closeMessageModal() { this.setData({ showMessageModal: false, messagePeerId: 0 }) },
  closeCareModal() { this.setData({ showCareModal: false, careElderId: 0 }) },
  goChildHome() {},
  goAssistant() { wx.navigateTo({ url: '/pages/assistant/assistant' }) },
  goFamily() { wx.navigateTo({ url: '/pages/family/family' }) },
  goChildProfile() { wx.navigateTo({ url: '/pages/child/profile/profile' }) }
})
