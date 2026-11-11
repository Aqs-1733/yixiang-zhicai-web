function uploadFile(url, filePath, name) {
  const app = getApp()
  const token = wx.getStorageSync('token') || ''
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: app.globalData.baseUrl + url,
      filePath,
      name: name || 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success(res) {
        try { resolve(JSON.parse(res.data)) } catch (e) { reject(e) }
      },
      fail: reject
    })
  })
}

module.exports = { uploadFile }
