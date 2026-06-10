// pages/placeDetail/placeDetail.js
// 地点详情：展示地点信息与该地点的相关回忆，可软删除地点。
const api = require('../../utils/api.js')

const PLACE_TYPE_LABEL = { visited: '已去过', wishlist: '想去', plan: '计划中' }

Page({
  data: {
    ready: false,
    placeId: '',
    place: null,
    typeLabel: '',
    memories: [],
    deleting: false,
    votes: { want: 0, meh: 0, no: 0, total: 0, mine: null },
    voting: false
  },

  onLoad(options) {
    this.setData({ placeId: (options && options.id) || '' })
  },

  onShow() {
    if (!this.data.placeId) {
      this.setData({ ready: true })
      return
    }
    if (!api.getToken()) {
      this.setData({ ready: true })
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    this.load()
  },

  load() {
    const id = this.data.placeId
    api.get('/api/places/' + id).then((data) => {
      const place = (data && data.place) || null
      this.setData({
        place,
        typeLabel: place ? (PLACE_TYPE_LABEL[place.placeType] || place.placeType) : ''
      })
      return api.get('/api/memories?placeId=' + id)
    }).then((data) => {
      const memories = ((data && data.memories) || []).map((m) => Object.assign({}, m, {
        dateText: m.memoryDate ? String(m.memoryDate).slice(0, 10) : '',
        mediaCount: (m.media || []).length
      }))
      this.setData({ memories, ready: true })
      this.loadVotes()
    }).catch((err) => {
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  loadVotes() {
    const id = this.data.placeId
    api.get('/api/places/' + id + '/votes').then((data) => {
      const votes = (data && data.tally) || null
      if (votes) this.setData({ votes })
    }).catch(() => {
      // 投票统计加载失败不影响地点详情展示，静默忽略。
    })
  },

  vote(e) {
    if (this.data.voting) return
    const vote = e.currentTarget.dataset.vote
    if (!vote) return
    this.setData({ voting: true })
    api.post('/api/places/' + this.data.placeId + '/vote', { vote }).then((data) => {
      const votes = (data && data.tally) || null
      if (votes) this.setData({ votes })
      this.setData({ voting: false })
    }).catch((err) => {
      this.setData({ voting: false })
      wx.showToast({ title: (err && err.message) || '投票失败', icon: 'none' })
    })
  },

  goMemory(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + id })
  },

  removePlace() {
    if (this.data.deleting) return
    const id = this.data.placeId
    wx.showModal({
      title: '删除地点',
      content: '确定删除该地点吗？此为软删除，可在后端恢复。',
      success: (res) => {
        if (!res.confirm) return
        if (this.data.deleting) return
        this.setData({ deleting: true })
        api.request({ url: '/api/places/' + id, method: 'DELETE' }).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 400)
        }).catch((err) => {
          this.setData({ deleting: false })
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        })
      }
    })
  }
})
