const app = getApp()
const { DEFAULT_CITY, DEFAULT_LOCATION } = require('../../utils/mapConfig.js')

const EARTH_RADIUS = 6371000
const USER_MARKER_SIZE = 34
const PLACE_MARKER_SIZE = 30
const DEFAULT_DIALOG_LEFT = 40
const DEFAULT_DIALOG_TOP = 620
const DIALOG_WIDTH = 660
const DIALOG_HEIGHT = 520
let guideRecorderManager = null
let guideRecordTimer = null

try {
  guideRecorderManager = wx.getRecorderManager ? wx.getRecorderManager() : null
} catch (e) {
  guideRecorderManager = null
}

const CATEGORY_LIST = [
  { key: 'bank', label: '金融网点', keyword: '银行' },
  { key: 'pharmacy', label: '药店', keyword: '药店' },
  { key: 'hospital', label: '医院', keyword: '医院' },
  { key: 'community', label: '社区服务', keyword: '社区服务中心' }
]

function currentCategory(key) {
  return CATEGORY_LIST.find(item => item.key === key) || CATEGORY_LIST[0]
}

function categoryFromText(text) {
  const raw = decodeURIComponent(String(text || '')).trim()
  if (!raw) return 'bank'
  if (/医院|医疗|卫生|看病/.test(raw)) return 'hospital'
  if (/药店|药房|买药/.test(raw)) return 'pharmacy'
  if (/社区|养老|服务/.test(raw)) return 'community'
  if (/银行|金融|网点/.test(raw)) return 'bank'
  const matched = CATEGORY_LIST.find(item => item.key === raw || item.label === raw || item.keyword === raw)
  return matched ? matched.key : 'bank'
}

function toRad(value) {
  return Number(value) * Math.PI / 180
}

function distanceMeters(from, to) {
  if (!from || !to) return 0
  const lat1 = Number(from.latitude)
  const lng1 = Number(from.longitude)
  const lat2 = Number(to.latitude || to.lat)
  const lng2 = Number(to.longitude || to.lng)
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2)
  return Math.round(EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function distanceText(value) {
  const n = Number(String(value || '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return '附近'
  return n >= 1000 ? `约${(n / 1000).toFixed(1)}公里` : `约${Math.round(n)}米`
}

function mapPlace(item, index, category, currentLocation) {
  const loc = item.location || {}
  const latitude = Number(loc.lat || item.latitude || item.lat)
  const longitude = Number(loc.lng || item.longitude || item.lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const distance = item._distance || item.distance || distanceMeters(currentLocation, { latitude, longitude })
  return {
    id: String(item.id || `${category.key}_${index}_${latitude}_${longitude}`),
    markerId: index + 2,
    title: item.title || item.name || `${category.label}${index + 1}`,
    address: item.address || '暂无详细地址',
    phone: item.tel || item.phone || '',
    location: { lat: latitude, lng: longitude },
    category: category.label,
    distanceText: distanceText(distance),
    distanceValue: Number(distance || 0),
    source: item.source || 'backend_lbs',
    note: item.source === 'local_fallback'
      ? '实时地点暂时没有刷新成功，请出发前在微信地图中再次核对。'
      : '出发前先核对地点名称和地址，遇到不确定可以问小享。'
  }
}

Page({
  data: {
    globalFontPageClass: 'font-global-normal',
    categoryList: CATEGORY_LIST,
    currentCategory: 'bank',
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude,
    currentAddress: DEFAULT_LOCATION.address || DEFAULT_CITY,
    locating: false,
    loadingPlaces: false,
    places: [],
    markers: [],
    activePlaceId: '',
    activeMarkerId: 0,
    scrollIntoView: '',
    addressInput: '',
    locationSource: '',
    statusText: '请允许定位，或手动选择位置，小享会帮您查找附近常用服务点。',
    sourceText: '',
    mapScale: 15,

    showGuideDialog: false,
    guideDialogMinimized: false,
    guideDragging: false,
    guideRecording: false,
    guideRecordingSeconds: 0,
    guideInput: '',
    guideMessages: [],
    selectedGuidePlace: null,
    dialogLeft: DEFAULT_DIALOG_LEFT,
    dialogTop: DEFAULT_DIALOG_TOP,
    defaultDialogLeft: DEFAULT_DIALOG_LEFT,
    defaultDialogTop: DEFAULT_DIALOG_TOP,
    dragStartX: 0,
    dragStartY: 0,
    dragStartLeft: DEFAULT_DIALOG_LEFT,
    dragStartTop: DEFAULT_DIALOG_TOP,
    screenWidthRpx: 750,
    screenHeightRpx: 1334
  },

  onLoad(options = {}) {
    this.syncGlobalFont()
    this.initScreenInfo()
    this.initGuideVoice()
    const category = categoryFromText(options.category || options.type || options.keyword || '')
    this.setData({
      currentCategory: category,
      markers: this.buildMarkers([], DEFAULT_LOCATION)
    })
    this.getMyLocation()
  },

  onShow() {
    this.syncGlobalFont()
  },

  onUnload() {
    if (guideRecordTimer) {
      clearInterval(guideRecordTimer)
      guideRecordTimer = null
    }
    if (this.data.guideRecording && guideRecorderManager) {
      guideRecorderManager.stop()
    }
  },

  initScreenInfo() {
    try {
      const info = wx.getSystemInfoSync()
      const ratio = 750 / Number(info.windowWidth || 375)
      this.setData({
        screenWidthRpx: 750,
        screenHeightRpx: Math.round(Number(info.windowHeight || 667) * ratio)
      })
    } catch (e) {}
  },

  syncGlobalFont() {
    if (app.getGlobalFontSetting) {
      const font = app.getGlobalFontSetting()
      this.setData({ globalFontPageClass: font.pageClass })
    }
  },

  getMyLocation() {
    if (this.data.locating) return
    this.setData({
      locating: true,
      statusText: '正在获取所在区域，不需要非常精确，小享会按附近区域查找服务。'
    })
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 10000,
      success: (res) => {
        const location = {
          latitude: Number(res.latitude),
          longitude: Number(res.longitude),
          address: '当前位置'
        }
        this.applyLocation(location, '已定位到当前区域，正在查找附近服务。', 'getLocation')
        this.reverseGeocode(location)
      },
      fail: (err) => {
        this.setData({ locating: false })
        const msg = String(err && (err.errMsg || err.message || ''))
        if (/timeout/i.test(msg)) {
          this.locateByIp('定位超时，已改用所在城市区域查找附近服务。')
          return
        }
        wx.showModal({
          title: '需要定位权限',
          content: '请允许定位，才能为您查找附近银行、医院、药店和社区服务点。也可以手动选择位置。',
          confirmText: '去设置',
          cancelText: '手动选择',
          success: (res) => {
            if (res.confirm && wx.openSetting) {
              wx.openSetting({
                success: (setting) => {
                  const auth = setting.authSetting || {}
                  if (auth['scope.userLocation']) {
                    this.getMyLocation()
                  } else {
                    this.locateByIp('还没有开启定位，已改用所在城市区域。')
                  }
                },
                fail: () => this.locateByIp('无法打开设置，已改用所在城市区域。')
              })
            } else {
              this.chooseLocation()
            }
          },
          fail: () => this.locateByIp('定位未开启，已改用所在城市区域。')
        })
      }
    })
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        const latitude = Number(res.latitude)
        const longitude = Number(res.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          this.locateByIp('选择的位置缺少坐标，已改用所在城市区域。')
          return
        }
        this.applyLocation({
          latitude,
          longitude,
          address: res.address || res.name || '手动选择的位置'
        }, res.name ? `已选择：${res.name}` : '已选择地图位置，正在查找附近服务。', 'chooseLocation')
      },
      fail: () => wx.showToast({ title: '没有选择位置', icon: 'none' })
    })
  },

  useDefaultLocation(message) {
    this.applyLocation(DEFAULT_LOCATION, message || '已使用默认城市位置查找附近服务。', 'default')
  },

  locateByIp(message) {
    this.setData({
      locating: true,
      statusText: message || '正在按所在城市区域查找附近服务。'
    })
    app.request({
      url: '/lbs/ip-location',
      loading: false
    }).then(res => {
      const loc = (res && res.location) || {}
      const latitude = Number(loc.latitude || loc.lat)
      const longitude = Number(loc.longitude || loc.lng)
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        this.applyLocation({
          latitude,
          longitude,
          address: res.address || DEFAULT_CITY
        }, message || '已按所在城市区域查找附近服务。', 'ip')
      } else {
        this.useDefaultLocation(message || '暂时无法获取所在区域，已使用默认城市位置。')
      }
    }).catch(() => this.useDefaultLocation(message || '暂时无法获取所在区域，已使用默认城市位置。'))
  },

  applyLocation(location, message, source = 'location') {
    const latitude = Number(location.latitude)
    const longitude = Number(location.longitude)
    const nextLocation = {
      latitude: Number.isFinite(latitude) ? latitude : DEFAULT_LOCATION.latitude,
      longitude: Number.isFinite(longitude) ? longitude : DEFAULT_LOCATION.longitude,
      address: location.address || DEFAULT_CITY
    }
    this.setData({
      latitude: nextLocation.latitude,
      longitude: nextLocation.longitude,
      currentAddress: nextLocation.address,
      locating: false,
      activePlaceId: '',
      activeMarkerId: 0,
      locationSource: source,
      statusText: message || '正在查找附近服务。',
      markers: this.buildMarkers([], nextLocation)
    })
    if (['getLocation', 'chooseLocation', 'address'].includes(source)) this.saveAuthorizedLocation(nextLocation, source)
    this.searchNearby(this.data.currentCategory)
  },

  saveAuthorizedLocation(location, source) {
    if (!wx.getStorageSync('token')) return
    app.request({
      url: '/profile/location',
      method: 'POST',
      data: {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        address: location.address || this.data.currentAddress || '已授权位置',
        source: source || 'user_authorized'
      },
      loading: false
    }).catch(() => {})
  },

  reverseGeocode(location) {
    app.request({
      url: '/lbs/reverse-geocode',
      data: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      loading: false
    }).then(res => {
      if (res && res.address) {
        this.setData({ currentAddress: res.address })
        this.saveAuthorizedLocation({ latitude: location.latitude, longitude: location.longitude, address: res.address }, 'getLocation')
      }
    }).catch(() => {})
  },

  switchCategory(e) {
    const key = e.currentTarget.dataset.key || 'bank'
    this.setData({
      currentCategory: key,
      activePlaceId: '',
      activeMarkerId: 0
    })
    this.searchNearby(key)
  },

  onAddressInput(e) {
    this.setData({ addressInput: e.detail.value })
  },

  searchAddress() {
    const address = String(this.data.addressInput || '').trim()
    if (!address) {
      wx.showToast({ title: '请输入街道、小区或城市地址', icon: 'none' })
      return
    }
    app.request({
      url: '/lbs/geocode',
      data: { address },
      loading: false
    }).then(res => {
      const loc = (res && res.location) || {}
      const latitude = Number(loc.latitude || loc.lat)
      const longitude = Number(loc.longitude || loc.lng)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        wx.showToast({ title: '这个地址暂时没有坐标', icon: 'none' })
        return
      }
      this.applyLocation({
        latitude,
        longitude,
        address: res.address || address
      }, `已定位到：${res.address || address}`, 'address')
    }).catch(() => wx.showToast({ title: '地址解析服务暂不可用', icon: 'none' }))
  },

  searchNearby(categoryKey) {
    const category = currentCategory(categoryKey)
    const currentLocation = { latitude: this.data.latitude, longitude: this.data.longitude }
    const radius = this.data.locationSource === 'getLocation' ? 5000 : 12000
    this.setData({
      loadingPlaces: true,
      sourceText: '',
      statusText: `正在查找附近${category.label}。`
    })
    app.request({
      url: '/lbs/nearby',
      data: {
        type: category.key,
        keyword: category.keyword,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        city: DEFAULT_CITY,
        radius
      },
      loading: false
    }).then(payload => {
      const places = ((payload && payload.items) || [])
        .map((item, index) => mapPlace(item, index, category, currentLocation))
        .filter(Boolean)
      if (!places.length) {
        this.setData({
          places: [],
          markers: this.buildMarkers([], currentLocation),
          loadingPlaces: false,
          sourceText: payload && payload.source ? payload.source : '',
          statusText: (payload && payload.message) || `当前区域暂无搜索到的${category.label}，可扩大地址范围后重试。`
        })
        return
      }
      this.setData({
        places,
        markers: this.buildMarkers(places, currentLocation),
        loadingPlaces: false,
        statusText: `已找到附近${category.label}，可查看地图、导航或问小享指路。`,
        sourceText: payload.source === 'tencent_map' ? '腾讯地图实时搜索' : (payload.source || '后端位置服务')
      })
    }).catch(() => {
      this.setData({
        places: [],
        markers: this.buildMarkers([], currentLocation),
        loadingPlaces: false,
        sourceText: '',
        statusText: '附近服务暂时无法读取，请检查网络或稍后重试。'
      })
    })
  },

  buildMarkers(places, currentLocation) {
    const markers = [{
      id: 1,
      latitude: Number(currentLocation.latitude),
      longitude: Number(currentLocation.longitude),
      title: '当前位置',
      width: USER_MARKER_SIZE,
      height: USER_MARKER_SIZE,
      callout: {
        content: '当前位置',
        display: 'ALWAYS',
        padding: 8,
        borderRadius: 8,
        bgColor: '#fff8ec',
        color: '#5d3a08'
      }
    }]
    ;(places || []).forEach((item, index) => {
      markers.push({
        id: Number(item.markerId || index + 2),
        latitude: Number(item.location.lat),
        longitude: Number(item.location.lng),
        title: item.title,
        width: PLACE_MARKER_SIZE,
        height: PLACE_MARKER_SIZE,
        callout: {
          content: item.title,
          display: this.data.activeMarkerId === (item.markerId || index + 2) ? 'ALWAYS' : 'BYCLICK',
          padding: 8,
          borderRadius: 8,
          bgColor: '#fff8ec',
          color: '#5d3a08'
        }
      })
    })
    return markers
  },

  onMarkerTap(e) {
    const markerId = Number(e.markerId)
    if (markerId === 1) return
    const place = (this.data.places || []).find(item => Number(item.markerId) === markerId)
    if (!place) return
    this.setData({
      activeMarkerId: markerId,
      activePlaceId: place.id,
      scrollIntoView: `place-${place.id}`,
      markers: this.buildMarkers(this.data.places, { latitude: this.data.latitude, longitude: this.data.longitude })
    })
  },

  openNavigate(e) {
    const item = this.findPlace(e.currentTarget.dataset.id)
    if (!item || !item.location) {
      wx.showToast({ title: '该地点缺少坐标，请重新选择地点。', icon: 'none' })
      return
    }
    const latitude = Number(item.location.lat || item.latitude || item.lat)
    const longitude = Number(item.location.lng || item.longitude || item.lng)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      wx.showToast({ title: '该地点缺少坐标，请重新选择地点。', icon: 'none' })
      return
    }
    wx.openLocation({
      latitude,
      longitude,
      name: item.title || '附近服务点',
      address: item.address || '',
      scale: 18,
      fail: () => wx.showModal({
        title: '请在手机上打开导航',
        content: '当前位置或目的地暂时无法交给微信地图，请重新定位后再试。',
        showCancel: false
      })
    })
  },

  drawRoute(e) {
    this.openGuideDialogById(e.currentTarget.dataset.id)
  },

  askXiaoXiang(e) {
    this.openGuideDialogById(e.currentTarget.dataset.id)
  },

  openGuideDialogById(id) {
    const item = this.findPlace(id)
    if (!item) return
    this.openGuideDialog(item)
  },

  openGuideDialog(item) {
    const nearbyNames = (this.data.places || [])
      .filter(place => place.id !== item.id)
      .slice(0, 2)
      .map(place => place.title)
      .join('、')
    const lines = [
      `已经为您选中 ${item.title}。`,
      item.address ? `地址：${item.address}` : '',
      item.distanceText ? `距离：${item.distanceText}` : '',
      '您可以点“打开导航”进入微信地图导航。',
      '出门前请确认手机电量、证件和随身药品。',
      nearbyNames ? `附近还可以考虑：${nearbyNames}。` : ''
    ].filter(Boolean)
    const guideMessages = [{
      id: `g_${Date.now()}`,
      role: 'assistant',
      sender: '小享',
      text: lines.join('\n')
    }]
    this.setData({
      showGuideDialog: true,
      guideDialogMinimized: false,
      guideDragging: false,
      selectedGuidePlace: item,
      guideInput: '',
      guideMessages,
      dialogLeft: this.data.defaultDialogLeft || DEFAULT_DIALOG_LEFT,
      dialogTop: this.data.defaultDialogTop || DEFAULT_DIALOG_TOP
    })
  },

  closeGuideDialog() {
    this.setData({
      showGuideDialog: false,
      guideDialogMinimized: false,
      guideDragging: false,
      guideRecording: false,
      dialogLeft: this.data.defaultDialogLeft || DEFAULT_DIALOG_LEFT,
      dialogTop: this.data.defaultDialogTop || DEFAULT_DIALOG_TOP
    })
  },

  initGuideVoice() {
    if (!guideRecorderManager || this._guideVoiceReady) return
    this._guideVoiceReady = true
    guideRecorderManager.onStop((res) => {
      if (guideRecordTimer) {
        clearInterval(guideRecordTimer)
        guideRecordTimer = null
      }
      this.setData({ guideRecording: false, guideRecordingSeconds: 0 })
      if (res && res.tempFilePath) {
        this.uploadGuideVoice(res.tempFilePath)
      }
    })
    guideRecorderManager.onError(() => {
      if (guideRecordTimer) {
        clearInterval(guideRecordTimer)
        guideRecordTimer = null
      }
      this.setData({ guideRecording: false, guideRecordingSeconds: 0 })
      wx.showToast({ title: '录音失败，请改用文字输入', icon: 'none' })
    })
  },

  startGuideVoice() {
    if (!guideRecorderManager) {
      wx.showToast({ title: '当前设备不支持语音输入', icon: 'none' })
      return
    }
    if (this.data.guideRecording) return

    wx.getSetting({
      success: (settingRes) => {
        const auth = settingRes.authSetting || {}
        if (auth['scope.record'] === false) {
          wx.showModal({
            title: '需要麦克风权限',
            content: '您之前拒绝了麦克风权限，请在右上角「设置 > 权限管理」中开启麦克风。',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) wx.openSetting()
            }
          })
          return
        }
        // 已授权 → 直接开始录音
        if (auth['scope.record'] === true) {
          this.setData({ guideRecording: true, guideRecordingSeconds: 0 })
          guideRecorderManager.start({
            duration: 30000,
            sampleRate: 16000,
            numberOfChannels: 1,
            encodeBitRate: 48000,
            format: 'wav'
          })
          guideRecordTimer = setInterval(() => {
            const seconds = this.data.guideRecordingSeconds + 1
            this.setData({ guideRecordingSeconds: seconds })
            if (seconds >= 28 && guideRecorderManager) guideRecorderManager.stop()
          }, 1000)
          return
        }
        // 未询问 → 发起授权
        wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({ guideRecording: true, guideRecordingSeconds: 0 })
        guideRecorderManager.start({
          duration: 30000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'wav'
        })
        guideRecordTimer = setInterval(() => {
          const seconds = this.data.guideRecordingSeconds + 1
          this.setData({ guideRecordingSeconds: seconds })
          if (seconds >= 28 && guideRecorderManager) guideRecorderManager.stop()
        }, 1000)
      },
      fail: (authErr) => {
            console.error('[语音] authorize失败:', JSON.stringify(authErr))
            this.setData({ guideRecording: false, guideRecordingSeconds: 0 })
            wx.showModal({
              title: '需要麦克风权限',
              content: '请在右上角「设置 > 权限管理」中开启麦克风权限。',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) wx.openSetting()
              }
            })
          }
        })
      },
      fail: () => {
        wx.authorize({
          scope: 'scope.record',
          success: () => {
            this.setData({ guideRecording: true, guideRecordingSeconds: 0 })
            guideRecorderManager.start({
              duration: 30000,
              sampleRate: 16000,
              numberOfChannels: 1,
              encodeBitRate: 48000,
              format: 'wav'
            })
            guideRecordTimer = setInterval(() => {
              const seconds = this.data.guideRecordingSeconds + 1
              this.setData({ guideRecordingSeconds: seconds })
              if (seconds >= 28 && guideRecorderManager) guideRecorderManager.stop()
            }, 1000)
          },
          fail: () => {
            this.setData({ guideRecording: false, guideRecordingSeconds: 0 })
            wx.showModal({ title: '需要麦克风权限', content: '请在设置中开启麦克风权限。', showCancel: false })
          }
        })
      }
    })
  },

  stopGuideVoice() {
    if (!this.data.guideRecording || !guideRecorderManager) return
    if (guideRecordTimer) {
      clearInterval(guideRecordTimer)
      guideRecordTimer = null
    }
    guideRecorderManager.stop()
  },

  uploadGuideVoice(filePath) {
    const baseUrl = (app.globalData && app.globalData.baseUrl) || 'https://yixiangzhicai.com'
    const token = wx.getStorageSync('token') || ''
    const thinkingId = `v_${Date.now()}`
    this.setData({
      guideMessages: this.data.guideMessages.concat({
        id: thinkingId,
        role: 'assistant',
        sender: '小享',
        text: '小享正在识别语音...'
      })
    })
    wx.uploadFile({
      url: baseUrl + '/assistant/voice-to-text?format=wav',
      timeout: 70000,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (uploadRes) => {
        let data = {}
        try { data = JSON.parse(uploadRes.data || '{}') } catch (e) {}
        const text = String(data.text || '').trim()
        if (text) {
          this.replaceGuideMessage(thinkingId, `已识别：${text}`)
          this.setData({ guideInput: text })
        } else {
          this.replaceGuideMessage(thinkingId, data.message || '语音暂时没有识别清楚，请改用文字输入。')
        }
      },
      fail: () => this.replaceGuideMessage(thinkingId, '语音上传失败，请改用文字输入。')
    })
  },

  chooseGuideImage() {
    const upload = (filePath) => this.analyzeGuideImage(filePath)
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const file = (res.tempFiles || [])[0]
          if (file && file.tempFilePath) upload(file.tempFilePath)
        }
      })
      return
    }
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = (res.tempFilePaths || [])[0]
        if (filePath) upload(filePath)
      }
    })
  },

  analyzeGuideImage(filePath) {
    const fs = wx.getFileSystemManager && wx.getFileSystemManager()
    if (!fs) {
      wx.showToast({ title: '当前设备暂不支持图片读取', icon: 'none' })
      return
    }
    const place = this.data.selectedGuidePlace || {}
    const userMsg = { id: `img_${Date.now()}`, role: 'user', sender: '我', text: '发了一张图片，请小享结合目的地帮忙看。' }
    const thinkingId = `img_a_${Date.now()}`
    this.setData({
      guideMessages: this.data.guideMessages.concat(userMsg, {
        id: thinkingId,
        role: 'assistant',
        sender: '小享',
        text: '小享正在看图片...'
      })
    })
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        this.requestAssistantImage({
          image_base64: res.data,
          text: `附近服务指路。目的地：${place.title || ''}，地址：${place.address || ''}。请结合图片给出老人能懂的操作建议。`,
          scene: 'nearby_navigation_image'
        }).then(answer => {
          this.replaceGuideMessage(thinkingId, answer || '图片已收到。请继续点“打开导航”，出门前核对地点名称和地址。')
        }).catch(() => {
          this.replaceGuideMessage(thinkingId, '图片识别暂不可用。请直接输入您想问的路线问题。')
        })
      },
      fail: () => this.replaceGuideMessage(thinkingId, '图片读取失败，请换一张图片或改用文字输入。')
    })
  },

  toggleGuideMinimize() {
    this.setData({ guideDialogMinimized: !this.data.guideDialogMinimized })
  },

  onGuideInput(e) {
    this.setData({ guideInput: e.detail.value })
  },

  sendGuideQuestion() {
    const content = String(this.data.guideInput || '').trim()
    if (!content) {
      wx.showToast({ title: '请先输入想问的问题', icon: 'none' })
      return
    }
    const place = this.data.selectedGuidePlace || {}
    const userMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      sender: '我',
      text: content
    }
    const thinking = {
      id: `a_${Date.now()}`,
      role: 'assistant',
      sender: '小享',
      text: '小享正在帮您整理指路建议...'
    }
    this.setData({
      guideInput: '',
      guideMessages: this.data.guideMessages.concat(userMsg, thinking)
    })
    const prompt = [
      '请用适合长辈听懂的话回答附近服务指路问题。',
      `目的地：${place.title || ''}`,
      `地址：${place.address || ''}`,
      `距离：${place.distanceText || ''}`,
      `分类：${place.category || ''}`,
      `当前位置：${this.data.currentAddress}`,
      `用户问题：${content}`,
      '不要输出复杂路线坐标，不要让用户打开外部 scheme。可以提醒用户点击页面里的“打开导航”。'
    ].join('\n')
    this.requestAssistant(prompt, {
      scene: 'nearby_navigation',
      place,
      current_location: {
        latitude: this.data.latitude,
        longitude: this.data.longitude,
        address: this.data.currentAddress
      }
    }).then(answer => {
      this.replaceGuideMessage(thinking.id, answer || this.localGuideAnswer(place, content))
    }).catch(() => {
      this.replaceGuideMessage(thinking.id, this.localGuideAnswer(place, content))
    })
  },

  requestAssistant(message, context) {
    if (app.request) {
      return app.request({
        url: '/assistant/chat',
        method: 'POST',
        loading: false,
        data: {
          session_id: `nearby_${Date.now()}`,
          message,
          scene: 'nearby_navigation',
          mode: 'nearby_navigation',
          context
        }
      }).then(res => res.reply || res.answer || '')
    }
    return Promise.reject(new Error('request_unavailable'))
  },

  requestAssistantImage(payload) {
    return app.request({
      url: '/assistant/multimodal-analyze',
      method: 'POST',
      loading: false,
      data: payload
    }).then(res => res.answer || res.reply || res.extracted_text || '')
  },

  replaceGuideMessage(id, text) {
    const guideMessages = (this.data.guideMessages || []).map(item => {
      if (item.id === id) return { ...item, text }
      return item
    })
    this.setData({ guideMessages })
  },

  localGuideAnswer(place, question) {
    const ask = String(question || '')
    if (/远|多久|时间/.test(ask)) {
      return `从当前区域到 ${place.title || '这个地点'} 大约是 ${place.distanceText || '附近'}。实际时间要以微信地图导航为准，出门前请先看天气和路况。`
    }
    if (/安全|老人|自己/.test(ask)) {
      return `如果是老人自己去，建议先确认目的地名称和地址，手机保持有电，必要时把行程告诉家人。到达前不要给陌生人转账或出示验证码。`
    }
    if (/电话|联系/.test(ask)) {
      return place.phone ? `这个地点有电话：${place.phone}。您可以先电话确认营业时间和要带的材料。` : '这个地点暂时没有电话，建议点“打开导航”进入微信地图查看详情。'
    }
    return `您可以先点“打开导航”，用微信地图带路去 ${place.title || '这个地点'}。出门前确认手机电量、身份证件、医保卡或银行卡是否带齐。`
  },

  openGuideNavigation() {
    const place = this.data.selectedGuidePlace
    if (!place) return
    this.openNavigate({ currentTarget: { dataset: { id: place.id } } })
  },

  guideDragStart(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return
    this.setData({
      guideDragging: true,
      dragStartX: touch.clientX,
      dragStartY: touch.clientY,
      dragStartLeft: this.data.dialogLeft,
      dragStartTop: this.data.dialogTop
    })
  },

  guideDragMove(e) {
    if (!this.data.guideDragging) return
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const left = this.data.dragStartLeft + (touch.clientX - this.data.dragStartX) * 2
    const top = this.data.dragStartTop + (touch.clientY - this.data.dragStartY) * 2
    const maxLeft = Math.max(16, this.data.screenWidthRpx - DIALOG_WIDTH - 16)
    const maxTop = Math.max(180, this.data.screenHeightRpx - DIALOG_HEIGHT - 80)
    this.setData({
      dialogLeft: Math.max(16, Math.min(maxLeft, left)),
      dialogTop: Math.max(80, Math.min(maxTop, top))
    })
  },

  guideDragEnd() {
    this.setData({ guideDragging: false })
  },

  findPlace(id) {
    return (this.data.places || []).find(item => String(item.id) === String(id))
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

  // ---- 语音输入：识别后填入地址搜索 ----
  onVoiceResult(e) {
    const text = (e.detail && e.detail.text) || ''
    if (!text) return
    const needle = String(text).trim()
    // 如果包含地点关键词，直接搜索
    if (needle) {
      this.setData({ addressInput: needle })
      wx.showToast({ title: '已识别：' + needle.slice(0, 15), icon: 'none', duration: 1000 })
      // 自动触发搜索
      setTimeout(() => { this.searchAddress() }, 500)
    }
  },
  onVoiceEmpty() {},
  onVoiceError() {}
})
