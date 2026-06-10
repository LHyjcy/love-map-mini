// pages/me/me.js
// 账号 + 情侣绑定页（Phase 4）：mock 登录、生成/接受邀请码、解绑。
const api = require('../../utils/api.js');

Page({
  data: {
    user: null,
    couple: null,
    partner: null,
    coupleStatusText: '',
    inviteCode: '',
    acceptCode: '',
    // 是否显示开发期登录按钮（演示账号/体验登录）。体验版置 false，只留微信登录。
    enableDevLogin: true,
    // 各操作进行中的标记，用于防止重复点击
    loading: {
      wechat: false,
      invite: false,
      accept: false,
      unbind: false,
      export: false,
    },
  },

  // 设置某个操作的进行中状态（基于路径，避免覆盖其它标记）
  setLoading(key, value) {
    this.setData({ ['loading.' + key]: value });
  },

  // 把后端状态码转成温暖、易懂的中文
  formatCoupleStatus(status) {
    const map = {
      active: '在一起 ❤',
      ACTIVE: '在一起 ❤',
      pending: '等待对方确认',
      PENDING: '等待对方确认',
    };
    return map[status] || '在一起 ❤';
  },

  onLoad() {
    // 从全局配置读取「是否显示开发登录」，体验版只保留微信登录。
    try {
      const app = getApp();
      const enable = !!(app && app.globalData && app.globalData.enableDevLogin);
      this.setData({ enableDevLogin: enable });
    } catch (e) {
      // 读取失败时保守地隐藏开发登录
      this.setData({ enableDevLogin: false });
    }
  },

  onShow() {
    if (api.getToken()) {
      this.loadAll();
    }
  },

  onPullDownRefresh() {
    if (!api.getToken()) {
      wx.stopPullDownRefresh();
      return;
    }
    // 等数据真正回来后再收起刷新指示器
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  // 用户信息与情侣状态互相独立，并行加载
  loadAll() {
    return Promise.all([this.loadMe(), this.loadCouple()]);
  },

  // 把邀请码分享给 TA（点「分享给 TA」按钮 / 右上角菜单触发）
  onShareAppMessage() {
    const code = (this.data.inviteCode || '').trim();
    if (code) {
      return {
        title: `来和我一起记录我们的足迹 ❤ 邀请码：${code}`,
        path: '/pages/me/me',
      };
    }
    return {
      title: '恋迹地图 · 记录我们一起走过的每个地方',
      path: '/pages/me/me',
    };
  },

  // 复制邀请码到剪贴板
  copyInvite() {
    const code = (this.data.inviteCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请先生成邀请码', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' }),
    });
  },

  // 加载当前用户信息
  loadMe() {
    return api
      .get('/api/me')
      .then((data) => {
        this.setData({ user: (data && data.user) || null });
      })
      .catch((err) => {
        // token 失效或网络错误：清理本地状态，提示用户
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  // 加载当前情侣绑定状态
  loadCouple() {
    return api
      .get('/api/couples/current')
      .then((data) => {
        const couple = (data && data.couple) || null;
        this.setData({
          couple,
          partner: (data && data.partner) || null,
          coupleStatusText: couple ? this.formatCoupleStatus(couple.status) : '',
        });
      })
      .catch((err) => {
        // 未绑定情侣属于正常情况，这里只在非预期错误时提示
        this.setData({ couple: null, partner: null, coupleStatusText: '' });
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
        this.finishLogin(data);
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      });
  },

  // 登录成功后的统一收尾：写入 token、用户信息、加载情侣、提示
  finishLogin(data) {
    api.setToken((data && data.token) || '');
    this.setData({ user: (data && data.user) || null });
    this.loadCouple();
    wx.showToast({ title: '登录成功', icon: 'success' });
  },

  // 微信登录（未配置时优雅降级，体验/演示登录仍可用）
  wechatLogin() {
    if (this.data.loading.wechat) return;
    this.setLoading('wechat', true);
    wx.login({
      success: (res) => {
        api
          .post('/api/auth/wechat-login', { code: res.code, nickname: '微信用户' })
          .then((data) => {
            this.finishLogin(data);
          })
          .catch((err) => {
            if (err && err.code === 'WECHAT_NOT_CONFIGURED') {
              wx.showToast({ title: '微信登录未配置，开发环境请用体验/演示登录', icon: 'none' });
            } else {
              wx.showToast({ title: err.message || '微信登录失败', icon: 'none' });
            }
          })
          .then(() => {
            this.setLoading('wechat', false);
          });
      },
      fail: () => {
        this.setLoading('wechat', false);
        wx.showToast({ title: '微信登录失败，请重试', icon: 'none' });
      },
    });
  },

  // 导出情侣全部数据到剪贴板（需已登录并绑定）
  exportData() {
    if (!api.getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (this.data.loading.export) return;
    this.setLoading('export', true);
    wx.showLoading({ title: '导出中…' });
    api
      .get('/api/export')
      .then((result) => {
        wx.setClipboardData({
          data: JSON.stringify(result),
          success: () => {
            wx.showToast({ title: '数据已复制到剪贴板', icon: 'none' });
          },
        });
      })
      .catch((err) => {
        if (err && err.code === 'NO_ACTIVE_COUPLE') {
          wx.showToast({ title: '请先绑定情侣', icon: 'none' });
        } else {
          wx.showToast({ title: err.message || '导出失败', icon: 'none' });
        }
      })
      .then(() => {
        wx.hideLoading();
        this.setLoading('export', false);
      });
  },

  // 跳转到功能页（非 tabBar 页面）
  goPage(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({ url });
    }
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

  // 注销账号（个保法）：二次确认 → 软删除+匿名化+解绑 → 清本地登录态。
  deleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销后将匿名化你的账号并解除情侣绑定，且不可恢复。确定继续吗？',
      confirmText: '确认注销',
      confirmColor: '#c0392b',
      success: (res) => {
        if (!res.confirm) return;
        api.post('/api/account/delete', {}).then(() => {
          api.clearToken();
          this.setData({ user: null, couple: null, partner: null, inviteCode: '', acceptCode: '' });
          wx.showToast({ title: '账号已注销', icon: 'none' });
        }).catch((err) => {
          wx.showToast({ title: (err && err.message) || '注销失败', icon: 'none' });
        });
      },
    });
  },

  // 生成邀请码
  genInvite() {
    if (this.data.loading.invite) return;
    this.setLoading('invite', true);
    api
      .post('/api/couples/invite', {})
      .then((data) => {
        const code = (data && data.couple && data.couple.inviteCode) || '';
        this.setData({ inviteCode: code });
        wx.showToast({ title: '已生成邀请码', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '生成失败', icon: 'none' });
      })
      .then(() => {
        this.setLoading('invite', false);
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
    if (this.data.loading.accept) return;
    this.setLoading('accept', true);
    api
      .post('/api/couples/accept', { inviteCode: code })
      .then(() => {
        this.setData({ acceptCode: '' });
        this.loadCouple();
        wx.showToast({ title: '绑定成功，从此一起记录 ❤', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '绑定失败', icon: 'none' });
      })
      .then(() => {
        this.setLoading('accept', false);
      });
  },

  // 扫码绑定：扫描对方分享的二维码（内容为邀请码），复用接受邀请流程
  scanBind() {
    wx.scanCode({
      success: (res) => {
        const code = ((res && res.result) || '').trim();
        if (!code) {
          wx.showToast({ title: '未识别到邀请码', icon: 'none' });
          return;
        }
        this.setData({ acceptCode: code }, () => {
          this.acceptInvite();
        });
      },
      fail: () => {
        wx.showToast({ title: '扫码已取消', icon: 'none' });
      },
    });
  },

  // 解除绑定（需二次确认）
  unbind() {
    if (this.data.loading.unbind) return;
    wx.showModal({
      title: '解除绑定',
      content: '解绑后将不再与对方同步地点和回忆，确定要解除吗？',
      confirmText: '解除绑定',
      confirmColor: '#d9534f',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return;
        this.doUnbind();
      },
    });
  },

  doUnbind() {
    if (this.data.loading.unbind) return;
    this.setLoading('unbind', true);
    api
      .post('/api/couples/unbind', {})
      .then(() => {
        this.setData({ couple: null, partner: null, coupleStatusText: '', inviteCode: '' });
        wx.showToast({ title: '已解除绑定', icon: 'none' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '解绑失败', icon: 'none' });
      })
      .then(() => {
        this.setLoading('unbind', false);
      });
  },
});
