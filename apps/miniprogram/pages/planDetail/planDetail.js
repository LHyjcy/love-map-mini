// pages/planDetail/planDetail.js
// 计划详情：展示计划地点信息，完成计划并生成回忆。
const api = require('../../utils/api.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    placeId: '',
    place: null,
    title: '',
    content: '',
    mood: '',
    submitting: false
  },

  onLoad(options) {
    this.setData({ placeId: (options && options.id) || '' })
  },

  onShow() {
    if (!this.data.placeId) {
      this.setData({ ready: true })
      wx.showToast({ title: '缺少计划信息', icon: 'none' })
      return
    }
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      return
    }
    this.setData({ loggedIn: true })
    this.load()
  },

  load() {
    api.get('/api/places/' + this.data.placeId).then((data) => {
      const place = (data && data.place) || null
      this.setData({
        place,
        bound: true,
        ready: true,
        title: this.data.title || (place ? place.title : '')
      })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onMoodInput(e) {
    this.setData({ mood: e.detail.value })
  },

  complete() {
    const title = (this.data.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写回忆标题', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })

    const payload = { title }
    const content = (this.data.content || '').trim()
    const mood = (this.data.mood || '').trim()
    if (content) payload.content = content
    if (mood) payload.mood = mood

    api.request({ url: '/api/plans/' + this.data.placeId + '/complete', method: 'PATCH', data: payload }).then((data) => {
      const memory = (data && data.memory) || null
      wx.showToast({ title: '已生成回忆', icon: 'success' })
      setTimeout(() => {
        if (memory && memory.id) {
          wx.redirectTo({ url: '/pages/memoryDetail/memoryDetail?id=' + memory.id })
        } else {
          wx.navigateBack()
        }
      }, 500)
    }).catch((err) => {
      this.setData({ submitting: false })
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  }
})
