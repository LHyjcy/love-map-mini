// pages/mood/index.js — 今日心情
const api = require('../../utils/api.js');

const MOODS = [
  { key: 'happy', emoji: '😊', label: '开心' },
  { key: 'miss', emoji: '🥰', label: '想你' },
  { key: 'tired', emoji: '😪', label: '累了' },
  { key: 'angry', emoji: '😠', label: '生气' },
  { key: 'hug', emoji: '🤗', label: '要抱抱' },
  { key: 'calm', emoji: '😌', label: '平静' },
];
const MOOD_MAP = MOODS.reduce((m, x) => ((m[x.key] = x), m), {});

Page({
  data: {
    ready: false,
    loading: false,
    loggedIn: false,
    bound: false,
    submitting: false,
    moods: MOODS,
    selected: '', // 我今天选中的心情 key
    note: '', // 我的备注
    partner: null, // { emoji, label, note } | null
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
    this.load(() => wx.stopPullDownRefresh());
  },

  load(done) {
    this.setData({ loading: true });
    const finish = () => {
      this.setData({ ready: true, loading: false });
      if (typeof done === 'function') done();
    };
    api
      .get('/api/couples/current')
      .then((d) => {
        const bound = !!(d && d.couple && d.couple.status === 'active');
        this.setData({ bound });
        if (!bound) {
          this.setData({ selected: '', note: '', partner: null });
          return null;
        }
        return api.get('/api/moods/today');
      })
      .then((d) => {
        if (d) this.applyToday(d);
        finish();
      })
      .catch((err) => {
        if (err && err.code === 'NO_ACTIVE_COUPLE') this.setData({ bound: false });
        else wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        finish();
      });
  },

  applyToday(d) {
    const mine = d && d.mine;
    const partner = d && d.partner;
    this.setData({
      selected: mine && MOOD_MAP[mine.mood] ? mine.mood : '',
      note: (mine && mine.note) || '',
      partner: this.decoratePartner(partner),
    });
  },

  decoratePartner(p) {
    if (!p || !MOOD_MAP[p.mood]) return null;
    const m = MOOD_MAP[p.mood];
    return { emoji: m.emoji, label: m.label, note: (p.note || '').trim() };
  },

  pickMood(e) {
    this.setData({ selected: e.currentTarget.dataset.key });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  saveMood() {
    if (this.data.submitting) return;
    if (!this.data.selected) {
      wx.showToast({ title: '请选择今天的心情', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    api
      .post('/api/moods', {
        mood: this.data.selected,
        note: (this.data.note || '').trim(),
      })
      .then(() => {
        wx.showToast({ title: '已保存', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' }))
      .then(() => this.setData({ submitting: false }));
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
