// pages/publicShare/publicShare.js
// 公开分享：创建/查看公开地图分享记录，并可开启或关闭分享。
// 隐私约束：公开分享默认关闭；仅展示 public 内容；坐标模糊化与内容渲染属后续版本。
const api = require('../../utils/api.js')

// web-share 公开地图页的基础地址。生产环境请改为已部署的 web-share 页面 URL，
// 例如 'https://share.example.com/index.html'。最终分享链接为 WEB_SHARE_BASE + '?code=' + shareCode。
const WEB_SHARE_BASE = 'http://localhost:8080/index.html'

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    shares: [],
    title: '',
    creating: false,
    togglingId: ''
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
    api.get('/api/public-shares').then((data) => {
      const shares = ((data && data.shares) || []).map((s) => Object.assign({}, s, {
        createdText: String(s.createdAt).slice(0, 10),
        // shareUrl 仅在分享已开启时有意义
        shareUrl: WEB_SHARE_BASE + '?code=' + s.shareCode
      }))
      this.setData({ shares, bound: true, ready: true })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },

  createShare() {
    if (this.data.creating) return
    const title = (this.data.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请输入分享标题', icon: 'none' })
      return
    }
    this.setData({ creating: true })
    api.post('/api/public-shares', { title }).then(() => {
      this.setData({ title: '', creating: false })
      wx.showToast({ title: '已创建', icon: 'success' })
      this.load()
    }).catch((err) => {
      this.setData({ creating: false })
      wx.showToast({ title: (err && err.message) || '创建失败', icon: 'none' })
    })
  },

  toggleShare(e) {
    if (this.data.togglingId) return
    const { id, enabled } = e.currentTarget.dataset
    const action = enabled ? 'disable' : 'enable'
    this.setData({ togglingId: id })
    api.post('/api/public-shares/' + id + '/' + action, {}).then(() => {
      this.setData({ togglingId: '' })
      wx.showToast({ title: enabled ? '已关闭' : '已开启', icon: 'none' })
      this.load()
    }).catch((err) => {
      this.setData({ togglingId: '' })
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
    })
  },

  copyUrl(e) {
    const url = e.currentTarget.dataset.url
    if (!url) {
      return
    }
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: '链接已复制', icon: 'none' })
      }
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  }
})
