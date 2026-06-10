// pages/qa/index.js — 情侣问答（双方回答后才可互看）
const api = require('../../utils/api.js');

Page({
  data: {
    ready: false,
    loading: false,
    loggedIn: false,
    bound: false,
    submitting: false,
    question: null, // { key, text }
    mineAnswer: null,
    partnerAnswered: false,
    revealed: false,
    answers: null, // { mine, partner }，仅 revealed 时存在
    draft: '',
    hint: '',
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
          this.resetState();
          return null;
        }
        return api.get('/api/qa/today');
      })
      .then((d) => {
        if (d) this.applyState(d);
        finish();
      })
      .catch((err) => {
        if (err && err.code === 'NO_ACTIVE_COUPLE') {
          this.setData({ bound: false });
          this.resetState();
        } else {
          wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        }
        finish();
      });
  },

  resetState() {
    this.setData({
      question: null,
      mineAnswer: null,
      partnerAnswered: false,
      revealed: false,
      answers: null,
      draft: '',
      hint: '',
    });
  },

  applyState(d) {
    const mineAnswer = d.mineAnswer || null;
    const partnerAnswered = !!d.partnerAnswered;
    const revealed = !!d.revealed;
    let hint = '';
    if (mineAnswer && !revealed) {
      hint = partnerAnswered
        ? '已提交，等待 TA 回答后即可互看 ❤'
        : '已提交，等待 TA 回答 ❤';
    }
    this.setData({
      question: d.question || null,
      mineAnswer,
      partnerAnswered,
      revealed,
      answers: revealed ? d.answers || null : null,
      hint,
      // 已回答后清空草稿
      draft: mineAnswer ? '' : this.data.draft,
    });
  },

  onDraft(e) {
    this.setData({ draft: e.detail.value });
  },

  submitAnswer() {
    const answer = (this.data.draft || '').trim();
    if (!answer) {
      wx.showToast({ title: '请先写下你的回答', icon: 'none' });
      return;
    }
    if (answer.length > 500) {
      wx.showToast({ title: '回答不能超过 500 字', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    api
      .post('/api/qa/today', { answer })
      .then((d) => {
        if (d) this.applyState(d);
        wx.showToast({ title: '已提交', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' }))
      .then(() => this.setData({ submitting: false }));
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
