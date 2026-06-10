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
    nextCursor: null, // 下一页游标；null 表示没有更多
    loadingMore: false, // 触底加载中，防重复请求
    form: { title: '', content: '', mood: '' },
    tags: [], // 本地标签数组（最多 8，去重、去空格）
    tagInput: '', // 标签输入框内容
    pendingPhotos: [], // 创建前已选、待随回忆一并上传的图片：{ tempFilePath, size?, width?, height? }
    submitting: false,
    aiLoading: false // 调用 AI 文案接口中
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

  load() {
    // 首屏：地点与第一页回忆相互独立，并行请求；并重置列表与分页游标。
    return Promise.all([
      api.get('/api/places'),
      api.get('/api/memories?limit=20')
    ]).then(([placesData, memoriesData]) => {
      const places = (placesData && placesData.places) || []
      this.setData({
        places,
        placeLabels: places.map((p) => p.title),
        placeIndex: 0,
        memories: this.decorateMemories((memoriesData && memoriesData.memories) || []),
        nextCursor: (memoriesData && memoriesData.nextCursor) || null,
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

  // 列表展示字段加工：照片数与标签数组（首页与追加页共用）。
  decorateMemories(list) {
    return list.map((m) => {
      const tagList = String(m.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
      return Object.assign({}, m, { mediaCount: (m.media || []).length, tagList })
    })
  },

  // 触底加载下一页并追加；nextCursor 为 null 表示没有更多。
  onReachBottom() {
    const { nextCursor, loadingMore, loggedIn, bound } = this.data
    if (!nextCursor || loadingMore || !loggedIn || !bound) return
    this.setData({ loadingMore: true })
    api.get('/api/memories?limit=20&cursor=' + encodeURIComponent(nextCursor)).then((data) => {
      this.setData({
        memories: this.data.memories.concat(this.decorateMemories((data && data.memories) || [])),
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

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + id })
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

  // AI 文案助手：根据当前地点 / 标签 / 心情生成标题与正文。
  // 仅在对应字段为空时填充，避免覆盖用户已输入内容；都填了就提示。
  aiWriteCopy() {
    const { aiLoading, places, placeIndex, form, tags } = this.data
    if (aiLoading) return
    const placeTitle = (places[placeIndex] && places[placeIndex].title) || ''
    this.setData({ aiLoading: true })
    wx.showLoading({ title: '生成中…', mask: true })
    api.post('/api/ai/memory-copy', { placeTitle, tags, mood: form.mood || '' })
      .then((data) => {
        wx.hideLoading()
        this.setData({ aiLoading: false })
        const result = data || {}
        const titleEmpty = !((this.data.form.title || '').trim())
        const contentEmpty = !((this.data.form.content || '').trim())
        if (!titleEmpty && !contentEmpty) {
          wx.showToast({ title: '已有内容', icon: 'none' })
          return
        }
        const patch = {}
        if (titleEmpty && result.title) patch['form.title'] = result.title
        if (contentEmpty && result.story) patch['form.content'] = result.story
        if (Object.keys(patch).length) this.setData(patch)
        let title = '已生成，可继续修改'
        if (result.source === 'ai') title = 'AI 已生成'
        else if (result.source === 'template') title = '已按模板生成'
        wx.showToast({ title, icon: 'none' })
      })
      .catch((err) => {
        wx.hideLoading()
        this.setData({ aiLoading: false })
        wx.showToast({ title: (err && err.message) || '生成失败，请重试', icon: 'none' })
      })
  },

  onTagInput(e) {
    this.setData({ tagInput: e.detail.value })
  },

  // 添加标签：去空格、限长 20、最多 8 个、去重。
  addTag() {
    const raw = (this.data.tagInput || '').trim()
    if (!raw) return
    const tag = raw.slice(0, 20)
    const tags = this.data.tags
    if (tags.length >= 8) {
      wx.showToast({ title: '最多 8 个标签', icon: 'none' })
      return
    }
    if (tags.indexOf(tag) !== -1) {
      this.setData({ tagInput: '' })
      return
    }
    this.setData({ tags: tags.concat(tag), tagInput: '' })
  },

  removeTag(e) {
    const index = Number(e.currentTarget.dataset.index)
    const tags = this.data.tags.slice()
    tags.splice(index, 1)
    this.setData({ tags })
  },

  // 选择待上传图片（最多 9 张，可多次追加）。
  choosePhotos() {
    const remaining = 9 - this.data.pendingPhotos.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多 9 张', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const added = (res && res.tempFiles) || []
        this.setData({ pendingPhotos: this.data.pendingPhotos.concat(added) })
      }
    })
  },

  removePending(e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = this.data.pendingPhotos.slice()
    list.splice(index, 1)
    this.setData({ pendingPhotos: list })
  },

  previewPending(e) {
    const url = e.currentTarget.dataset.url
    const urls = this.data.pendingPhotos.map((p) => p.tempFilePath)
    if (url) wx.previewImage({ current: url, urls })
  },

  guessMimeType(path) {
    const ext = String(path || '').split('.').pop().toLowerCase()
    if (ext === 'png') return 'image/png'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'gif') return 'image/gif'
    return 'image/jpeg'
  },

  // 单张：取凭证 -> 直传（云模式 PUT）/本地占位 -> 登记元数据到指定回忆。
  uploadOne(memoryId, file) {
    const tempFilePath = file.tempFilePath
    const mimeType = this.guessMimeType(tempFilePath)
    return api.post('/api/media/upload-credential', { mimeType }).then((data) => {
      const credential = (data && data.credential) || {}
      const uploadUrl = credential.uploadUrl
      const objectKey = credential.objectKey
      const doRegister = (fileUrl) => {
        const payload = { memoryId, fileUrl, objectKey, mimeType }
        if (typeof file.size === 'number') payload.size = file.size
        if (typeof file.width === 'number') payload.width = file.width
        if (typeof file.height === 'number') payload.height = file.height
        return api.post('/api/media', payload)
      }
      if (uploadUrl) {
        return this.cloudUpload(uploadUrl, tempFilePath, credential.mimeType || mimeType)
          .then(() => doRegister(credential.fileUrl))
      }
      return doRegister(tempFilePath)
    })
  },

  cloudUpload(uploadUrl, filePath, mimeType) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        success: (readRes) => {
          wx.request({
            url: uploadUrl,
            method: 'PUT',
            data: readRes && readRes.data,
            header: { 'Content-Type': mimeType || 'application/octet-stream' },
            success: (res) => {
              if (res.statusCode >= 200 && res.statusCode < 300) resolve(res)
              else reject(new Error('上传失败(' + res.statusCode + ')'))
            },
            fail: (e) => reject(new Error((e && e.errMsg) || '上传失败'))
          })
        },
        fail: (e) => reject(new Error((e && e.errMsg) || '读取文件失败'))
      })
    })
  },

  // 串行上传 pendingPhotos 到指定回忆；单张失败不影响整批，
  // 返回 Promise<{ ok, failed }> 供调用方汇总提示。
  uploadPending(memoryId) {
    const files = this.data.pendingPhotos
    let i = 0
    let ok = 0
    let failed = 0
    const next = () => {
      if (i >= files.length) return Promise.resolve({ ok, failed })
      const f = files[i++]
      return this.uploadOne(memoryId, f)
        .then(() => { ok += 1 })
        .catch(() => { failed += 1 })
        .then(next)
    }
    return next()
  },

  addMemory() {
    const { places, placeIndex, form, tags, pendingPhotos, submitting } = this.data
    if (submitting) return
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
    this.setData({ submitting: true })
    wx.showLoading({ title: '保存中…', mask: true })

    let memoryId = ''
    api.post('/api/memories', { placeId, title, content: form.content, mood: form.mood, tags })
      .then((data) => {
        memoryId = data && data.memory && data.memory.id
        if (memoryId && pendingPhotos.length) {
          wx.showLoading({ title: '上传照片…', mask: true })
          return this.uploadPending(memoryId)
        }
        return null
      })
      .then((res) => {
        wx.hideLoading()
        this.setData({ form: { title: '', content: '', mood: '' }, tags: [], tagInput: '', pendingPhotos: [], submitting: false })
        if (res && res.failed > 0) {
          wx.showToast({ title: '已记录，' + res.failed + ' 张照片上传失败', icon: 'none' })
        } else {
          wx.showToast({ title: '已记录', icon: 'success' })
        }
        if (memoryId) {
          setTimeout(() => wx.navigateTo({ url: '/pages/memoryDetail/memoryDetail?id=' + memoryId }), 400)
        } else {
          this.load()
        }
      })
      .catch((err) => {
        wx.hideLoading()
        this.setData({ submitting: false })
        wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' })
      })
  }
})
