// pages/plan/index.js — 计划中心 hub
// 聚合「想去清单 / 约会计划 / 即将到来」三个板块。
const api = require('../../utils/api.js');

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    wishlist: [], // placeType=wishlist
    plans: [], // placeType=plan
    upcoming: [], // /api/events 中即将到来的事件（含倒计时文案）
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
    const finish = () => {
      this.setData({ ready: true });
      if (typeof done === 'function') done();
    };

    Promise.all([
      api.get('/api/places?placeType=wishlist'),
      api.get('/api/places?placeType=plan'),
      api.get('/api/events'),
    ])
      .then(([wish, plan, events]) => {
        const wishlist = ((wish && wish.places) || []).slice(0, 5);
        const plans = ((plan && plan.places) || []).slice(0, 5);
        const upcoming = this.pickUpcoming((events && events.events) || []);
        this.setData({ bound: true, wishlist, plans, upcoming });
        finish();
      })
      .catch((err) => {
        if (err && err.code === 'NO_ACTIVE_COUPLE') {
          this.setData({ bound: false, wishlist: [], plans: [], upcoming: [] });
          finish();
          return;
        }
        this.setData({ bound: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        finish();
      });
  },

  // 取即将到来（daysUntil >= 0）的前 3 条，并附加倒计时文案。
  pickUpcoming(events) {
    return events
      .filter((e) => typeof e.daysUntil === 'number' && e.daysUntil >= 0)
      .slice(0, 3)
      .map((e) => {
        const d = e.daysUntil;
        let countdown;
        if (d === 0) countdown = '今天';
        else if (d > 0) countdown = d + ' 天后';
        else countdown = '已过 ' + -d + ' 天';
        return Object.assign({}, e, {
          countdown,
          dateText: (e.eventDate || '').slice(0, 10),
        });
      });
  },

  // 想去清单
  goWishlist() {
    wx.navigateTo({ url: '/pages/wishlist/wishlist' });
  },
  goAddPlace() {
    wx.navigateTo({ url: '/pages/addPlace/addPlace' });
  },

  // 约会计划
  goPlanDetail(e) {
    wx.navigateTo({ url: '/pages/planDetail/planDetail?id=' + e.currentTarget.dataset.id });
  },
  goPlanAdd() {
    wx.navigateTo({ url: '/pages/planAdd/planAdd' });
  },

  // 即将到来
  goEvents() {
    wx.navigateTo({ url: '/pages/events/events' });
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
