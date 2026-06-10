// pages/planAdd/planAdd.js
// 计划安排：把想去清单中的地点设为计划，并查看当前计划列表。
const api = require('../../utils/api.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    promoting: false,
    wishlist: [],
    plans: []
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      return
    }
    this.setData({ loggedIn: true })
    this.load()
  },

  load() {
    api.get('/api/places?placeType=wishlist').then((data) => {
      this.setData({ wishlist: (data && data.places) || [], bound: true })
      return api.get('/api/places?placeType=plan')
    }).then((data) => {
      this.setData({ plans: (data && data.places) || [], ready: true })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  promote(e) {
    if (this.data.promoting) return
    const id = e.currentTarget.dataset.id
    this.setData({ promoting: true })
    api.request({ url: '/api/places/' + id, method: 'PATCH', data: { placeType: 'plan' } }).then(() => {
      wx.showToast({ title: '已设为计划', icon: 'success' })
      this.load()
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    }).then(() => {
      this.setData({ promoting: false })
    })
  },

  goPlan(e) {
    wx.navigateTo({ url: '/pages/planDetail/planDetail?id=' + e.currentTarget.dataset.id })
  },

  goAddPlace() {
    wx.navigateTo({ url: '/pages/addPlace/addPlace' })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  }
})
