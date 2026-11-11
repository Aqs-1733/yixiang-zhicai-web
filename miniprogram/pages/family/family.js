function safeText(text, maxLen, fallback) {
  let value = String(text || '').replace(/\s+/g, ' ').trim()

  if (!value) {
    value = fallback || ''
  }

  if (value.length > maxLen) {
    value = value.slice(0, maxLen - 1) + '。'
  }

  return value
}

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    isElder: true,
    familyCode: '',
    familyList: [],
    primaryMember: null,
    pendingBindings: [],
    phoneList: [],

    alertText: '暂无异常提醒',
    weeklyText: '暂无金融周报数据',

    aiLoading: false,

    showAddPanel: false,
    newName: '',
    newRelation: '',
    newPhone: '',
    groupUnreadCount: 0,
    showPermissionModal: false,
    permissionTarget: null,
    permissionDraft: {},
    showMessageModal: false,
    messagePeerId: 0,
    showCareModal: false,
    careType: 'health',
    careElderId: 0
  },

  onLoad() {
    this.syncRoleAndFont()
    if (this.data.isElder && typeof window === 'undefined') {
      wx.setStorageSync('openElderPermissionPanel', true)
      wx.redirectTo({ url: '/pages/index/index' })
      return
    }
    this.refreshPage()
    getApp().checkFamilyGroupUnread(false).then(count => this.setData({ groupUnreadCount: count }))
    this.refreshAIAnalysis()
  },

  onShow() {
    this.syncRoleAndFont()
    if (this.data.isElder && typeof window === 'undefined') return
    this.refreshPage()
    getApp().checkFamilyGroupUnread(false).then(count => this.setData({ groupUnreadCount: count }))
  },

  syncRoleAndFont() {
    const app = getApp()
    const font = app.getGlobalFontSetting ? app.getGlobalFontSetting() : { pageClass: 'font-global-normal' }
    const user = wx.getStorageSync('user') || {}
    const role = user.role || wx.getStorageSync('role') || 'elder'
    this.setData({
      globalFontPageClass: font.pageClass,
      isElder: role === 'elder'
    })
  },

  normalizeFamilyItem(item) {
    let permissions = item.permissions || {}
    if (typeof permissions === 'string') {
      try { permissions = JSON.parse(permissions) } catch (e) { permissions = {} }
    }
    const rawId = String(item.id || item.mid || Date.now())
    const isBinding = !!item.binding_id || rawId.indexOf('binding-') === 0
    const permissionMap = permissions && !Array.isArray(permissions) ? permissions : {}
    const elderUserId = Number(item.elder_user_id || item.peer_id || item.user_id || 0)
    return {
      ...item,
      id: rawId,
      elderUserId,
      isBinding,
      bindingId: isBinding ? Number(item.binding_id || rawId.replace('binding-', '')) : 0,
      canViewAlert: item.canViewAlert !== undefined
        ? item.canViewAlert
        : (item.enabled !== false && (
          permissionMap.receive_alerts !== undefined
            ? !!permissionMap.receive_alerts
            : (permissions.length === 0 || permissions.indexOf('异常提醒') >= 0)
        )),
      canViewReport: item.canViewReport !== undefined
        ? item.canViewReport
        : (item.enabled !== false && (
          permissionMap.view_weekly_report !== undefined
            ? !!permissionMap.view_weekly_report
            : (permissions.length === 0 || permissions.indexOf('资产周报') >= 0 || permissions.indexOf('家庭周报') >= 0)
        )),
      canViewLedger: permissionMap.view_ledger_summary !== undefined ? !!permissionMap.view_ledger_summary : true,
      canViewPositions: permissionMap.view_positions !== undefined ? !!permissionMap.view_positions : true,
      canViewMessages: permissionMap.view_messages !== undefined ? !!permissionMap.view_messages : true,
      canViewGroupChat: permissionMap.view_group_chat !== undefined ? !!permissionMap.view_group_chat : true,
      canViewHealth: permissionMap.view_health !== undefined ? !!permissionMap.view_health : !!permissionMap.view_health_reminders,
      canViewLocation: permissionMap.view_location !== undefined ? !!permissionMap.view_location : true
    }
  },

  setFamilyData(familyList) {
    const seen = {}
    const list = []
    ;(familyList || []).map(this.normalizeFamilyItem).forEach(item => {
      const phoneKey = String(item.phone || '').replace(/\D+/g, '')
      const key = phoneKey || `${item.name || ''}|${item.relation || ''}`
      if (seen[key]) return
      seen[key] = true
      list.push(item)
    })
    const phoneSeen = {}
    const phoneList = []
    list.forEach(item => {
      const phoneKey = String(item.phone || '').replace(/\D+/g, '')
      const key = phoneKey || `${item.name || ''}|${item.id}`
      if (!item.phone || phoneSeen[key]) return
      phoneSeen[key] = true
      phoneList.push({ id: item.id, name: item.name, phone: item.phone })
    })
    wx.setStorageSync('family_list', list)
    const user = wx.getStorageSync('user') || {}
    if (user.id && list.length) wx.setStorageSync(`bound_family_members_${user.id}`, list)
    this.setData({
      familyList: list,
      primaryMember: list[0] || null,
      phoneList
    })
  },

  refreshPage() {
    this.setData({ familyCode: wx.getStorageSync('family_code') || '' })
    this.setFamilyData([])

    getApp().request({ url: '/family/bind-code' }).then(res => {
      if (res.code) {
        wx.setStorageSync('family_code', res.code)
        this.setData({ familyCode: res.code })
      }
    }).catch(() => {
      this.setData({ familyCode: '' })
    })

    getApp().request({ url: '/family/members' }).then(res => {
      this.setFamilyData(res.items || [])
    }).catch(() => {
      this.setFamilyData([])
    })

    getApp().request({ url: '/family/pending-bindings' }).then(res => {
      this.setData({ pendingBindings: res.items || [] })
    }).catch(() => {})
  },

  openBindAction() {
    if (this.data.isElder) {
      wx.showActionSheet({
        itemList: ['复制或生成我的绑定码', '输入另一位长辈的绑定码'],
        success: res => {
          if (res.tapIndex === 0) {
            if (this.data.familyCode) this.copyCode()
            else this.refreshCode()
          } else {
            this.promptFamilyCode()
          }
        }
      })
      return
    }
    this.goChildBind()
  },

  promptFamilyCode() {
    wx.showModal({
      title: '输入家庭绑定码',
      editable: true,
      placeholderText: '请输入6位绑定码',
      success: res => {
        if (!res.confirm) return
        const code = String(res.content || '').trim()
        if (!/^\d{6}$/.test(code)) return wx.showToast({ title: '请输入6位绑定码', icon: 'none' })
        getApp().request({
          url: '/family/bind/accept-code',
          method: 'POST',
          data: { code, relation: '长辈' },
          loading: true
        }).then(() => {
          wx.showToast({ title: '家庭已合并', icon: 'success' })
          this.refreshPage()
        }).catch(() => wx.showToast({ title: '绑定码无效或已使用', icon: 'none' }))
      }
    })
  },

  ensureChildPermission(key) {
    if (this.data.isElder) return true
    const member = this.data.primaryMember || (this.data.familyList || [])[0] || {}
    if (member[key]) return true
    wx.showModal({ title: '暂时无法查看', content: '长辈暂未开放该权限', showCancel: false, confirmText: '知道了' })
    return false
  },
  primaryElderId() {
    const member = this.data.primaryMember || (this.data.familyList || [])[0] || {}
    return Number(member.elderUserId || member.elder_user_id || member.peer_id || 0)
  },
  openChildFeature(permissionKey, path) {
    const elderId = this.primaryElderId()
    if (!elderId) {
      wx.showToast({ title: '请先在“我的”完成家庭绑定', icon: 'none' })
      return
    }
    if (!this.ensureChildPermission(permissionKey)) return
    const joiner = path.indexOf('?') >= 0 ? '&' : '?'
    wx.navigateTo({ url: `${path}${joiner}elder_id=${elderId}` })
  },
  goChildBind() { wx.navigateTo({ url: '/pages/child/bind/bind' }) },
  goFamilyLedger() { if (this.data.isElder) return wx.navigateTo({ url: '/pages/money/money?family=1' }); this.openChildFeature('canViewLedger', '/pages/child/ledger/ledger') },
  goPositions() { this.openChildFeature('canViewPositions', '/pages/child/positions/positions') },
  goAlerts() { this.openChildFeature('canViewAlert', '/pages/child/alerts/alerts') },
  goHealth() {
    const elderId = this.primaryElderId()
    if (elderId && this.ensureChildPermission('canViewHealth')) this.setData({ showCareModal: true, careType: 'health', careElderId: elderId })
  },
  goLocation() {
    const elderId = this.primaryElderId()
    if (elderId && this.ensureChildPermission('canViewLocation')) this.setData({ showCareModal: true, careType: 'location', careElderId: elderId })
  },
  goWeekly() {
    if (this.data.isElder) return wx.showModal({ title: '家庭金融周报', content: this.data.weeklyText, showCancel: false })
    const member = this.data.primaryMember || {}
    if (!member.canViewLedger && !member.canViewPositions) {
      this.ensureChildPermission('canViewLedger')
      return
    }
    this.openChildFeature(member.canViewLedger ? 'canViewLedger' : 'canViewPositions', '/pages/child/weekly/weekly')
  },
  goMessages() {
    if (this.data.isElder) return wx.navigateTo({ url: '/pages/family-messages/family-messages' })
    const elderId = this.primaryElderId()
    if (elderId && this.ensureChildPermission('canViewMessages')) this.setData({ showMessageModal: true, messagePeerId: elderId })
  },
  goGroupChat() { if (this.data.isElder) return wx.navigateTo({ url: '/pages/family-group-chat/family-group-chat' }); this.openChildFeature('canViewGroupChat', '/pages/family-group-chat/family-group-chat') },
  closeMessageModal() { this.setData({ showMessageModal: false, messagePeerId: 0 }) },
  closeCareModal() { this.setData({ showCareModal: false, careElderId: 0 }) },
  goAssistant() { wx.navigateTo({ url: '/pages/assistant/assistant' }) },
  goHome() {
    const role = wx.getStorageSync('role') || 'elder'
    wx.redirectTo({ url: role === 'child' ? '/pages/child/index/index' : '/pages/index/index' })
  },
  goProfile() {
    const role = wx.getStorageSync('role') || 'elder'
    wx.navigateTo({ url: role === 'child' ? '/pages/child/profile/profile' : '/pages/profile/profile' })
  },

  setFamilyRemark(e) {
    const peerId = e.currentTarget.dataset.id
    if (!peerId) return
    wx.showModal({
      title: '设置家人备注',
      editable: true,
      placeholderText: '例如：妈妈、爸爸、女儿',
      success: res => {
        if (!res.confirm) return
        const remark = String(res.content || '').trim().slice(0, 40)
        getApp().request({
          url: '/family/member/remark',
          method: 'POST',
          data: { peer_id: peerId, remark },
          loading: true
        }).then(() => this.refreshPage()).catch(() => wx.showToast({ title: '备注暂未保存，请稍后再试', icon: 'none' }))
      }
    })
  },

  openPermissionModal(e) {
    if (!this.data.isElder) return
    const id = String(e.currentTarget.dataset.id || '')
    const target = (this.data.familyList || []).find(item => String(item.id) === id)
    if (!target) return
    this.setData({
      showPermissionModal: true,
      permissionTarget: target,
      permissionDraft: {
        canViewPositions: !!target.canViewPositions,
        canViewLedger: !!target.canViewLedger,
        canViewAlert: !!target.canViewAlert,
        canViewMessages: !!target.canViewMessages,
        canViewGroupChat: !!target.canViewGroupChat,
        canViewHealth: !!target.canViewHealth,
        canViewLocation: !!target.canViewLocation
      }
    })
  },

  closePermissionModal() {
    this.setData({ showPermissionModal: false, permissionTarget: null, permissionDraft: {} })
  },

  changePermissionDraft(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ [`permissionDraft.${key}`]: !!e.detail.value })
  },

  savePermissionModal() {
    const target = this.data.permissionTarget
    const draft = this.data.permissionDraft || {}
    if (!this.data.isElder || !target || !target.bindingId) return
    getApp().request({
      url: `/family/bindings/${target.bindingId}/permissions`,
      method: 'PUT',
      data: {
        view_positions: !!draft.canViewPositions,
        view_ledger_summary: !!draft.canViewLedger,
        receive_alerts: !!draft.canViewAlert,
        view_messages: !!draft.canViewMessages,
        view_group_chat: !!draft.canViewGroupChat,
        view_health: !!draft.canViewHealth,
        view_location: !!draft.canViewLocation
      },
      loading: true
    }).then(() => {
      const familyList = (this.data.familyList || []).map(item => String(item.id) === String(target.id) ? { ...item, ...draft } : item)
      this.setFamilyData(familyList)
      this.closePermissionModal()
      wx.showToast({ title: '权限已保存', icon: 'success' })
    }).catch(() => wx.showToast({ title: '权限暂未保存', icon: 'none' }))
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.familyCode,
      success: () => {
        wx.showToast({
          title: '绑定码已复制',
          icon: 'success'
        })
      }
    })
  },

  refreshCode() {
    getApp().request({ url: '/family/bind-code/refresh', method: 'POST', loading: true }).then(res => {
      const code = res.code || ''
      if (!code) {
        wx.showToast({ title: '刷新失败', icon: 'none' })
        return
      }
      wx.setStorageSync('family_code', code)
      this.setData({ familyCode: code })
      wx.showToast({ title: '已刷新', icon: 'success' })
    }).catch(() => {
      wx.showToast({ title: '暂时没有刷新成功，请稍后再试', icon: 'none' })
    })
  },

  confirmBinding(e) {
    const id = e.currentTarget.dataset.id
    getApp().request({
      url: '/family/bindings/' + id + '/confirm',
      method: 'POST',
      loading: true
    }).then(() => {
      wx.showToast({ title: '已确认', icon: 'success' })
      this.refreshPage()
    })
  },

  rejectBinding(e) {
    const id = e.currentTarget.dataset.id
    getApp().request({
      url: '/family/bindings/' + id + '/reject',
      method: 'POST',
      loading: true
    }).then(() => {
      wx.showToast({ title: '已拒绝', icon: 'success' })
      this.refreshPage()
    })
  },

  openAddPanel() {
    this.setData({
      showAddPanel: true,
      newName: '',
      newRelation: '',
      newPhone: ''
    })
  },

  closeAddPanel() {
    this.setData({
      showAddPanel: false
    })
  },

  stopTap() {},

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({
      [key]: e.detail.value
    })
  },

  confirmAddFamily() {
    const name = (this.data.newName || '').trim()
    const relation = (this.data.newRelation || '').trim()
    const phone = (this.data.newPhone || '').trim()

    if (!name || !relation || !phone) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    if (phone.length < 6) {
      wx.showToast({ title: '手机号不完整', icon: 'none' })
      return
    }

    getApp().request({
      url: '/family/members',
      method: 'POST',
      data: { name, relation, phone },
      loading: true
    }).then(() => {
      this.setData({ showAddPanel: false })
      this.refreshPage()
      this.refreshAIAnalysis()
      wx.showToast({ title: '已添加家人', icon: 'success' })
    }).catch(err => {
      wx.showToast({
        title: '暂时没有添加成功，请检查绑定码后再试',
        icon: 'none'
      })
    })
  },

  togglePermission(e) {
    const id = String(e.currentTarget.dataset.id)
    const key = e.currentTarget.dataset.key
    const value = e.detail.value

    const familyList = this.data.familyList.map(item => {
      if (String(item.id) === id) {
        return { ...item, [key]: value }
      }
      return item
    })

    this.setFamilyData(familyList)

    const target = familyList.find(item => String(item.id) === id) || {}
    if (target.isBinding && target.bindingId) {
      getApp().request({
        url: '/family/bindings/' + target.bindingId + '/permissions',
        method: 'PUT',
        data: {
          view_positions: !!target.canViewPositions,
          view_ledger_summary: !!target.canViewLedger,
          receive_alerts: !!target.canViewAlert,
          view_messages: !!target.canViewMessages,
          view_group_chat: !!target.canViewGroupChat,
          view_health: !!target.canViewHealth,
          view_location: !!target.canViewLocation
        }
      }).catch(() => {})
    } else {
      getApp().request({
        url: '/family/members/' + id,
        method: 'PUT',
        data: { enabled: !!(target.canViewAlert || target.canViewReport) }
      }).catch(() => {})
    }

    this.refreshAIAnalysis()
  },

  deleteFamily(e) {
    const id = String(e.currentTarget.dataset.id)
    const target = (this.data.familyList || []).find(item => String(item.id) === id)

    wx.showModal({
      title: target && target.isBinding ? '解除绑定' : '删除家人',
      content: target && target.isBinding ? '确定解除这个子女协同账号吗？解除后对方不能再查看提醒和周报。' : '确定要删除这个协同家人吗？',
      confirmText: target && target.isBinding ? '解除' : '删除',
      success: (res) => {
        if (!res.confirm) return

        const localDelete = () => {
          const familyList = this.data.familyList.filter(item => String(item.id) !== id)
          this.setFamilyData(familyList)
          wx.showToast({ title: target && target.isBinding ? '已解除' : '已删除', icon: 'success' })
          this.refreshAIAnalysis()
        }

        if (target && target.isBinding && target.bindingId) {
          getApp().request({
            url: '/family/bindings/' + target.bindingId,
            method: 'DELETE',
            loading: true
          }).then(() => {
            localDelete()
          }).catch(() => {
            wx.showToast({ title: '暂时没有解除成功，请稍后再试', icon: 'none' })
          })
          return
        }

        getApp().request({
          url: '/family/members/' + id,
          method: 'DELETE',
          loading: true
        }).then(() => {
          localDelete()
        }).catch(() => {
          wx.showToast({ title: '暂时没有删除成功，请稍后再试', icon: 'none' })
        })
      }
    })
  },

  callPhone(e) {
    const phone = e.currentTarget.dataset.phone

    if (!phone) {
      wx.showToast({
        title: '暂无电话',
        icon: 'none'
      })
      return
    }

    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {
        wx.showToast({
          title: '无法拨打',
          icon: 'none'
        })
      }
    })
  },

  refreshAIAnalysis() {
    this.setData({ aiLoading: true })
    const anomalyReq = getApp().request({ url: '/family/anomaly' }).then(res => {
      this.setData({ alertText: safeText(res.summary || '暂无异常提醒', 42, '暂无异常提醒') })
    }).catch(() => {
      this.setData({ alertText: '暂无异常提醒' })
    })
    const weeklyReq = getApp().request({ url: '/family/weekly-report' }).then(res => {
      this.setData({ weeklyText: safeText(res.summary || '暂无金融周报数据', 48, '暂无金融周报数据') })
    }).catch(() => {
      this.setData({ weeklyText: '暂无金融周报数据' })
    })
    Promise.all([anomalyReq, weeklyReq]).then(() => {
      this.setData({ aiLoading: false })
    })
  },

  back() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  // ---- 语音输入 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/assistant/assistant?question=' + encodeURIComponent(text),
        fail: (err) => {
          console.error('[家庭] 语音跳转失败:', err)
          wx.showToast({ title: '跳转失败，请重试', icon: 'none' })
        }
      })
    }, 100)
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})
