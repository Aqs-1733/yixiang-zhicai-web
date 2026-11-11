Component({
  properties: {
    popups: {
      type: Array,
      value: [],
      observer(list) {
        const old = this.data.localPopups || []
        const closedIds = this.data.closedIds || []
        const merged = (list || []).filter(item => !closedIds.includes(String(item.id))).map(item => {
          const existed = old.find(x => x.id === item.id)
          return existed ? { ...existed, ...item, top: existed.top, left: existed.left } : item
        })
        this.setData({ localPopups: merged })
      }
    }
  },

  data: {
    localPopups: [],
    dragging: null,
    closedIds: [],
    globalFontPageClass: 'font-global-normal'
  },

  lifetimes: {
    attached() {
      const app = getApp()
      const font = app.getGlobalFontSetting ? app.getGlobalFontSetting() : { pageClass: 'font-global-normal' }
      this.setData({ globalFontPageClass: font.pageClass })
    }
  },

  methods: {
    noop() {},

    close(e) {
      const id = String(e.currentTarget.dataset.id || '')
      if (id) {
        const localPopups = (this.data.localPopups || []).filter(item => String(item.id) !== id)
        const closedIds = (this.data.closedIds || []).concat(id).slice(-24)
        this.setData({ localPopups, closedIds, dragging: null })
      }
      this.triggerEvent('close', {
        id
      })
    },

    updatePopup(id, patch) {
      const localPopups = (this.data.localPopups || []).map(item => {
        if (String(item.id) === String(id)) return { ...item, ...patch }
        return item
      })
      this.setData({ localPopups })
    },

    ask(e) {
      const id = String(e.currentTarget.dataset.id || '')
      const term = e.currentTarget.dataset.term || ''
      if (!id) return
      const popup = (this.data.localPopups || []).find(item => String(item.id) === id) || {}
      const messages = popup.chatMessages && popup.chatMessages.length
        ? popup.chatMessages
        : [{
            id: `hello_${Date.now()}`,
            role: 'assistant',
            text: `我在这里继续帮您解释“${term || popup.term || '这个词'}”。您可以直接问：风险在哪里、适不适合养老钱、下一步怎么核验。`
          }]
      this.updatePopup(id, {
        chatOpen: true,
        chatMessages: messages,
        chatInput: popup.chatInput || '',
        asking: false
      })
    },

    onChatInput(e) {
      const id = String(e.currentTarget.dataset.id || '')
      if (!id) return
      this.updatePopup(id, { chatInput: e.detail.value })
    },

    sendChat(e) {
      const id = String(e.currentTarget.dataset.id || '')
      const popup = (this.data.localPopups || []).find(item => String(item.id) === id)
      if (!popup || popup.asking) return
      const text = String(popup.chatInput || '').trim()
      if (!text) {
        wx.showToast({ title: '请输入想问的问题', icon: 'none' })
        return
      }
      const userMsg = { id: `u_${Date.now()}`, role: 'user', text }
      const thinkingId = `a_${Date.now()}`
      const thinking = { id: thinkingId, role: 'assistant', text: '小享正在想，马上用白话说清楚...' }
      const nextMessages = (popup.chatMessages || []).concat(userMsg, thinking)
      this.updatePopup(id, { chatInput: '', chatMessages: nextMessages, asking: true })

      const history = [{
        role: 'assistant',
        text: `弹窗上下文：术语“${popup.term || ''}”；当前解释：${popup.explanation || ''}；风险提醒：${popup.risk_tip || ''}`
      }].concat((popup.chatMessages || []).slice(-8).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        text: msg.text || ''
      })))
      const storedRole = wx.getStorageSync('role') || 'elder'
      const profile = Object.assign({}, wx.getStorageSync('profile') || {}, wx.getStorageSync('user') || {}, { role: storedRole })
      getApp().request({
        url: '/assistant/chat',
        method: 'POST',
        loading: false,
        data: {
          session_id: `term_popup_${id}`,
          scene: 'term_popup',
          mode: 'term_popup',
          message: text,
          term: popup.term || '',
          profile,
          history
        }
      }).then(res => {
        const answer = String(res.reply || res.answer || '小享暂时没连上服务，您可以稍后再问；如果涉及转账验证码，请先暂停操作。')
          .replace(/```(?:json|markdown|text)?|```/gi, '')
          .replace(/^\s*#{1,6}\s*/gm, '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\uFEFF|ï»¿|�/g, '')
          .replace(/(?:^|\n)\s*(?:Error|Traceback|provider|model|debug|status_code)\s*[:：].*/gi, '')
          .trim()
        const localPopups = (this.data.localPopups || []).map(item => {
          if (String(item.id) !== id) return item
          const chatMessages = (item.chatMessages || []).map(msg => msg.id === thinkingId ? { ...msg, text: answer } : msg)
          return { ...item, chatMessages, asking: false }
        })
        this.setData({ localPopups })
      }).catch(() => {
        const localPopups = (this.data.localPopups || []).map(item => {
          if (String(item.id) !== id) return item
          const chatMessages = (item.chatMessages || []).map(msg => msg.id === thinkingId ? { ...msg, text: '小享暂时没连上服务，您可以稍后再问；如果涉及转账验证码，请先暂停操作。' } : msg)
          return { ...item, chatMessages, asking: false }
        })
        this.setData({ localPopups })
      })
    },

    dragStart(e) {
      const id = e.currentTarget.dataset.id
      const item = (this.data.localPopups || []).find(x => x.id === id)
      const touch = e.touches && e.touches[0]
      if (!item || !touch) return
      this.setData({
        dragging: {
          id,
          startX: touch.clientX,
          startY: touch.clientY,
          top: Number(item.top || 150),
          left: Number(item.left || 30)
        }
      })
    },

    dragMove(e) {
      const dragging = this.data.dragging
      const touch = e.touches && e.touches[0]
      if (!dragging || !touch) return
      const left = Math.max(10, Math.min(110, dragging.left + (touch.clientX - dragging.startX) * 2))
      const top = Math.max(40, Math.min(980, dragging.top + (touch.clientY - dragging.startY) * 2))
      const localPopups = (this.data.localPopups || []).map(item => {
        if (item.id === dragging.id) return { ...item, left, top }
        return item
      })
      this.setData({ localPopups })
    },

    dragEnd() {
      this.setData({ dragging: null })
    }
  }
})
