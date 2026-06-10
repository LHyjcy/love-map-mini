// pages/home/home.js — 首页 dashboard（接 /api/dashboard）
const api = require('../../utils/api.js');

// 心情 code -> emoji 映射
const MOOD_EMOJI = {
  happy: '😊',
  miss: '🥰',
  tired: '😪',
  angry: '😠',
  hug: '🤗',
  calm: '😌',
};

function moodEmoji(code) {
  if (!code) return '未填写';
  return MOOD_EMOJI[code] || '未填写';
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    bound: false,
    dash: null,
    // 今日心情卡（仅绑定后展示；接口异常时隐藏）
    moodReady: false,
    myMood: '未填写',
    partnerMood: '未填写',
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    // 等数据真正回来后再收起刷新指示器
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    if (!api.getToken()) {
      this.setData({ loading: false, loggedIn: false, bound: false, dash: null });
      return Promise.resolve();
    }
    this.setData({ loggedIn: true });
    return api
      .get('/api/dashboard')
      .then((dash) => {
        this.setData({ dash, bound: true, loading: false });
        this.loadMoods();
      })
      .catch((e) => {
        // 未绑定情侣时后端返回 NO_ACTIVE_COUPLE
        const unbound = e && e.code === 'NO_ACTIVE_COUPLE';
        this.setData({ loading: false, bound: false, dash: null, moodReady: false });
        if (!unbound) {
          wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
        }
      });
  },

  // 今日心情（绑定后才有）。接口异常则隐藏卡片，不影响首页。
  loadMoods() {
    api
      .get('/api/moods/today')
      .then((res) => {
        const r = res || {};
        // 兼容 { mine, partner } / { my, ta } 等字段命名
        const mine = r.mine || r.my || r.me || r.self || {};
        const partner = r.partner || r.ta || r.other || {};
        this.setData({
          moodReady: true,
          myMood: moodEmoji(mine && mine.mood),
          partnerMood: moodEmoji(partner && partner.mood),
        });
      })
      .catch(() => {
        this.setData({ moodReady: false });
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
    wx.switchTab({ url: '/pages/map/index' });
  },

  goPlanTab() {
    wx.switchTab({ url: '/pages/plan/index' });
  },

  goInteract() {
    wx.switchTab({ url: '/pages/interact/index' });
  },

  goTasks() {
    // 任务不再是 tabBar 页面，改用 navigateTo
    wx.navigateTo({ url: '/pages/tasks/tasks' });
  },

  goMood() {
    wx.navigateTo({ url: '/pages/mood/index' });
  },

  goQa() {
    wx.navigateTo({ url: '/pages/qa/index' });
  },

  goEvents() {
    // 日程不在 tabBar 中，用 navigateTo 进入
    wx.navigateTo({ url: '/pages/events/events' });
  },

  goTimeline() {
    // 时间轴不在 tabBar 中，用 navigateTo 进入
    wx.navigateTo({ url: '/pages/timeline/timeline' });
  },

  goWishlist() {
    // 想去清单不在 tabBar 中，用 navigateTo 进入
    wx.navigateTo({ url: '/pages/wishlist/wishlist' });
  },

  // 快捷入口（按产品功能规划：打卡 / 写回忆 / 发任务 / 添加计划）
  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' });
  },
  goMemories() {
    wx.navigateTo({ url: '/pages/memories/memories' });
  },
  goAddPlace() {
    wx.navigateTo({ url: '/pages/addPlace/addPlace' });
  },
  goPlan() {
    wx.navigateTo({ url: '/pages/planAdd/planAdd' });
  },
});
