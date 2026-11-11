function formatTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16)
}

Component({
  properties: {
    visible: { type: Boolean, value: false, observer(value) { if (value) this.open() } },
    peerId: { type: Number, value: 0 }
  },
  data: {
    members: [],
    memberNames: [],
    selectedIndex: 0,
    selectedPeerId: 0,
    selectedName: '',
    inputText: '',
    messages: [],
    loading: false,
    sending: false,
    memberHint: '正在同步已绑定家人…',
    globalFontPageClass: 'font-global-normal'
  },
  lifetimes: {
    attached() {
      const app = getApp()
      if (app && app.getGlobalFontSetting) {
        const font = app.getGlobalFontSetting()
        this.setData({ globalFontPageClass: font.pageClass })
      }
    }
  },
  methods: {
    stopTap() {},
    cacheKey() {
      const user = wx.getStorageSync('user') || {}
      return `bound_family_members_${user.id || 'current'}`
    },
    normalizeMembers(items) {
      const seen = {}
      return (items || []).map(item => ({
        ...item,
        peer_id: Number(item.peer_id || item.elder_user_id || item.id || 0),
        display_name: item.display_name || item.remark || item.name || item.nickname || '家人'
      })).filter(item => item.peer_id && !seen[item.peer_id] && (seen[item.peer_id] = true))
    },
    open() {
      const cached = this.normalizeMembers(wx.getStorageSync(this.cacheKey()) || [])
      if (cached.length) this.applyMembers(cached)
      this.setData({ loading: true, memberHint: cached.length ? '' : '正在同步已绑定家人…' })
      const app = getApp()
      app.request({ url: '/family/members', loading: false }).then(res => {
        const direct = this.normalizeMembers(res.items || [])
        if (direct.length) return direct
        return app.request({ url: '/family/messages', loading: false }).then(messageRes => this.normalizeMembers(messageRes.members || []))
      }).then(members => {
        if (members.length) {
          wx.setStorageSync(this.cacheKey(), members)
          this.applyMembers(members)
          this.setData({ memberHint: '' })
        } else if (!this.data.members.length) {
          this.setData({ memberHint: '当前账号尚未绑定家人' })
        }
      }).catch(err => {
        if (this.data.members.length) return
        const denied = Number(err && err.statusCode) === 403
        this.setData({ memberHint: denied ? '长辈暂未开放留言权限' : '家人信息暂未同步，请稍后重试' })
      }).finally(() => this.setData({ loading: false }))
    },
    applyMembers(members) {
      let selectedIndex = 0
      const wanted = Number(this.properties.peerId || this.data.selectedPeerId || 0)
      if (wanted) {
        const index = members.findIndex(item => Number(item.peer_id) === wanted)
        if (index >= 0) selectedIndex = index
      }
      const member = members[selectedIndex]
      this.setData({
        members,
        memberNames: members.map(item => `${item.display_name}（${item.relation || '家人'}）`),
        selectedIndex,
        selectedPeerId: member ? member.peer_id : 0,
        selectedName: member ? member.display_name : ''
      }, () => this.loadMessages())
    },
    chooseMember(e) {
      const selectedIndex = Number(e.detail.value || 0)
      const member = this.data.members[selectedIndex]
      if (!member) return
      this.setData({ selectedIndex, selectedPeerId: member.peer_id, selectedName: member.display_name, messages: [] }, () => this.loadMessages())
    },
    loadMessages() {
      if (!this.data.selectedPeerId) return
      const user = wx.getStorageSync('user') || {}
      getApp().request({ url: `/family/messages?peer_id=${this.data.selectedPeerId}`, loading: false }).then(res => {
        const messages = (res.items || []).slice(-20).map(item => ({
          ...item,
          isMine: String(item.sender_id || item.from_user_id) === String(user.id),
          senderText: item.sender_name || item.from_name || '家人',
          timeText: formatTime(item.created_at)
        }))
        this.setData({ messages })
      }).catch(() => {})
    },
    onInput(e) { this.setData({ inputText: e.detail.value }) },
    send() {
      const content = String(this.data.inputText || '').trim()
      if (!this.data.selectedPeerId) return wx.showToast({ title: '请先选择家人', icon: 'none' })
      if (!content) return wx.showToast({ title: '请填写留言内容', icon: 'none' })
      this.setData({ sending: true })
      getApp().request({
        url: '/family/messages',
        method: 'POST',
        data: { receiver_id: this.data.selectedPeerId, content },
        loading: true
      }).then(() => {
        this.setData({ inputText: '' })
        this.loadMessages()
        wx.showToast({ title: '留言已发送', icon: 'success' })
        this.triggerEvent('sent')
      }).catch(err => wx.showToast({ title: (err && err.data && err.data.detail) || '留言暂未发送', icon: 'none' }))
        .finally(() => this.setData({ sending: false }))
    },
    close() { this.triggerEvent('close') }
  }
})
