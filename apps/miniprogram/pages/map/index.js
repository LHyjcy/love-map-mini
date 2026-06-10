// pages/map/index — 地图首页：足迹统计 + 真实地图 / 足迹地图 / 位置共享 三入口。
const api = require('../../utils/api.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    stats: { provinceCount: 0, cityCount: 0, placeCount: 0, memoryCount: 0 }
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      return
    }
    this.setData({ loggedIn: true })
    this.load()
  },

  onPullDownRefresh() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      wx.stopPullDownRefresh()
      return
    }
    this.setData({ loggedIn: true })
    this.load(() => wx.stopPullDownRefresh())
  },

  load(done) {
    api.get('/api/footprint/overview').then((data) => {
      this.setData({
        stats: {
          provinceCount: (data && data.provinceCount) || 0,
          cityCount: (data && data.cityCount) || 0,
          placeCount: (data && data.placeCount) || 0,
          memoryCount: (data && data.memoryCount) || 0
        },
        bound: true,
        ready: true
      })
      if (typeof done === 'function') done()
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        if (typeof done === 'function') done()
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
      if (typeof done === 'function') done()
    })
  },

  goReal() { wx.navigateTo({ url: '/pages/map/real/index' }) },
  goFootprint() { wx.navigateTo({ url: '/pages/map/footprint/index' }) },
  goLocation() { wx.navigateTo({ url: '/pages/location/index' }) },
  goMe() { wx.switchTab({ url: '/pages/me/me' }) }
})
