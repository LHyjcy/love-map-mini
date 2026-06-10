// pages/feedback/index.js
// 意见反馈：提交反馈 + 查看我的反馈列表。
// 需要登录；不要求情侣绑定（反馈在未绑定时也可用）。
const api = require('../../utils/api.js')

const MAX_CONTENT = 1000
const MAX_CONTACT = 100

Page({
  data: {
    ready: false,
    loggedIn: false,
    content: '',
    contact: '',
    submitting: false,
    list: [],
    maxContent: MAX_CONTENT,
    maxContact: MAX_CONTACT
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
      this.setData({ ready: true, loggedIn: false })
      wx.stopPullDownRefresh()
      return
    }
    this.setData({ loggedIn: true })
    this.load(true)
  },

  load(fromPull) {
    api.get('/api/feedback').then((data) => {
      const list = ((data && data.feedback) || []).map((f) => ({
        id: f.id,
        content: f.content,
        contact: f.contact || '',
        status: f.status,
        statusText: f.status === 'closed' ? '已处理' : '待处理',
        statusClass: f.status === 'closed' ? 'green' : 'gray',
        dateText: f.createdAt ? String(f.createdAt).slice(0, 10) : ''
      }))
      this.setData({ list, ready: true })
      if (fromPull) wx.stopPullDownRefresh()
    }).catch((err) => {
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
      if (fromPull) wx.stopPullDownRefresh()
    })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value })
  },

  submit() {
    if (this.data.submitting) return
    const content = (this.data.content || '').trim()
    if (!content) {
      wx.showToast({ title: '请先填写反馈内容', icon: 'none' })
      return
    }
    const contact = (this.data.contact || '').trim()
    const body = { content }
    if (contact) body.contact = contact

    this.setData({ submitting: true })
    api.post('/api/feedback', body).then(() => {
      this.setData({ submitting: false, content: '', contact: '' })
      wx.showToast({ title: '已提交，谢谢你的反馈', icon: 'none' })
      this.load()
    }).catch((err) => {
      this.setData({ submitting: false })
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' })
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  }
})
