// pages/memoryWall/index — 回忆墙：情侣全部回忆的立体感照片卡片画廊（swiper 3D 卡片）。
const api = require('../../utils/api.js')
const { thumbUrl } = require('../../utils/image.js')

// 心情 → emoji（占位封面 & 卡片角标用）
const MOOD_EMOJI = {
  happy: '😄', love: '💜', sweet: '🥰', warm: '🤗', sad: '😢',
  excited: '🤩', calm: '😌', surprise: '😲', miss: '🥹'
}

function moodEmoji(mood) {
  if (!mood) return '💜'
  return MOOD_EMOJI[String(mood).toLowerCase()] || '💜'
}

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    memories: [],
    current: 0,
    nextCursor: null, // 下一页游标；null 表示没有更多
    loadingMore: false // 追加加载中，防重复请求
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
      wx.stopPullDownRefresh()
      return
    }
    this.load().then(() => wx.stopPullDownRefresh())
  },

  // 单条回忆 → 卡片数据（首页与追加页共用）。
  toCard(m) {
    const media = Array.isArray(m.media) ? m.media : []
    const photos = media.map((x) => x && x.fileUrl).filter(Boolean)
    const tagList = String(m.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
    const dateText = String(m.memoryDate || m.createdAt || '').slice(0, 10)
    return {
      id: m.id,
      title: m.title,
      content: m.content,
      mood: m.mood,
      // 卡片封面用缩略图省流量；photos 保留原图供 wx.previewImage 看大图
      cover: photos[0] ? thumbUrl(photos[0]) : null,
      photos,
      photoCount: photos.length,
      tagList,
      dateText,
      moodEmoji: moodEmoji(m.mood),
      // 用于排序：优先 memoryDate，回退 createdAt
      _sortKey: String(m.memoryDate || m.createdAt || '')
    }
  },

  // 最新优先；追加分页后对合并数组统一重排
  sortCards(list) {
    return list.slice().sort((a, b) => (a._sortKey < b._sortKey ? 1 : a._sortKey > b._sortKey ? -1 : 0))
  },

  load() {
    // 第一页：重置卡片与分页游标
    return api.get('/api/memories?limit=20').then((data) => {
      const list = this.sortCards(((data && data.memories) || []).map((m) => this.toCard(m)))
      this.setData({
        memories: list,
        current: 0,
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

  // 滑到接近末尾时预取下一页并追加（保持 swiper 浏览不中断）。
  loadMore() {
    const { nextCursor, loadingMore } = this.data
    if (!nextCursor || loadingMore) return
    this.setData({ loadingMore: true })
    api.get('/api/memories?limit=20&cursor=' + encodeURIComponent(nextCursor)).then((data) => {
      // 仅对新页内部排序后追加，不重排已加载部分，避免用户正在浏览的卡片跳位
      const page = this.sortCards(((data && data.memories) || []).map((m) => this.toCard(m)))
      this.setData({
        memories: this.data.memories.concat(page),
        nextCursor: (data && data.nextCursor) || null,
        loadingMore: false
      })
    }).catch(() => {
      this.setData({ loadingMore: false })
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  },

  // swiper 滑动：记录当前居中卡片索引，驱动 3D 缩放层级；接近末尾时预取下一页。
  onSwiperChange(e) {
    const current = e.detail.current
    this.setData({ current })
    if (current >= this.data.memories.length - 3) {
      this.loadMore()
    }
  },

  // 预览整组照片（catchtap：不触发卡片导航）。
  previewPhotos(e) {
    const ds = e.currentTarget.dataset
    const urls = ds.photos || []
    if (!urls.length) return
    // current 必须是 urls 里的原图地址（cover 已是缩略图，不能用）
    wx.previewImage({ urls, current: urls[0] })
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + e.currentTarget.dataset.id })
  }
})
