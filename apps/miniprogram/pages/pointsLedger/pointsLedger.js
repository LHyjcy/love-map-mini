// pages/pointsLedger/pointsLedger.js
// 积分流水：展示当前积分余额与积分明细（来源可追溯）。
const api = require('../../utils/api.js')

const SOURCE_LABEL = {
  checkin: '打卡',
  task: '任务',
  memory: '回忆',
  signin: '签到',
  manual: '手动',
  redeem: '兑换'
}

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    balance: 0,
    ledger: []
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
    // 等数据真正回来后再收起刷新指示器
    this.load().finally(() => wx.stopPullDownRefresh())
  },

  load() {
    // 余额与流水互相独立，并行请求
    return Promise.all([
      api.get('/api/points/balance'),
      api.get('/api/points/ledger')
    ]).then(([balanceData, data]) => {
      this.setData({ balance: (balanceData && balanceData.balance) || 0 })
      const ledger = ((data && data.ledger) || []).map((it) => {
        const desc = it.description ? (it.description + ' · ') : ''
        return Object.assign({}, it, {
          sourceLabel: SOURCE_LABEL[it.sourceType] || it.sourceType,
          dateText: String(it.createdAt).slice(0, 10),
          metaText: desc + String(it.createdAt).slice(0, 10),
          pointsText: (it.points > 0 ? '+' : '') + it.points,
          positive: it.points >= 0
        })
      })
      this.setData({ ledger, bound: true, ready: true })
    }).catch((err) => {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        this.setData({ bound: false, ready: true })
        return
      }
      this.setData({ ready: true })
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
    })
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' })
  }
})
