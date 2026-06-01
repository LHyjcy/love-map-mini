// app.js
App({
  globalData: {
    // 后端 API 基础地址，可按环境修改。生产需配置微信合法域名（https）。
    baseUrl: 'http://localhost:3000',
    token: '',
    userInfo: null,
  },

  onLaunch() {
    // Phase 1 仅初始化骨架；登录与情侣绑定在 Phase 4 实现。
    // eslint-disable-next-line no-console
    console.log('love-map-mini launched');
  },
});
