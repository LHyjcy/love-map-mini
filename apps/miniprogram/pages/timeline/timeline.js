// pages/timeline/timeline.js
// 回忆时间轴：按回忆日期倒序展示，点击进入回忆详情。
const api = require('../../utils/api.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    items: [],
    nextCursor: null, // 下一页游标；null 表示没有更多
    loadingMore: false // 触底加载中，防重复请求
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
    // 下拉刷新回到第一页，等数据回来再收起指示器
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  // 列表项展示字段加工（首页与追加页共用）。
  decorateItems(list) {
    return list.map((m) => Object.assign({}, m, {
      dateText: m.memoryDate ? String(m.memoryDate).slice(0, 10) : String(m.createdAt).slice(0, 10),
      mediaCount: (m.media || []).length
    }))
  },

  // 按日期倒序（最新在前）；追加分页后对合并数组统一重排
  sortItems(items) {
    return items.slice().sort((a, b) => (a.dateText < b.dateText ? 1 : -1))
  },

  load() {
    // 第一页：重置列表与分页游标
    return api.get('/api/memories?limit=20').then((data) => {
      const items = this.sortItems(this.decorateItems((data && data.memories) || []))
      this.setData({
        items,
        nextCursor: (data && data.nextCursor) || null,
        bound: true,
        ready: true
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

  // 触底加载下一页并追加；nextCursor 为 null 表示没有更多。
  onReachBottom() {
    const { nextCursor, loadingMore, loggedIn, bound } = this.data
    if (!nextCursor || loadingMore || !loggedIn || !bound) return
    this.setData({ loadingMore: true })
    api.get('/api/memories?limit=20&cursor=' + encodeURIComponent(nextCursor)).then((data) => {
      const merged = this.data.items.concat(this.decorateItems((data && data.memories) || []))
      this.setData({
        items: this.sortItems(merged),
        nextCursor: (data && data.nextCursor) || null,
        loadingMore: false
      })
    }).catch((err) => {
      this.setData({ loadingMore: false })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  },

  goMemory(e) {
    wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + e.currentTarget.dataset.id })
  }
})
