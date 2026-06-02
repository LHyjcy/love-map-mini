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
    loggedIn: false,
    bound: false,
    checkins: [],
    partner: null,
    distanceText: '',
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

  load() {
    this.loadCheckins()
    this.loadPartner()
  },

  loadCheckins() {
    api.get('/api/checkins').then((res) => {
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
    api.get('/api/checkins/partner-latest').then((res) => {
      const partner = res && res.checkin ? res.checkin : null
      const distanceText = formatDistance(res ? res.distanceMeters : null)
      this.setData({ bound: true, partner, distanceText })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false })
      } else {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
      }
    })
  },

  onShareChange(e) {
    this.setData({ shareIndex: Number(e.detail.value) })
  },

  doCheckin() {
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
        })
      },
      fail() {
        wx.showToast({ title: '获取位置失败', icon: 'none' })
      }
    })
  },

  refreshPartner() {
    this.loadPartner()
  },

  goBind() {
    wx.switchTab({ url: '/pages/me/me' })
  }
})
