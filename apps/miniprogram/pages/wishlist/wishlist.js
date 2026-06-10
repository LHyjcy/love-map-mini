// pages/wishlist/wishlist.js
// 想去清单：展示 placeType=wishlist 的地点，点击进入地点详情。
const api = require('../../utils/api.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    places: []
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
    this.load()
  },

  load() {
    api.get('/api/places?placeType=wishlist').then((data) => {
      this.setData({ places: (data && data.places) || [], bound: true, ready: true })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  },

  goAddPlace() {
    wx.navigateTo({ url: '/pages/addPlace/addPlace' })
  },

  goPlace(e) {
    wx.navigateTo({ url: '/pages/placeDetail/placeDetail?id=' + e.currentTarget.dataset.id })
  }
})
