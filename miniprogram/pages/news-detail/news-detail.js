const termHelper = require('../../utils/termExplain.js')

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '')
  } catch (e) {
    return value || ''
  }
}

function decorateArticle(item) {
  const article = item || {}
  const title = article.title || '养老理财资讯'
  const summary = article.summary || article.desc || ''
  const content = article.content || article.detail || summary || '暂无更多详情，请以官方渠道发布的信息为准。'
  const paragraphs = String(content)
    .split(/\n+/)
    .map(text => text.trim())
    .filter(Boolean)

  return {
    ...article,
    title,
    date:article.published_at||article.date||article.time||article.created_at||'发布日期未提供',
    summary,
    content,
    titleSegments: termHelper.buildTermSegments(title),
    summarySegments: termHelper.buildTermSegments(summary),
    paragraphs: (paragraphs.length ? paragraphs : [content]).map(text => ({
      text,
      segments: termHelper.buildTermSegments(text)
    }))
  }
}

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    article: decorateArticle(null),
    articleLoading: false,
    termExplainPopups: []
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    this.loadArticle(options)
  },

  onShow() {
    this.syncGlobalFont()
  },

  syncGlobalFont() {
    const app = getApp()
    if (app && app.getGlobalFontSetting) {
      const font = app.getGlobalFontSetting()
      this.setData({ globalFontPageClass: font.pageClass })
    }
  },

  loadArticle(options) {
    const list = wx.getStorageSync('home_articles') || []
    const idx = Number(options.index)
    const id = safeDecode(options.id)
    let item = null

    if (!Number.isNaN(idx) && list[idx]) {
      item = list[idx]
    } else if (id) {
      item = list.find(news => String(news.id || news.title || '') === id)
    }

    // 先用基础信息渲染（标题、来源、日期可见）
    this.setData({
      article: decorateArticle(item),
      articleLoading: false
    })

    // 如果有 URL，抓取完整文章
    const articleUrl = item && (item.url || item.link || item.share_url)
    if (articleUrl) {
      this.setData({ articleLoading: true })
      const app = getApp()
      if (app && app.request) {
        app.request({
          url: '/news/article-content',
          data: { url: articleUrl },
          loading: false
        }).then(res => {
          if (res && res.ok && res.paragraphs && res.paragraphs.length) {
            const fullArticle = {
              ...item,
              title: res.title || item.title,
              source: res.source || item.source,
              date: res.date || item.time,
              content: res.paragraphs.join('\n')
            }
            this.setData({
              article: decorateArticle(fullArticle),
              articleLoading: false
            })
          } else {
            this.setData({ articleLoading: false })
          }
        }).catch(() => {
          this.setData({ articleLoading: false })
        })
      }
    }
  },

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    if (!term) return
    // 点击难词直接跳转AI助手页面一键询问
    termHelper.goAskTerm(term)
  },

  readArticle() {
    const article = this.data.article
    getApp().readText(`资讯：${article.title}。${article.summary || article.content}`)
  },

  openOriginal() {
    const url=this.data.article.url||this.data.article.link||''
    if(!/^https?:\/\//.test(url))return
    if(typeof window!=='undefined')window.open(url,'_blank','noopener,noreferrer')
    else wx.setClipboardData({data:url})
  },

  askXiang() {
    const article = this.data.article
    wx.navigateTo({
      url: `/pages/assistant/assistant?ask=${encodeURIComponent(`请依据这条官方资讯的标题和出处解释，未核对正文的细节请明确说明，不要补写政策条件：${article.title}。发布：${article.date}；来源：${article.source}；原文：${article.url||''}。${article.summary || article.content}`)}`
    })
  },

  closeTermPopup(e) {
    termHelper.closeTermPopup(this, e)
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.reLaunch({ url: '/pages/index/index' })
    }
  },

  back() {
    this.goBack()
  },

  // ---- 语音输入：语音提问这篇新闻 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    const title = this.data.article && this.data.article.title ? this.data.article.title : ''
    const question = title ? `关于「${title.slice(0, 20)}」的新闻，${text}` : text
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/assistant/assistant?question=' + encodeURIComponent(question),
        fail: (err) => {
          console.error('[新闻详情] 语音跳转失败:', err)
          wx.showToast({ title: '跳转失败，请重试', icon: 'none' })
        }
      })
    }, 100)
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})
