const LOCAL_API_BASE_URL = 'https://yixiangzhicai.com'
const RELEASE_API_BASE_URL = 'https://yixiangzhicai.com'
const DEFAULT_TIMEOUT = 20000
const AI_TIMEOUT = 70000

function getAppSafe() {
  try {
    return getApp()
  } catch (e) {
    return null
  }
}

function defaultBaseUrl() {
  try {
    const account = wx.getAccountInfoSync()
    const envVersion = account && account.miniProgram && account.miniProgram.envVersion
    return envVersion === 'release' ? RELEASE_API_BASE_URL : LOCAL_API_BASE_URL
  } catch (e) {
    return LOCAL_API_BASE_URL
  }
}

function isReleaseOrRealDevice() {
  let envVersion = 'develop'
  let platform = 'devtools'
  try {
    const account = wx.getAccountInfoSync()
    envVersion = account && account.miniProgram && account.miniProgram.envVersion
      ? account.miniProgram.envVersion
      : 'develop'
  } catch (e) {}
  try {
    const system = wx.getSystemInfoSync()
    platform = system && system.platform ? system.platform : 'devtools'
  } catch (e) {}
  return envVersion === 'release' || platform !== 'devtools'
}

function normalizeBaseUrl(value, options = {}) {
  const fallback = String(options.fallback || RELEASE_API_BASE_URL).replace(/\/+$/, '')
  const releaseLike = options.releaseLike === undefined ? isReleaseOrRealDevice() : !!options.releaseLike
  const raw = String(value || '').trim().replace(/\/+$/, '')
  const matched = raw.match(/^(https?):\/\/([^/?#]+)(\/[^?#]*)?$/i)
  if (!matched || matched[2].includes('@')) return fallback

  const protocol = matched[1].toLowerCase()
  const authority = matched[2].toLowerCase()
  const hostname = authority.replace(/^\[|\]$/g, '').split(':')[0]
  if (!hostname) return fallback

  // 真机和发布版只信任正式 HTTPS 域名，自动淘汰历史调试地址和错误缓存。
  if (releaseLike && (protocol !== 'https' || authority !== 'yixiangzhicai.com' || matched[3])) return fallback
  return raw
}

function baseUrl() {
  const stored = String(wx.getStorageSync('baseUrl') || '').trim()
  const app = getAppSafe()
  const configured = app && app.globalData && app.globalData.baseUrl
  return normalizeBaseUrl(stored || configured || defaultBaseUrl(), {
    fallback: defaultBaseUrl()
  })
}

function isAiRequest(url, method, data) {
  const path = String(url || '').split('?')[0]
  if (['/assistant/chat', '/assistant/multimodal-analyze', '/assistant/voice-to-text', '/assistant/text-to-voice'].includes(path)) return true
  return path === '/family/group-chat' && String(method || 'GET').toUpperCase() === 'POST' && /@小享/.test(String((data || {}).content || ''))
}

function request({ url, method = 'GET', data = {}, header = {}, loading = false, timeout = DEFAULT_TIMEOUT }) {
  if (loading) wx.showLoading({ title: '小享处理中', mask: true })
  const token = wx.getStorageSync('token') || ''
  const requestTimeout = isAiRequest(url, method, data) ? Math.max(Number(timeout) || 0, AI_TIMEOUT) : timeout
  const startedAt = Date.now()
  let statusCode = 0
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl() + url,
      method,
      data,
      timeout: requestTimeout,
      header: Object.assign({
        'content-type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      }, header),
      success(res) {
        statusCode = Number(res.statusCode || 0)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        reject({
          statusCode: res.statusCode,
          data: res.data,
          errMsg: `HTTP ${res.statusCode}`
        })
      },
      fail(err) {
        reject(err)
      },
      complete() {
        console.info(`[API] ${String(method).toUpperCase()} ${url} ${Date.now() - startedAt}ms statusCode=${statusCode || 'NETWORK_ERROR'}`)
        if (loading) wx.hideLoading()
      }
    })
  })
}

function queryProduct(productCode) {
  return request({
    url: '/products/query',
    method: 'POST',
    data: { product_code: productCode },
    loading: true
  })
}

function verifyProduct(code) {
  return request({
    url: '/products/verify',
    method: 'GET',
    data: { code }
  })
}

function searchProducts(params = {}) {
  return request({
    url: '/products/search',
    method: 'GET',
    data: params
  })
}

function getBankList() {
  return request({
    url: '/products/banks',
    method: 'GET'
  })
}

function getProductExamples() {
  return request({
    url: '/products/example',
    method: 'GET'
  })
}

module.exports = {
  request,
  baseUrl,
  normalizeBaseUrl,
  isAiRequest,
  AI_TIMEOUT,
  queryProduct,
  verifyProduct,
  searchProducts,
  getBankList,
  getProductExamples
}
