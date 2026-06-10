// pages/map/footprint/city/index — 城市页：立体回忆相册（swiper 3D 卡片）。
const api = require('../../../../utils/api.js')

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
    adcode: '',
    loadError: '',
    places: [],
    memories: [],
    current: 0
  },

  onLoad(options) {
    this.setData({ adcode: (options && options.adcode) || '' })
  },

  onShow() {
    if (!api.getToken()) { this.setData({ ready: true }); wx.showToast({ title: '请先登录', icon: 'none' }); return }
    if (!this.data.adcode) { this.setData({ ready: true, loadError: '没有找到这个城市～' }); return }
    this.load()
  },

  load() {
    if (this._loading) return // 防止重复加载/重入
    this._loading = true
    this.setData({ loadError: '' })
    api.get('/api/footprint/cities/' + this.data.adcode).then((data) => {
      const memories = ((data && data.memories) || []).map((m) => {
        const photos = Array.isArray(m.photos) ? m.photos : []
        const tags = m.tags
          ? String(m.tags).split(',').map((t) => t.trim()).filter(Boolean)
          : []
        return Object.assign({}, m, {
          photos,
          tagList: tags,
          photoCount: photos.length,
          moodEmoji: moodEmoji(m.mood),
          dateText: m.memoryDate ? String(m.memoryDate).slice(0, 10) : ''
        })
      })
      this.setData({
        places: (data && data.places) || [],
        memories,
        current: 0,
        ready: true
      })
    }).catch((err) => {
      this.setData({ ready: true, loadError: '内容加载失败，稍后重试～' })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }).then(() => {
      this._loading = false
    })
  },

  // swiper 滑动：记录当前居中卡片索引，驱动 3D 缩放层级。
  onSwiperChange(e) {
    this.setData({ current: e.detail.current })
  },

  // 预览整组照片（catchtap：不触发卡片导航）。
  previewPhotos(e) {
    const ds = e.currentTarget.dataset
    const urls = ds.photos || []
    if (!urls.length) return
    wx.previewImage({ urls, current: ds.cover || urls[0] })
  },

  goPlace(e) { wx.navigateTo({ url: '/pages/placeDetail/placeDetail?id=' + e.currentTarget.dataset.id }) },
  goMemory(e) { wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + e.currentTarget.dataset.id }) }
})
