// pages/review/index — 月度/年度回顾页：统计回忆/照片/地点/城市/省份，topTags、近期回忆，并支持保存回顾海报。
const api = require('../../utils/api.js')

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    loading: false,
    period: 'month', // month | year
    review: null,
    summary: '', // AI/模板生成的回顾文案
    aiLoading: false,
    // 海报画布尺寸（逻辑像素）
    posterW: 600,
    posterH: 800,
    saving: false
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
    this.load(() => wx.stopPullDownRefresh())
  },

  // 切换「本月」/「今年」
  switchPeriod(e) {
    const period = e.currentTarget.dataset.period
    if (!period || period === this.data.period) return
    this.setData({ period, summary: '' })
    this.load()
  },

  load(done) {
    if (this._loading) {
      if (typeof done === 'function') done()
      return
    }
    this._loading = true
    // 重新加载数据时清空旧文案，避免与新周期/新数据不匹配。
    this.setData({ loading: true, summary: '' })

    // 默认不传 value，后端使用当前月/年。
    api.get('/api/review?period=' + this.data.period).then((data) => {
      const review = data || {}
      // 近期回忆日期截取到 10 位（YYYY-MM-DD）
      const recent = (review.recentMemories || []).map((m) => ({
        id: m.id,
        title: m.title || '未命名回忆',
        date: m.memoryDate ? String(m.memoryDate).slice(0, 10) : ''
      }))
      this.setData({
        review: {
          period: review.period || this.data.period,
          value: review.value || '',
          memoryCount: review.memoryCount || 0,
          placeCount: review.placeCount || 0,
          cityCount: review.cityCount || 0,
          provinceCount: review.provinceCount || 0,
          photoCount: review.photoCount || 0,
          topTags: review.topTags || [],
          recentMemories: recent
        },
        bound: true,
        ready: true,
        loading: false
      })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true, loading: false })
        return
      }
      this.setData({ ready: true, loading: false })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    }).then(() => {
      this._loading = false
      if (typeof done === 'function') done()
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  },

  openMemory(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + id })
  },

  // ---- 生成回顾文案（AI / 模板）----
  genSummary() {
    if (this.data.aiLoading) return
    const r = this.data.review
    if (!r) {
      wx.showToast({ title: '暂无可生成的数据', icon: 'none' })
      return
    }
    this.setData({ aiLoading: true })
    const that = this
    api.post('/api/ai/review-summary', {
      memoryCount: r.memoryCount || 0,
      placeCount: r.placeCount || 0,
      cityCount: r.cityCount || 0,
      provinceCount: r.provinceCount || 0,
      photoCount: r.photoCount || 0,
      topTags: (r.topTags || []).map((t) => t.tag),
      period: this.data.period
    }).then((res) => {
      const data = res || {}
      that.setData({ summary: data.summary || '' })
      wx.showToast({
        title: data.source === 'ai' ? 'AI 已生成' : '已按模板生成',
        icon: 'none'
      })
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '生成失败，稍后再试', icon: 'none' })
    }).then(() => {
      that.setData({ aiLoading: false })
    })
  },

  // ---- 保存回顾海报 ----
  savePoster() {
    if (this.data.saving) return
    if (!this.data.review) {
      wx.showToast({ title: '暂无可分享的数据', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    const that = this
    this.drawPoster()
      .then((tempFilePath) => that.saveToAlbum(tempFilePath))
      .then(() => {
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      })
      .catch((err) => {
        if (err && err.handled) return // 已自行提示（如引导授权）
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
      })
      .then(() => {
        that.setData({ saving: false })
      })
  },

  // 在 canvas 2d 上绘制海报，返回临时文件路径
  drawPoster() {
    const that = this
    const r = this.data.review
    const W = this.data.posterW
    const H = this.data.posterH
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery()
      query.select('#poster').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('海报画布未就绪'))
          return
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getSystemInfoSync().pixelRatio) || 2
        canvas.width = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)

        // 背景
        ctx.fillStyle = '#544487'
        ctx.fillRect(0, 0, W, H)
        // 内卡片
        ctx.fillStyle = '#ffffff'
        that._roundRect(ctx, 40, 60, W - 80, H - 120, 28)
        ctx.fill()

        const cx = W / 2
        let y = 150

        // 标题
        ctx.fillStyle = '#544487'
        ctx.textAlign = 'center'
        ctx.font = 'bold 44px sans-serif'
        ctx.fillText('我们的回顾', cx, y)

        // 周期
        y += 56
        ctx.fillStyle = '#999999'
        ctx.font = '26px sans-serif'
        const periodLabel = (r.period === 'year' ? '年度' : '月度') + (r.value ? ' · ' + r.value : '')
        ctx.fillText(periodLabel, cx, y)

        // 关键数字（两列两行）
        y += 80
        const stats = [
          ['回忆', r.memoryCount],
          ['照片', r.photoCount],
          ['地点', r.placeCount],
          ['城市', r.cityCount]
        ]
        const colX = [W * 0.32, W * 0.68]
        for (let i = 0; i < stats.length; i++) {
          const col = i % 2
          const row = Math.floor(i / 2)
          const sx = colX[col]
          const sy = y + row * 130
          ctx.fillStyle = '#544487'
          ctx.font = 'bold 56px sans-serif'
          ctx.fillText(String(stats[i][1]), sx, sy)
          ctx.fillStyle = '#6b6580'
          ctx.font = '26px sans-serif'
          ctx.fillText(stats[i][0], sx, sy + 40)
        }
        y += 130 + 90

        // 省份点亮
        ctx.fillStyle = '#6b6580'
        ctx.font = '28px sans-serif'
        ctx.fillText('点亮 ' + (r.cityCount || 0) + ' 城 · ' + (r.provinceCount || 0) + ' 省', cx, y)

        // topTags 徽章
        y += 70
        const tags = (r.topTags || []).slice(0, 6)
        if (tags.length) {
          ctx.font = '24px sans-serif'
          // 居中排布徽章
          const items = tags.map((t) => '#' + t.tag + ' ×' + t.count)
          const gap = 16
          const padX = 18
          const widths = items.map((s) => ctx.measureText(s).width + padX * 2)
          // 简单两行折行
          let lineW = 0
          const lines = [[]]
          const maxW = W - 120
          for (let i = 0; i < items.length; i++) {
            if (lineW + widths[i] + gap > maxW && lines[lines.length - 1].length) {
              lines.push([])
              lineW = 0
            }
            lines[lines.length - 1].push({ text: items[i], w: widths[i] })
            lineW += widths[i] + gap
          }
          for (let li = 0; li < lines.length; li++) {
            const line = lines[li]
            const totalW = line.reduce((a, b) => a + b.w, 0) + gap * (line.length - 1)
            let bx = cx - totalW / 2
            const by = y + li * 56
            for (let ci = 0; ci < line.length; ci++) {
              const it = line[ci]
              ctx.fillStyle = '#efecfa'
              that._roundRect(ctx, bx, by - 28, it.w, 44, 22)
              ctx.fill()
              ctx.fillStyle = '#544487'
              ctx.textAlign = 'center'
              ctx.fillText(it.text, bx + it.w / 2, by + 1)
              bx += it.w + gap
            }
          }
        }

        // 回顾文案（若已生成，自动换行绘制）
        const summary = that.data.summary
        if (summary) {
          y += 80
          ctx.textAlign = 'center'
          ctx.fillStyle = '#6b6580'
          ctx.font = '26px sans-serif'
          const maxTextW = W - 140
          const chars = String(summary).split('')
          let line = ''
          for (let i = 0; i < chars.length; i++) {
            const ch = chars[i]
            if (ch === '\n') {
              ctx.fillText(line, cx, y)
              line = ''
              y += 40
              continue
            }
            const test = line + ch
            if (ctx.measureText(test).width > maxTextW && line) {
              ctx.fillText(line, cx, y)
              line = ch
              y += 40
            } else {
              line = test
            }
          }
          if (line) {
            ctx.fillText(line, cx, y)
          }
        }

        // 落款
        ctx.fillStyle = '#cbc7e0'
        ctx.font = '24px sans-serif'
        ctx.fillText('love-map-mini', cx, H - 90)

        // 导出
        wx.canvasToTempFilePath({
          canvas,
          success(out) { resolve(out.tempFilePath) },
          fail(e) { reject(new Error((e && e.errMsg) || '生成海报失败')) }
        })
      })
    })
  },

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  saveToAlbum(tempFilePath) {
    return new Promise((resolve, reject) => {
      const doSave = () => {
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success() { resolve() },
          fail(e) {
            const msg = (e && e.errMsg) || ''
            if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0) {
              wx.showModal({
                title: '需要相册权限',
                content: '保存回顾海报需要相册权限，去设置里开启一下吧～',
                confirmText: '去设置',
                success(m) {
                  if (m.confirm) wx.openSetting({})
                }
              })
              reject({ handled: true })
              return
            }
            reject(new Error('保存失败'))
          }
        })
      }

      // 先确认相册权限
      wx.getSetting({
        success(res) {
          const auth = res.authSetting || {}
          if (auth['scope.writePhotosAlbum'] === false) {
            wx.showModal({
              title: '需要相册权限',
              content: '保存回顾海报需要相册权限，去设置里开启一下吧～',
              confirmText: '去设置',
              success(m) {
                if (m.confirm) wx.openSetting({})
              }
            })
            reject({ handled: true })
            return
          }
          doSave()
        },
        fail() { doSave() }
      })
    })
  }
})
