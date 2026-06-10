// pages/interact/index.js — 互动中心 hub（任务/积分/商城/背包 + 今日心情/情侣问答）
const api = require('../../utils/api.js');

// 心情 emoji 映射
const MOOD_EMOJI = {
  happy: '😊',
  miss: '🥰',
  tired: '😪',
  angry: '😠',
  hug: '🤗',
  calm: '😌',
};

// 入口行配置
const ENTRIES = [
  { key: 'tasks', label: '任务', desc: '发布与完成情侣任务', url: '/pages/tasks/tasks' },
  { key: 'shop', label: '情侣商城', desc: '上架、兑换与背包', url: '/pages/shop/shop' },
  { key: 'mood', label: '今日心情', desc: '记录此刻的心情', url: '/pages/mood/index' },
  { key: 'qa', label: '情侣问答', desc: '每日一题，了解彼此', url: '/pages/qa/index' },
  { key: 'ledger', label: '积分流水', desc: '查看积分收支明细', url: '/pages/pointsLedger/pointsLedger' },
];

Page({
  data: {
    ready: false,
    loading: false,
    loggedIn: false,
    bound: false,
    balance: 0,
    entries: ENTRIES,
    // 今日心情 mini（加载失败则隐藏）
    moodReady: false,
    myMood: '未填写',
    partnerMood: '未填写',
    // 情侣问答 mini（加载失败则隐藏）
    qaReady: false,
    qaStatus: '',
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false, bound: false });
      return;
    }
    this.setData({ loggedIn: true });
    this.load();
  },

  onPullDownRefresh() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false, bound: false });
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ loggedIn: true });
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return api
      .get('/api/couples/current')
      .then((d) => {
        const bound = !!(d && d.couple && d.couple.status === 'active');
        this.setData({ bound });
        if (!bound) {
          this.setData({ ready: true, loading: false });
          return null;
        }
        return api.get('/api/points/balance');
      })
      .then((bal) => {
        if (bal === null) return;
        this.setData({
          balance: (bal && bal.balance) || 0,
          ready: true,
          loading: false,
        });
        // 两个 mini 单独加载并各自降级，不影响主流程
        this.loadMood();
        this.loadQa();
      })
      .catch((err) => {
        this.setData({ ready: true, loading: false });
        if (err && err.code === 'NO_ACTIVE_COUPLE') this.setData({ bound: false });
        else wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  // 今日心情 mini：失败则隐藏，不报错
  loadMood() {
    api
      .get('/api/moods/today')
      .then((d) => {
        const mine = d && d.mine;
        const partner = d && d.partner;
        this.setData({
          moodReady: true,
          myMood: this.moodText(mine),
          partnerMood: this.moodText(partner),
        });
      })
      .catch(() => {
        this.setData({ moodReady: false });
      });
  },

  moodText(m) {
    if (!m || !m.mood) return '未填写';
    return MOOD_EMOJI[m.mood] || m.mood;
  },

  // 情侣问答 mini：失败则隐藏，不报错
  loadQa() {
    api
      .get('/api/qa/today')
      .then((d) => {
        let status;
        if (!d || d.mineAnswer == null) status = '去回答';
        else if (d.revealed) status = '已揭晓';
        else status = '等待 TA';
        this.setData({ qaReady: true, qaStatus: status });
      })
      .catch(() => {
        this.setData({ qaReady: false });
      });
  },

  // 入口行跳转
  goEntry(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: '页面暂未上线', icon: 'none' }),
    });
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
