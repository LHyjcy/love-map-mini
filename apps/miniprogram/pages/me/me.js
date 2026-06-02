// pages/me/me.js
// 账号 + 情侣绑定页（Phase 4）：mock 登录、生成/接受邀请码、解绑。
const api = require('../../utils/api.js');

Page({
  data: {
    user: null,
    couple: null,
    partner: null,
    inviteCode: '',
    acceptCode: '',
  },

  onShow() {
    if (api.getToken()) {
      this.loadMe();
    }
  },

  // 加载当前用户信息
  loadMe() {
    api
      .get('/api/me')
      .then((data) => {
        this.setData({ user: (data && data.user) || null });
        this.loadCouple();
      })
      .catch((err) => {
        // token 失效或网络错误：清理本地状态，提示用户
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  // 加载当前情侣绑定状态
  loadCouple() {
    api
      .get('/api/couples/current')
      .then((data) => {
        this.setData({
          couple: (data && data.couple) || null,
          partner: (data && data.partner) || null,
        });
      })
      .catch((err) => {
        // 未绑定情侣属于正常情况，这里只在非预期错误时提示
        this.setData({ couple: null, partner: null });
        if (err && err.code && err.code !== 'NOT_FOUND') {
          wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        }
      });
  },

  // 体验登录（mock，每次新建一个用户）
  mockLogin() {
    this.doMockLogin('体验用户', 'u-' + Date.now());
  },

  // 演示账号：登录到已绑定、已有数据的本地演示账号（mockId=alice）
  demoLogin() {
    this.doMockLogin('Alice', 'alice');
  },

  doMockLogin(nickname, mockId) {
    api
      .post('/api/auth/mock-login', { nickname, mockId })
      .then((data) => {
        api.setToken((data && data.token) || '');
        this.setData({ user: (data && data.user) || null });
        this.loadCouple();
        wx.showToast({ title: '登录成功', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      });
  },

  // 退出登录
  logout() {
    api.clearToken();
    this.setData({
      user: null,
      couple: null,
      partner: null,
      inviteCode: '',
      acceptCode: '',
    });
    wx.showToast({ title: '已退出', icon: 'none' });
  },

  // 生成邀请码
  genInvite() {
    api
      .post('/api/couples/invite', {})
      .then((data) => {
        const code = (data && data.couple && data.couple.inviteCode) || '';
        this.setData({ inviteCode: code });
        wx.showToast({ title: '已生成邀请码', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '生成失败', icon: 'none' });
      });
  },

  // 绑定输入框
  onAcceptInput(e) {
    this.setData({ acceptCode: e.detail.value });
  },

  // 接受邀请码完成绑定
  acceptInvite() {
    const code = (this.data.acceptCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    api
      .post('/api/couples/accept', { inviteCode: code })
      .then(() => {
        this.setData({ acceptCode: '' });
        this.loadCouple();
        wx.showToast({ title: '绑定成功', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '绑定失败', icon: 'none' });
      });
  },

  // 解除绑定
  unbind() {
    api
      .post('/api/couples/unbind', {})
      .then(() => {
        this.setData({ couple: null, partner: null, inviteCode: '' });
        wx.showToast({ title: '已解绑', icon: 'none' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '解绑失败', icon: 'none' });
      });
  },
});
