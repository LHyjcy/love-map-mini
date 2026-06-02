const api = require('../../utils/api.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    places: [],
    placeLabels: [],
    placeIndex: 0,
    memories: [],
    form: { title: '', content: '', mood: '' }
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
    api.get('/api/places').then((data) => {
      const places = (data && data.places) || []
      this.setData({
        places,
        placeLabels: places.map((p) => p.title),
        placeIndex: 0,
        bound: true
      })
      return api.get('/api/memories')
    }).then((data) => {
      const memories = ((data && data.memories) || []).map((m) => {
        return Object.assign({}, m, { mediaCount: (m.media || []).length })
      })
      this.setData({ memories, bound: true, ready: true })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  },

  onPlace(e) {
    this.setData({ placeIndex: Number(e.detail.value) })
  },

  onTitle(e) {
    this.setData({ 'form.title': e.detail.value })
  },

  onContent(e) {
    this.setData({ 'form.content': e.detail.value })
  },

  onMood(e) {
    this.setData({ 'form.mood': e.detail.value })
  },

  addMemory() {
    const { places, placeIndex, form } = this.data
    if (!places.length) {
      wx.showToast({ title: '请先到地图添加地点', icon: 'none' })
      return
    }
    const title = (form.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请输入标题', icon: 'none' })
      return
    }
    const placeId = places[placeIndex].id
    api.post('/api/memories', {
      placeId,
      title,
      content: form.content,
      mood: form.mood
    }).then(() => {
      this.setData({ form: { title: '', content: '', mood: '' } })
      wx.showToast({ title: '已记录', icon: 'success' })
      this.load()
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' })
    })
  }
})
