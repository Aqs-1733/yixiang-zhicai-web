Component({
  properties: {
    visible: { type: Boolean, value: false, observer(value) { if (value) this.load() } },
    type: { type: String, value: 'health' },
    elderId: { type: Number, value: 0 }
  },
  data: { loading: false, denied: false, health: null, location: null, globalFontPageClass: 'font-global-normal' },
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
    close() { this.triggerEvent('close') },
    load() {
      const elderId = Number(this.properties.elderId || 0)
      if (!elderId) return this.setData({ loading: false, denied: false, health: null, location: null })
      this.setData({ loading: true, denied: false, health: null, location: null })
      const isHealth = this.properties.type === 'health'
      const path = isHealth ? `/child/elders/${elderId}/health-reminders` : `/child/elders/${elderId}/location`
      getApp().request({ url: path, loading: false }).then(res => {
        if (isHealth) {
          const decorate = list => (list || []).map(item => ({ ...item, timeText: String(item.created_at || '').replace('T', ' ').slice(0, 16) }))
          this.setData({ health: { ...res, meals: decorate(res.meals), exercises: decorate(res.exercises) } })
        } else {
          const location = res.location || null
          if (location) location.timeText = String(location.updated_at || '').replace('T', ' ').slice(0, 16)
          this.setData({ location })
        }
      }).catch(err => this.setData({ denied: Number(err && err.statusCode) === 403 })).finally(() => this.setData({ loading: false }))
    }
  }
})
