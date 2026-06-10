// pages/memoryDetail/memoryDetail.js
// 回忆详情：展示标题、心情、内容、日期与照片，可预览图片、软删除回忆。
const api = require('../../utils/api.js')

const VIS_LABEL = { private: '仅自己', couple: '双方可见', public: '可公开' }

Page({
  data: {
    ready: false,
    memoryId: '',
    memory: null,
    visLabel: '',
    dateText: '',
    tagList: [],
    media: [],
    coverUrl: '',
    coverLoaded: false,
    uploading: false,
    deleting: false
  },

  onLoad(options) {
    this.setData({ memoryId: (options && options.id) || '' })
  },

  onShow() {
    if (!this.data.memoryId) {
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
    api.get('/api/memories/' + this.data.memoryId).then((data) => {
      const memory = (data && data.memory) || null
      const media = memory ? (memory.media || []) : []
      const coverUrl = (media[0] && media[0].fileUrl) || ''
      this.setData({
        memory,
        media,
        coverUrl,
        // 先重置为 false，确保封面以 scale(1.06) 起始，便于下一帧触发缓动放大动画。
        coverLoaded: false,
        visLabel: memory ? (VIS_LABEL[memory.visibility] || memory.visibility) : '',
        dateText: memory && memory.memoryDate ? String(memory.memoryDate).slice(0, 10) : '',
        tagList: memory ? String(memory.tags || '').split(',').map((t) => t.trim()).filter(Boolean) : [],
        ready: true
      })
      // 数据落地后下一帧切换 class：scale(1.06) -> scale(1)，形成轻微视差/放大入场。
      if (coverUrl) {
        wx.nextTick(() => this.setData({ coverLoaded: true }))
      }
    }).catch((err) => {
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    const urls = this.data.media.map((m) => m.fileUrl).filter(Boolean)
    if (url) wx.previewImage({ current: url, urls })
  },

  // 从相册/相机选择图片，按现有后端媒体流程逐张上传并登记元数据。
  addPhoto() {
    if (this.data.uploading) return
    if (!this.data.memory) return
    const memoryId = this.data.memoryId
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const files = (res && res.tempFiles) || []
        if (!files.length) return
        this.uploadFiles(memoryId, files)
      }
    })
  },

  uploadFiles(memoryId, files) {
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中…', mask: true })

    let ok = 0
    let failed = 0

    // 逐张串行处理，单张失败不影响整体。
    const next = (i) => {
      if (i >= files.length) {
        wx.hideLoading()
        this.setData({ uploading: false })
        if (failed > 0) {
          wx.showToast({ title: ok + ' 张成功，' + failed + ' 张失败', icon: 'none' })
        } else {
          wx.showToast({ title: '已添加 ' + ok + ' 张', icon: 'success' })
        }
        this.load()
        return
      }
      this.uploadOne(memoryId, files[i]).then(() => {
        ok += 1
      }).catch(() => {
        failed += 1
      }).then(() => {
        next(i + 1)
      })
    }

    next(0)
  },

  // 单张：取凭证 -> 直传（云模式）-> 登记元数据。
  uploadOne(memoryId, file) {
    const tempFilePath = file.tempFilePath
    const mimeType = this.guessMimeType(tempFilePath)

    return api.post('/api/media/upload-credential', { mimeType }).then((data) => {
      const credential = (data && data.credential) || {}
      const uploadUrl = credential.uploadUrl
      const objectKey = credential.objectKey

      const doRegister = (fileUrl) => {
        const payload = {
          memoryId,
          fileUrl,
          objectKey,
          mimeType
        }
        if (typeof file.size === 'number') payload.size = file.size
        if (typeof file.width === 'number') payload.width = file.width
        if (typeof file.height === 'number') payload.height = file.height
        return api.post('/api/media', payload)
      }

      if (uploadUrl) {
        // 云模式：先直传（HTTP PUT 原始字节，适配 COS 预签名 URL），
        // 再用凭证返回的 fileUrl 登记元数据。
        const putMime = credential.mimeType || mimeType
        return this.cloudUpload(uploadUrl, tempFilePath, putMime).then(() => {
          return doRegister(credential.fileUrl)
        })
      }

      // 本地/开发 provider：无 uploadUrl，跳过上传，用本地临时路径登记，
      // 以便当前会话内画廊可直接渲染。
      return doRegister(tempFilePath)
    })
  },

  // 云模式直传：读取文件原始字节，用 HTTP PUT 上传到预签名 URL（COS）。
  // 注意：不能用 wx.uploadFile（multipart POST），COS 预签名 PUT 需要裸字节。
  cloudUpload(uploadUrl, filePath, mimeType) {
    return new Promise((resolve, reject) => {
      // 先读取文件字节为 ArrayBuffer；读取失败则视为该张失败。
      wx.getFileSystemManager().readFile({
        filePath,
        success: (readRes) => {
          const buffer = readRes && readRes.data
          wx.request({
            url: uploadUrl,
            method: 'PUT',
            data: buffer,
            header: { 'Content-Type': mimeType || 'application/octet-stream' },
            success: (res) => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(res)
              } else {
                reject(new Error('上传失败(' + res.statusCode + ')'))
              }
            },
            fail: (e) => reject(new Error((e && e.errMsg) || '上传失败'))
          })
        },
        fail: (e) => reject(new Error((e && e.errMsg) || '读取文件失败'))
      })
    })
  },

  guessMimeType(path) {
    const ext = String(path || '').split('.').pop().toLowerCase()
    if (ext === 'png') return 'image/png'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'gif') return 'image/gif'
    return 'image/jpeg'
  },

  removeMemory() {
    if (this.data.deleting) return
    const id = this.data.memoryId
    wx.showModal({
      title: '删除回忆',
      content: '确定删除这条回忆吗？',
      success: (res) => {
        if (!res.confirm) return
        if (this.data.deleting) return
        this.setData({ deleting: true })
        api.request({ url: '/api/memories/' + id, method: 'DELETE' }).then(() => {
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
