// pages/profile/index.js
// Love Map 小档案：积累「关于我 / 关于 TA」的小事实，并回顾我们的问答历史。
const api = require('../../utils/api.js');

// 快捷填充的常见 key（点击后预填到 key 输入框）
const QUICK_KEYS = ['喜欢吃', '想去', '最近压力', '需要的陪伴'];

Page({
  data: {
    // 四态：loading / not-logged-in / not-bound / ready
    status: 'loading',
    mine: [],
    partner: [],
    qaHistory: [],
    quickKeys: QUICK_KEYS,
    formKey: '',
    formValue: '',
    saving: false,
    // 正在删除的 fact id 集合，避免重复点击
    deletingIds: {},
  },

  onShow() {
    this.reload();
  },

  onPullDownRefresh() {
    this.reload();
  },

  // 加载档案；统一处理四态
  reload() {
    if (!api.getToken()) {
      this.setData({ status: 'not-logged-in' });
      wx.stopPullDownRefresh();
      return;
    }
    if (this.data.status !== 'loading') {
      // 下拉刷新时不强制切回 loading，避免闪烁，但首次保持 loading
    }
    api
      .get('/api/profile')
      .then((data) => {
        this.setData({
          status: 'ready',
          mine: (data && data.mine) || [],
          partner: (data && data.partner) || [],
          qaHistory: (data && data.qaHistory) || [],
        });
      })
      .catch((err) => {
        if (err && (err.code === 'NO_ACTIVE_COUPLE' || err.code === 'NOT_BOUND')) {
          this.setData({ status: 'not-bound' });
        } else if (err && (err.statusCode === 401 || err.code === 'UNAUTHORIZED')) {
          this.setData({ status: 'not-logged-in' });
        } else {
          // 其它错误：保持当前可用状态，仅提示
          if (this.data.status === 'loading') {
            this.setData({ status: 'ready' });
          }
          wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        }
      })
      .then(() => {
        wx.stopPullDownRefresh();
      });
  },

  onKeyInput(e) {
    this.setData({ formKey: e.detail.value });
  },

  onValueInput(e) {
    this.setData({ formValue: e.detail.value });
  },

  // 点击快捷 key 芯片：预填 key 输入框
  fillKey(e) {
    const key = e.currentTarget.dataset.key;
    if (key) {
      this.setData({ formKey: key });
    }
  },

  // 保存一条事实（按 key upsert）
  saveFact() {
    if (this.data.saving) return;
    const key = (this.data.formKey || '').trim();
    const value = (this.data.formValue || '').trim();
    if (!key) {
      wx.showToast({ title: '请填写名称', icon: 'none' });
      return;
    }
    if (key.length > 40) {
      wx.showToast({ title: '名称最多 40 字', icon: 'none' });
      return;
    }
    if (!value) {
      wx.showToast({ title: '请填写内容', icon: 'none' });
      return;
    }
    if (value.length > 200) {
      wx.showToast({ title: '内容最多 200 字', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    api
      .post('/api/profile/fact', { key, value })
      .then(() => {
        this.setData({ formKey: '', formValue: '' });
        wx.showToast({ title: '已保存 ❤', icon: 'none' });
        this.reload();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      })
      .then(() => {
        this.setData({ saving: false });
      });
  },

  // 删除一条事实（防重复点击）
  deleteFact(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (this.data.deletingIds[id]) return;
    this.setData({ ['deletingIds.' + id]: true });
    api
      .request({ url: '/api/profile/fact/' + id, method: 'DELETE' })
      .then(() => {
        wx.showToast({ title: '已删除', icon: 'none' });
        const mine = this.data.mine.filter((f) => f.id !== id);
        this.setData({ mine });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
      })
      .then(() => {
        this.setData({ ['deletingIds.' + id]: false });
      });
  },

  // 未登录 / 未绑定时引导到「我的」tab
  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },

  // 跳转到今日问答
  goQa() {
    wx.navigateTo({ url: '/pages/qa/index' });
  },
});
