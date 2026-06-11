// pages/map/real/index — 真实地图：原生 map 组件 + 聚合 marker + 底部卡片。
// marker 来源 /api/map/markers（地点/回忆/本人打卡）。点击 marker 弹底部卡片。
const api = require('../../../utils/api.js')
const { thumbUrl } = require('../../../utils/image.js')

const KIND_LABEL = { place: '地点', memory: '回忆', checkin: '打卡' }

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    markers: [],
    meta: [], // 与 markers 下标对应：{ kind, realId, title }
    latitude: 39.908,
    longitude: 116.397,
    selected: null, // 底部卡片是否展示
    // 立体卡片数据：{ kind, kindLabel, realId, title, cover, memTitle, memText, memId, photos:[] }
    card: null,
    cardLoading: false,
    cardShown: false, // 控制 slide-up 入场动画
    // 地图高度（vh），可循环调整大小。
    mapSizes: [92, 65, 45],
    mapSizeIndex: 0,
    mapVh: 92
  },

  // 调整地图大小：在 mapSizes 间循环。
  toggleMapSize() {
    const idx = (this.data.mapSizeIndex + 1) % this.data.mapSizes.length
    this.setData({ mapSizeIndex: idx, mapVh: this.data.mapSizes[idx] })
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false })
      return
    }
    this.setData({ loggedIn: true })
    this.loadMarkers()
  },

  loadMarkers() {
    api.get('/api/map/markers').then((data) => {
      const list = (data && data.markers) || []
      const meta = list.map((m) => ({ kind: m.kind, realId: m.id, title: m.title }))
      const markers = list.map((m, index) => ({
        id: index,
        latitude: m.latitude,
        longitude: m.longitude,
        callout: {
          content: '[' + (KIND_LABEL[m.kind] || '') + '] ' + (m.title || ''),
          display: 'BYCLICK',
          padding: 6,
          borderRadius: 6
        }
      }))
      const update = { markers, meta, selected: null, card: null, cardShown: false, bound: true, ready: true }
      if (markers.length > 0) {
        update.latitude = markers[0].latitude
        update.longitude = markers[0].longitude
      }
      this.setData(update)
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  onMarkerTap(e) {
    const index = (e.detail && e.detail.markerId) != null ? e.detail.markerId : e.markerId
    const m = this.data.meta[index]
    if (!m) return

    // 回忆 marker：直接进入详情，保持原行为。
    if (m.kind === 'memory') {
      wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + m.realId })
      return
    }

    const kindLabel = KIND_LABEL[m.kind] || ''

    // 打卡 marker：简单卡片，无照片。
    if (m.kind === 'checkin') {
      this.showCard({ kind: m.kind, kindLabel, realId: m.realId, title: m.title, cover: '', memTitle: '', memText: '', memId: null, photos: [] })
      return
    }

    // 地点 marker：先展示标题占位，再异步拉取最新回忆作为封面+文案。
    this.setData({ selected: true, cardLoading: true, cardShown: false })
    this.setData({
      card: { kind: m.kind, kindLabel, realId: m.realId, title: m.title, cover: '', memTitle: '', memText: '', memId: null, photos: [] }
    })
    // 下一帧触发入场动画。
    setTimeout(() => this.setData({ cardShown: true }), 20)

    api.get('/api/memories?placeId=' + m.realId).then((data) => {
      const memories = (data && data.memories) || []
      const card = {
        kind: m.kind,
        kindLabel,
        realId: m.realId,
        title: m.title,
        cover: '',
        memTitle: '',
        memText: '',
        memId: null,
        photos: []
      }
      if (memories.length > 0) {
        const latest = memories[0]
        const media = (latest && latest.media) || []
        // 底部卡片封面用缩略图省流量；photos 保留原图
        card.cover = (media[0] && media[0].fileUrl) ? thumbUrl(media[0].fileUrl) : ''
        card.photos = media.map((x) => x && x.fileUrl).filter(Boolean)
        card.memTitle = latest.title || ''
        card.memText = latest.content || ''
        card.memId = latest.id != null ? latest.id : null
      }
      // 仅当卡片仍指向同一地点时才更新，避免快速切换 marker 时错位。
      if (this.data.selected && this.data.card && this.data.card.realId === m.realId && this.data.card.kind === 'place') {
        this.setData({ card, cardLoading: false })
      }
    }).catch(() => {
      if (this.data.selected && this.data.card && this.data.card.realId === m.realId) {
        this.setData({ cardLoading: false })
      }
    })
  },

  // 展示一个已就绪的卡片（带入场动画）。
  showCard(card) {
    this.setData({ selected: true, card, cardLoading: false, cardShown: false })
    setTimeout(() => this.setData({ cardShown: true }), 20)
  },

  closeCard() { this.setData({ cardShown: false, selected: null, card: null, cardLoading: false }) },

  openDetail() {
    const c = this.data.card
    if (!c) return
    if (c.kind === 'place') {
      if (c.memId != null) {
        wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + c.memId })
      } else {
        wx.navigateTo({ url: '/pages/placeDetail/placeDetail?id=' + c.realId })
      }
    } else if (c.kind === 'memory') {
      wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + c.realId })
    }
  },

  goAddPlace() { wx.navigateTo({ url: '/pages/addPlace/addPlace' }) },
  goCheckin() { wx.navigateTo({ url: '/pages/checkin/checkin' }) },
  goMemories() { wx.navigateTo({ url: '/pages/memories/memories' }) },
  goShare() { wx.navigateTo({ url: '/pages/location/index' }) },
  goMe() { wx.switchTab({ url: '/pages/me/me' }) }
})
