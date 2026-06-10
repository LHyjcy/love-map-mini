const api = require('../../utils/api.js')

function formatDistance(m) {
  if (m == null) return ''
  if (m < 1000) return Math.round(m) + ' m'
  return (m / 1000).toFixed(2) + ' km'
}

function shareScopeLabel(scope) {
  if (scope === 'self') return '仅自己'
  if (scope === 'partner' || scope === 'memory') return '已共享'
  return scope || ''
}

Page({
  data: {
    ready: false,
    loading: false,
    loggedIn: false,
    bound: false,
    checkingIn: false,
    creatingCoMemory: false,
    checkins: [],
    partner: null,
    distanceText: '',
    coCandidate: null,
    // 隐私默认：共享范围默认为「仅自己」（shareIndex 0 -> 'self'）
    shareIndex: 0,
    shareLabels: ['仅自己', '共享给对方'],
    shareValues: ['self', 'partner']
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      return
    }
    this.setData({ ready: true, loggedIn: true })
    this.load()
  },

  onPullDownRefresh() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      wx.stopPullDownRefresh()
      return
    }
    this.setData({ ready: true, loggedIn: true })
    this.load(() => wx.stopPullDownRefresh())
  },

  load(done) {
    this.setData({ loading: true })
    const tasks = [this.loadCheckins(), this.loadPartner(), this.loadCoCandidate()]
    Promise.all(tasks).then(() => {
      this.setData({ loading: false })
      if (typeof done === 'function') done()
    })
  },

  loadCheckins() {
    return api.get('/api/checkins').then((res) => {
      const checkins = (res && res.checkins ? res.checkins : []).map((c) => ({
        id: c.id,
        latitude: c.latitude,
        longitude: c.longitude,
        shareScope: c.shareScope,
        shareLabel: shareScopeLabel(c.shareScope),
        createdAt: c.createdAt
      }))
      this.setData({ bound: true, checkins })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false })
      } else {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
      }
    })
  },

  loadPartner() {
    return api.get('/api/checkins/partner-latest').then((res) => {
      const partner = res && res.checkin ? res.checkin : null
      const distanceMeters = res ? res.distanceMeters : null
      const distanceText = formatDistance(distanceMeters)
      this.setData({ bound: true, partner, distanceText })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false })
      } else {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
      }
    })
  },

  loadCoCandidate() {
    return api.get('/api/co-checkin').then((res) => {
      const candidate = res && res.candidate ? res.candidate : null
      this.setData({ coCandidate: candidate })
    }).catch(() => {
      // On error or NO_ACTIVE_COUPLE, silently hide the co-checkin card.
      this.setData({ coCandidate: null })
    })
  },

  onShareChange(e) {
    this.setData({ shareIndex: Number(e.detail.value) })
  },

  doCheckin() {
    if (this.data.checkingIn) return
    this.setData({ checkingIn: true })
    const that = this
    wx.getLocation({
      type: 'gcj02',
      success(loc) {
        const shareScope = that.data.shareValues[that.data.shareIndex]
        const body = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          shareScope
        }
        if (shareScope === 'partner') {
          body.shareTtlMinutes = 120
        }
        api.post('/api/checkins', body).then(() => {
          wx.showToast({ title: '已打卡' })
          that.load()
        }).catch((err) => {
          wx.showToast({ title: (err && err.message) || '打卡失败', icon: 'none' })
        }).then(() => {
          that.setData({ checkingIn: false })
        })
      },
      fail() {
        wx.showToast({ title: '获取位置失败，请检查定位权限', icon: 'none' })
        that.setData({ checkingIn: false })
      }
    })
  },

  refreshPartner() {
    this.loadPartner()
  },

  goBind() {
    wx.switchTab({ url: '/pages/me/me' })
  },

  createCoMemory() {
    const candidate = this.data.coCandidate
    if (!candidate) return
    if (this.data.creatingCoMemory) return

    if (candidate.placeId == null) {
      wx.showToast({ title: '请先为该地点创建地点信息', icon: 'none' })
      wx.navigateTo({ url: '/pages/addPlace/addPlace' })
      return
    }

    this.setData({ creatingCoMemory: true })
    api.post('/api/memories', {
      placeId: candidate.placeId,
      title: '共同打卡回忆',
      mood: '甜蜜'
    }).then((data) => {
      wx.showToast({ title: '已生成共同回忆' })
      const id = data && data.memory ? data.memory.id : null
      if (id != null) {
        wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + id })
      }
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '生成失败', icon: 'none' })
    }).then(() => {
      this.setData({ creatingCoMemory: false })
    })
  }
})
