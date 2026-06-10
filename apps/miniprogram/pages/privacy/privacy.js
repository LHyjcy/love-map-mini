// pages/privacy/privacy.js
// 隐私中心：管理位置、相册、相机、公开分享等授权。
// 后端 PrivacyConsent 为追加写：每次开关都新增一条记录，取每类最新一条决定当前状态。
const api = require('../../utils/api.js')

const CONSENT_VERSION = '1.0'

const TYPES = [
  { key: 'location', label: '位置 / 打卡', desc: '允许在打卡时记录位置；默认关闭，关闭后不共享位置。' },
  { key: 'album', label: '相册', desc: '允许从相册主动选择照片用于回忆。' },
  { key: 'camera', label: '相机', desc: '允许使用相机拍摄照片。' },
  { key: 'public_share', label: '公开地图分享', desc: '允许生成只读公开地图；默认关闭。' }
]

Page({
  data: {
    ready: false,
    loggedIn: false,
    items: [],
    shareSharing: false,
    shareSessionId: '',
    shareExpiresText: '',
    togglingKey: '',
    stopping: false
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
    api.get('/api/privacy/consents').then((data) => {
      const consents = (data && data.consents) || []
      // 列表已按 createdAt 倒序，取每类首次出现（即最新）的记录。
      const latest = {}
      consents.forEach((c) => {
        if (!latest[c.consentType]) latest[c.consentType] = c
      })
      const items = TYPES.map((t) => ({
        key: t.key,
        label: t.label,
        desc: t.desc,
        agreed: latest[t.key] ? !!latest[t.key].agreedAt : false
      }))
      this.setData({ items, ready: true })
      this.loadShareStatus()
    }).catch((err) => {
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  // 位置共享当前状态（用于隐私中心展示 + 一键停止）。
  loadShareStatus() {
    api.get('/api/location/status').then((data) => {
      const mine = data && data.mine
      this.setData({
        shareSharing: !!mine,
        shareSessionId: mine ? mine.id : '',
        shareExpiresText: mine && mine.expiresAt ? String(mine.expiresAt).slice(0, 16).replace('T', ' ') : ''
      })
    }).catch(() => { /* 未绑定/无会话时忽略 */ })
  },

  stopShare() {
    if (this.data.stopping) return
    const id = this.data.shareSessionId
    if (!id) return
    this.setData({ stopping: true })
    api.post('/api/location/share-session/' + id + '/stop', {}).then(() => {
      this.setData({ shareSharing: false, shareSessionId: '', shareExpiresText: '', stopping: false })
      wx.showToast({ title: '已停止共享', icon: 'none' })
    }).catch((err) => {
      this.setData({ stopping: false })
      wx.showToast({ title: (err && err.message) || '停止失败', icon: 'none' })
    })
  },

  goLocation() {
    wx.navigateTo({ url: '/pages/location/index' })
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    const agreed = e.detail.value
    // 已有授权请求在途时，忽略本次切换并把开关还原到当前已知状态，避免重复提交。
    if (this.data.togglingKey) {
      const items = this.data.items.map((it) => Object.assign({}, it))
      this.setData({ items })
      return
    }
    // 乐观更新开关显示，请求完成后再以服务端状态为准。
    const optimistic = this.data.items.map((it) => (
      it.key === key ? Object.assign({}, it, { agreed: !!agreed }) : it
    ))
    this.setData({ items: optimistic, togglingKey: key })
    api.post('/api/privacy/consents', {
      consentType: key,
      version: CONSENT_VERSION,
      agreed
    }).then(() => {
      this.setData({ togglingKey: '' })
      wx.showToast({ title: agreed ? '已开启' : '已关闭', icon: 'none' })
      this.load()
    }).catch((err) => {
      this.setData({ togglingKey: '' })
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' })
      this.load()
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  }
})
