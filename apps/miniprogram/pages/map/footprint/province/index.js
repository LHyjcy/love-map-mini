// pages/map/footprint/province/index — 省份页：canvas 绘制省内城市，点亮已去过城市，点击进入城市页。
const api = require('../../../../utils/api.js')
const geo = require('../../../../utils/geo-canvas.js')

Page({
  data: {
    ready: false,
    adcode: '',
    loading: false,
    mapError: '',
    litCityCount: 0,
    cityCount: 0,
    canvasW: 0,
    canvasH: 0,
    preview: null,      // { adcode, name, placeCount, memoryCount, hasCounts } 被点亮城市预览卡片
    previewShown: false // 控制卡片滑入动画
  },

  onLoad(options) {
    this.setData({ adcode: (options && options.adcode) || '' })
  },

  onShow() {
    if (!api.getToken()) { this.setData({ ready: true }); wx.showToast({ title: '请先登录', icon: 'none' }); return }
    if (!this.data.adcode) { this.setData({ ready: true, mapError: '没有找到这个省份～' }); return }
    this.load()
  },

  load() {
    if (this._loading) return // 防止重复加载/重入
    this._loading = true

    const info = wx.getSystemInfoSync()
    const w = info.windowWidth - 32
    const h = Math.round(w * 0.85)
    this.setData({ canvasW: w, canvasH: h, loading: true, mapError: '' })

    Promise.all([
      api.get('/api/geo/province/' + this.data.adcode),
      api.get('/api/footprint/provinces/' + this.data.adcode)
    ]).then((arr) => {
      const fc = arr[0] || {}
      const fp = arr[1] || {}
      this._features = (fc.features) || []
      this._litSet = new Set((fp.litCityIds) || [])
      // 按 cityId 建立「地点数 / 回忆数」索引，供点亮城市的预览卡片展示。
      this._cityStats = new Map()
      const cities = (fp.cities) || []
      for (let i = 0; i < cities.length; i++) {
        const c = cities[i]
        if (c && c.cityId != null) {
          this._cityStats.set(String(c.cityId), {
            placeCount: c.placeCount || 0,
            memoryCount: c.memoryCount || 0
          })
        }
      }
      this.setData({
        litCityCount: this._litSet.size,
        cityCount: this._features.length,
        ready: true,
        loading: false,
        mapError: this._features.length ? '' : '这个省份的地图暂时加载不出来，稍后再试试～'
      })
      this.renderMap()
    }).catch((err) => {
      this.setData({ ready: true, loading: false, mapError: '地图加载失败，稍后重试～' })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }).then(() => {
      this._loading = false
    })
  },

  renderMap() {
    if (this._rendering) return // 防止并发绘制
    if (!this._features || !this._features.length) return
    this._rendering = true
    const that = this
    wx.createSelectorQuery().select('#provcanvas').fields({ node: true, size: true, rect: true }).exec((res) => {
      that._rendering = false
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = (wx.getSystemInfoSync().pixelRatio) || 2
      const w = res[0].width, h = res[0].height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)
      if (!that._features.length) return
      const projector = geo.makeProjector(that._features, w, h, 10)
      that._projector = projector
      that._rect = { left: res[0].left, top: res[0].top }
      geo.draw(ctx, that._features, projector, { litSet: that._litSet })
    })
  },

  onTapMap(e) {
    if (!this._features || !this._projector || !this._rect) return
    const px = e.detail.x - this._rect.left
    const py = e.detail.y - this._rect.top
    const adcode = geo.hitTest(this._features, this._projector, px, py)
    if (!adcode) return
    // 未点亮：轻提示引导去打卡。
    if (!this._litSet || !this._litSet.has(adcode)) {
      wx.showToast({ title: '这里还没有点亮，去打卡吧～', icon: 'none' })
      return
    }
    // 已点亮：弹出立体感预览卡片，带上该城地点/回忆统计。
    const stats = (this._cityStats && this._cityStats.get(String(adcode))) || null
    const preview = {
      adcode,
      name: this.regionName(adcode),
      placeCount: stats ? stats.placeCount : 0,
      memoryCount: stats ? stats.memoryCount : 0,
      hasCounts: !!stats
    }
    this.setData({ preview, previewShown: false }, () => {
      setTimeout(() => this.setData({ previewShown: true }), 20)
    })
  },

  // 从 _features 里按 adcode 取城市名（properties.name）。
  regionName(adcode) {
    const list = this._features || []
    for (let i = 0; i < list.length; i++) {
      const props = list[i] && list[i].properties
      if (props && String(props.adcode) === String(adcode)) {
        return props.name || ''
      }
    }
    return ''
  },

  closePreview() {
    this.setData({ previewShown: false }, () => {
      setTimeout(() => this.setData({ preview: null }), 220)
    })
  },

  goCity() {
    const p = this.data.preview
    if (!p) return
    wx.navigateTo({ url: '/pages/map/footprint/city/index?adcode=' + p.adcode })
  }
})
