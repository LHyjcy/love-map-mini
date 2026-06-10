// pages/location/index — 临时位置共享。
// 隐私：仅用户主动开启的临时共享；强制过期；可随时停止；仅前台定位（wx.startLocationUpdate，
// 非后台版）；上传节流（10s/30m，低精度不传）；位置更新不调用逆地址。
// 伴侣位置：WebSocket 实时，断开降级轮询 GET /api/location/partner/latest。
const api = require('../../utils/api.js')
const throttle = require('../../utils/throttle.js')
const wsUtil = require('../../utils/ws.js')

const PRIVACY_TEXT =
  '我们不会默认后台持续追踪你的位置。只有你主动开启临时共享后，TA 才能看到你的最近位置。' +
  '共享会在到期后自动关闭，你也可以随时手动关闭。'

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    privacyText: PRIVACY_TEXT,
    sharing: false,
    sessionId: '',
    expiresText: '',
    partnerSharing: false,
    partnerUpdatedText: '',
    distanceText: '',
    accuracyHint: '',
    latitude: 39.908,
    longitude: 116.397,
    markers: []
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      return
    }
    this.setData({ loggedIn: true })
    this.loadStatus()
  },

  onHide() { this.teardown() },
  onUnload() { this.teardown() },

  // 离开页面：停止前台定位、关闭 WS、清轮询（会话仍在服务端，按到期/手动停止）。
  teardown() {
    this.stopLocationUpdates()
    if (this._ws) { try { this._ws.close() } catch (e) {} this._ws = null }
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  loadStatus() {
    api.get('/api/location/status').then((data) => {
      const mine = data && data.mine
      const partner = (data && data.partner) || {}
      this.setData({
        sharing: !!mine,
        sessionId: mine ? mine.id : '',
        expiresText: mine && mine.expiresAt ? String(mine.expiresAt).slice(0, 16).replace('T', ' ') : '',
        partnerSharing: !!partner.sharing,
        bound: true,
        ready: true
      })
      // 若我仍在共享，恢复前台定位上报。
      if (mine) this.beginLocationUpdates()
      // 启动伴侣位置订阅（WS + 轮询兜底）。
      this.subscribePartner()
      this.refreshPartner()
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  // 开启共享：30 分钟 / 2 小时。防止双击重复创建会话。
  startShare(e) {
    if (this._busy) return
    const minutes = Number(e.currentTarget.dataset.minutes) || 30
    this._busy = true
    api.post('/api/location/share-session', { durationMinutes: minutes }).then((data) => {
      const session = (data && data.session) || {}
      this.setData({
        sharing: true,
        sessionId: session.id || '',
        expiresText: session.expiresAt ? String(session.expiresAt).slice(0, 16).replace('T', ' ') : ''
      })
      wx.showToast({ title: '已开启共享', icon: 'success' })
      this.beginLocationUpdates()
      this.subscribePartner()
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '开启失败', icon: 'none' })
    }).then(() => { this._busy = false })
  },

  // 停止共享。防止双击重复请求。
  stopShare() {
    if (this._busy) return
    const id = this.data.sessionId
    if (!id) {
      this.stopLocationUpdates()
      this.setData({ sharing: false, expiresText: '' })
      return
    }
    this._busy = true
    api.post('/api/location/share-session/' + id + '/stop', {}).then(() => {
      this.stopLocationUpdates()
      this.setData({ sharing: false, sessionId: '', expiresText: '' })
      wx.showToast({ title: '已停止共享', icon: 'none' })
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '停止失败', icon: 'none' })
    }).then(() => { this._busy = false })
  },

  // 开启前台定位监听（GCJ-02），节流后上报。
  // 仅前台定位（非后台版）；用户拒绝授权时友好提示去设置，不崩溃。
  beginLocationUpdates() {
    const that = this
    this._last = this._last || null
    wx.startLocationUpdate({
      type: 'gcj02',
      success() { that.setData({ accuracyHint: '' }) },
      fail() { that.handleLocationDenied() }
    })
    if (this._locCb) return // 避免重复绑定
    this._locCb = function (res) { that.onLocationChange(res) }
    wx.onLocationChange(this._locCb)
  },

  // 定位授权失败/被拒：友好引导去开启，不影响服务端已开启的共享会话。
  handleLocationDenied() {
    this.setData({ accuracyHint: '未获得定位权限，暂无法更新你的位置' })
    wx.showModal({
      title: '需要定位权限',
      content: '共享你的位置需要定位权限。请在设置中允许“位置信息”后重试。',
      confirmText: '去设置',
      cancelText: '稍后',
      success(res) {
        if (res.confirm) {
          try { wx.openSetting({}) } catch (e) {}
        }
      }
    })
  },

  stopLocationUpdates() {
    if (this._locCb) { try { wx.offLocationChange(this._locCb) } catch (e) {} this._locCb = null }
    try { wx.stopLocationUpdate() } catch (e) {}
  },

  onLocationChange(res) {
    const cur = { latitude: res.latitude, longitude: res.longitude, accuracy: res.accuracy }
    // 更新「我」的位置展示（不一定上传）。
    this.setMyMarker(cur.latitude, cur.longitude)
    if (typeof cur.accuracy === 'number' && cur.accuracy > throttle.MAX_ACCURACY_M) {
      this.setData({ accuracyHint: '当前定位精度较低（' + Math.round(cur.accuracy) + 'm），暂不上报' })
      return
    }
    const decision = throttle.decideUpload(this._last, cur)
    if (!decision.upload) return
    if (!this.data.sessionId) return

    this._last = { latitude: cur.latitude, longitude: cur.longitude, time: Date.now() }
    this.setData({ accuracyHint: '' })
    api.post('/api/location/points', {
      sessionId: this.data.sessionId,
      latitude: cur.latitude,
      longitude: cur.longitude,
      coordType: 'gcj02',
      accuracy: cur.accuracy,
      clientTime: new Date().toISOString()
    }).catch((err) => {
      // 会话过期/停止：本地同步状态。
      if (err && (err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_INACTIVE')) {
        this.stopLocationUpdates()
        this.setData({ sharing: false, sessionId: '', expiresText: '' })
        wx.showToast({ title: '共享已结束', icon: 'none' })
      }
    })
  },

  // 订阅伴侣位置：WS 实时 + 20s 轮询兜底。
  subscribePartner() {
    const that = this
    const app = getApp()
    const baseUrl = (app && app.globalData && app.globalData.baseUrl) || ''
    if (!this._ws) {
      this._ws = wsUtil.connectLocationWs({
        baseUrl,
        token: api.getToken(),
        onEvent(event, data) {
          if (event === 'partner_location_update' && data) {
            that.applyPartner(data)
          } else if (event === 'partner_location_stopped' || event === 'partner_location_expired') {
            that.clearPartner()
          }
        }
      })
    }
    if (!this._timer) {
      // 轮询兜底：WS 不可用时也能更新。
      this._timer = setInterval(function () { that.refreshPartner() }, 20000)
    }
  },

  refreshPartner() {
    api.get('/api/location/partner/latest').then((data) => {
      if (data && data.sharing && data.latest) {
        this.applyPartner(data.latest)
      } else {
        this.setData({ partnerSharing: !!(data && data.sharing) })
        if (!data || !data.sharing) this.clearPartner()
      }
    }).catch(() => {})
  },

  applyPartner(latest) {
    const lat = Number(latest && latest.latitude)
    const lng = Number(latest && latest.longitude)
    // 坐标无效时仅标记为「共享中」，不渲染标记/距离，避免 NaN。
    if (!isFinite(lat) || !isFinite(lng)) {
      this.setData({ partnerSharing: true })
      return
    }
    const updated = latest.serverTime ? String(latest.serverTime).slice(11, 16) : ''
    let distanceText = ''
    if (this._last && isFinite(this._last.latitude) && isFinite(this._last.longitude)) {
      const m = throttle.haversineMeters(this._last.latitude, this._last.longitude, lat, lng)
      if (isFinite(m)) {
        distanceText = m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m'
      }
    }
    this._partner = { latitude: lat, longitude: lng }
    this.setData({
      partnerSharing: true,
      partnerUpdatedText: updated ? '更新于 ' + updated : '',
      distanceText,
      latitude: lat,
      longitude: lng
    })
    this.rebuildMarkers()
  },

  clearPartner() {
    this._partner = null
    this.setData({ partnerSharing: false, partnerUpdatedText: '', distanceText: '' })
    this.rebuildMarkers()
  },

  setMyMarker(lat, lng) {
    this._me = { latitude: lat, longitude: lng }
    this.rebuildMarkers()
  },

  rebuildMarkers() {
    const markers = []
    if (this._me) {
      markers.push({ id: 0, latitude: this._me.latitude, longitude: this._me.longitude,
        callout: { content: '我', display: 'ALWAYS', padding: 6, borderRadius: 6, bgColor: '#544487', color: '#ffffff' } })
    }
    if (this._partner) {
      markers.push({ id: 1, latitude: this._partner.latitude, longitude: this._partner.longitude,
        callout: { content: 'TA', display: 'ALWAYS', padding: 6, borderRadius: 6, bgColor: '#e6f6ee', color: '#1f6b45' } })
    }
    this.setData({ markers })
  },

  goMe() { wx.switchTab({ url: '/pages/me/me' }) }
})
