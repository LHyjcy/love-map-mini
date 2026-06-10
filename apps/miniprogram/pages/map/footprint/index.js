// pages/map/footprint/index — 足迹全国页：canvas 绘制省份，点亮已去过省份，点击进入省份页。
const api = require('../../../utils/api.js')
const geo = require('../../../utils/geo-canvas.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    loading: false,
    mapError: '',
    stats: { provinceCount: 0, cityCount: 0, placeCount: 0, memoryCount: 0 },
    canvasW: 0,
    canvasH: 0,
    preview: null,      // { adcode, name } 被点亮省份的预览卡片数据
    previewShown: false // 控制卡片滑入动画
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
    if (this._loading) return // 防止重复加载/重入
    this._loading = true

    const info = wx.getSystemInfoSync()
    const w = info.windowWidth - 32
    const h = Math.round(w * 0.85)
    this.setData({ canvasW: w, canvasH: h, loading: true, mapError: '' })

    Promise.all([
      api.get('/api/geo/national'),
      api.get('/api/footprint/overview')
    ]).then((arr) => {
      const fc = arr[0] || {}
      const overview = arr[1] || {}
      this._features = (fc.features) || []
      this._litSet = new Set((overview.litProvinceIds) || [])
      this.setData({
        stats: {
          provinceCount: overview.provinceCount || 0,
          cityCount: overview.cityCount || 0,
          placeCount: overview.placeCount || 0,
          memoryCount: overview.memoryCount || 0
        },
        bound: true,
        ready: true,
        loading: false,
        mapError: this._features.length ? '' : '地图数据暂时加载不出来，稍后再试试～'
      })
      this.renderMap()
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true, loading: false })
        return
      }
      this.setData({ ready: true, loading: false, mapError: '地图加载失败，下拉或稍后重试～' })
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
    const query = wx.createSelectorQuery()
    query.select('#fpcanvas').fields({ node: true, size: true, rect: true }).exec((res) => {
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
    // 已点亮：弹出立体感预览卡片，由按钮再下钻。
    this.setData({ preview: { adcode, name: this.regionName(adcode) }, previewShown: false }, () => {
      // 下一帧再置 shown，触发 translateY 滑入过渡。
      setTimeout(() => this.setData({ previewShown: true }), 20)
    })
  },

  // 从 _features 里按 adcode 取省份名（properties.name）。
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

  goProvince() {
    const p = this.data.preview
    if (!p) return
    wx.navigateTo({ url: '/pages/map/footprint/province/index?adcode=' + p.adcode })
  },

  goMe() { wx.switchTab({ url: '/pages/me/me' }) }
})
