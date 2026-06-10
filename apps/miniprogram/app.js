// app.js
// 按运行环境（开发版/体验版/正式版）自动选择的 API 配置，
// 生产域名只需在 utils/config.js 的 PROD_BASE_URL 填一次。
const config = require('./utils/config.js');

App({
  globalData: {
    // 后端 API 基础地址：开发版连本地，体验版/正式版连生产域名（https，需配置微信合法域名）。
    baseUrl: config.baseUrl,
    // 开发期登录（演示账号 / 体验登录）开关：开发版/体验版为 true，正式版自动关闭，
    // 避免邀请来的人点到仅开发可用的登录按钮。
    enableDevLogin: config.enableDevLogin,
    token: '',
    userInfo: null,
  },

  onLaunch() {
    // 从本地存储引导 token 到 globalData（只读便利字段，
    // 鉴权仍以 utils/api.js 的 getToken() 为准）。
    try {
      this.globalData.token = wx.getStorageSync('token') || '';
    } catch (e) {
      this.globalData.token = '';
    }
    // eslint-disable-next-line no-console
    console.log('love-map-mini launched');
  },
});
