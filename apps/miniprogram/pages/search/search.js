// pages/search/search.js
// 搜索：按关键词搜索地点与回忆，点击进入对应详情页。
const api = require('../../utils/api.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: true,
    q: '',
    searched: false,
    places: [],
    memories: []
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      return
    }
    this.setData({ loggedIn: true, bound: true, ready: true })
  },

  onInput(e) {
    this.setData({ q: e.detail.value })
  },

  doSearch() {
    const q = (this.data.q || '').trim()
    if (!q) {
      wx.showToast({ title: '请输入关键词', icon: 'none' })
      return
    }
    api.get('/api/search?q=' + encodeURIComponent(q)).then((data) => {
      const memories = ((data && data.memories) || []).map((m) => Object.assign({}, m, {
        dateText: m.memoryDate ? String(m.memoryDate).slice(0, 10) : '',
        snippet: m.content ? String(m.content).slice(0, 40) : ''
      }))
      this.setData({
        places: (data && data.places) || [],
        memories,
        searched: true,
        bound: true
      })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false })
        return
      }
      wx.showToast({ title: (err && err.message) || '搜索失败', icon: 'none' })
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  },

  goPlace(e) {
    wx.navigateTo({ url: '/pages/placeDetail/placeDetail?id=' + e.currentTarget.dataset.id })
  },

  goMemory(e) {
    wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + e.currentTarget.dataset.id })
  }
})
