// pages/home/home.js — 首页 dashboard（接 /api/dashboard）
const api = require('../../utils/api.js');

Page({
  data: {
    loading: true,
    loggedIn: false,
    bound: false,
    dash: null,
  },

  onShow() {
    this.load();
  },

  load() {
    if (!api.getToken()) {
      this.setData({ loading: false, loggedIn: false, bound: false, dash: null });
      return;
    }
    this.setData({ loggedIn: true });
    api
      .get('/api/dashboard')
      .then((dash) => {
        this.setData({ dash, bound: true, loading: false });
      })
      .catch((e) => {
        // 未绑定情侣时后端返回 NO_ACTIVE_COUPLE
        const unbound = e && e.code === 'NO_ACTIVE_COUPLE';
        this.setData({ loading: false, bound: false, dash: null });
        if (!unbound) {
          wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
        }
      });
  },

  signin() {
    api
      .post('/api/points/signin')
      .then(() => {
        wx.showToast({ title: '签到 +5' });
        this.load();
      })
      .catch((e) => {
        const done = e && e.code === 'ALREADY_SIGNED_IN_TODAY';
        wx.showToast({ title: done ? '今日已签到' : '签到失败', icon: 'none' });
      });
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' });
  },

  goTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' });
  },

  goEvents() {
    // 日程不在 tabBar 中，用 navigateTo 进入
    wx.navigateTo({ url: '/pages/events/events' });
  },
});
