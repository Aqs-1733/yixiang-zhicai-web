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
    isListing:true,
    newsItems:[],
    newsListLoading:false,
    articleError:'',
    termExplainPopups: []
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    if(options.id||options.index!==undefined||options.url){this.setData({isListing:false});this.loadArticle(options)}else this.loadNewsList()
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

  loadNewsList() {
    this.setData({newsListLoading:true})
    getApp().request({url:'/market/daily',loading:false}).then(res=>{
      const items=res.items||[];wx.setStorageSync('home_articles',items)
      this.setData({newsItems:items,newsListLoading:false,articleError:items.length?'':'暂未取得官方资讯，请稍后刷新'})
    }).catch(()=>this.setData({newsListLoading:false,articleError:'网络暂时不可用，请稍后刷新'}))
  },

  openNewsItem(e) {
    wx.navigateTo({url:'/pages/news-detail/news-detail?id='+encodeURIComponent(e.currentTarget.dataset.id)})
  },

  loadArticle(options) {
    this._articleOptions=options
    const list=wx.getStorageSync('home_articles')||[]
    const id=safeDecode(options.id)
    const index=options.index===undefined?-1:Number(options.index)
    const item=list.find(x=>String(x.id)===id)||list[index]||null
    this.setData({article:decorateArticle(item),articleLoading:true,articleError:''})
    const url=(item&&item.url)||safeDecode(options.url)
    getApp().request({url:'/news/article-content',data:{id:(item&&item.id)||id,url},loading:false}).then(res=>{
      if(!res.ok)throw Error('article')
      const article={...item,...res,content:(res.paragraphs||[]).join('\n')}
      this.setData({article:decorateArticle(article),articleLoading:false,articleError:res.reader_message||''})
    }).catch(()=>this.setData({articleLoading:false,articleError:'这条资讯暂时未能读取，请重试或返回资讯列表'}))
  },

  retryArticle(){this.loadArticle(this._articleOptions||{})},
  goNewsList(){wx.navigateTo({url:'/pages/news-detail/news-detail'})},

  explainTerm(e) {
    const term = e.currentTarget.dataset.term || ''
    if (!term) return
    // 点击难词直接跳转AI助手页面一键询问
    termHelper.goAskTerm(term)
  },

  readArticle() {
    const article = this.data.article
    getApp().readText(`资讯：${article.title}。${article.content || article.summary}`)
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
      url: `/pages/assistant/assistant?ask=${encodeURIComponent(`请依据这条官方资讯的标题和出处解释，未核对正文的细节请明确说明，不要补写政策条件：${article.title}。发布：${article.date}；来源：${article.source}；原文：${article.url||''}。${article.content || article.summary}`)}`
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
