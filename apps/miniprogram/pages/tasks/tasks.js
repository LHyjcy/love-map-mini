// pages/tasks/tasks.js — 任务页（状态机 + 积分）
const api = require('../../utils/api.js');

const STATUS_TEXT = {
  pending: '待接受',
  accepted: '进行中',
  rejected: '已拒绝',
  completed: '待确认',
  confirmed: '已完成',
  cancelled: '已取消',
};

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    myId: '',
    partner: null,
    tasks: [],
    form: { title: '', points: '' },
  },

  onShow() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false, bound: false });
      return;
    }
    this.setData({ loggedIn: true });
    this.load();
  },

  load() {
    api
      .get('/api/me')
      .then((d) => {
        this.setData({ myId: (d && d.user && d.user.id) || '' });
        return api.get('/api/couples/current');
      })
      .then((d) => {
        const couple = d && d.couple;
        const bound = !!(couple && couple.status === 'active');
        this.setData({ bound, partner: (d && d.partner) || null });
        if (!bound) {
          this.setData({ ready: true, tasks: [] });
          return null;
        }
        return api.get('/api/tasks');
      })
      .then((d) => {
        if (!d) return;
        this.setData({ tasks: this.decorate(d.tasks || []), ready: true });
      })
      .catch((err) => {
        this.setData({ ready: true });
        if (err && err.code !== 'NO_ACTIVE_COUPLE') {
          wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        } else {
          this.setData({ bound: false });
        }
      });
  },

  // 给每个任务附加 UI 标志
  decorate(tasks) {
    const me = this.data.myId;
    return tasks.map((t) => {
      const mine = t.creatorId === me;
      const assigned = t.assigneeId === me;
      return Object.assign({}, t, {
        mine,
        assigned,
        statusText: STATUS_TEXT[t.status] || t.status,
        badgeClass:
          t.status === 'confirmed'
            ? 'green'
            : t.status === 'rejected' || t.status === 'cancelled'
              ? 'gray'
              : '',
        canAccept: assigned && t.status === 'pending',
        canReject: assigned && t.status === 'pending',
        canComplete: assigned && t.status === 'accepted',
        canConfirm: mine && t.status === 'completed',
        canCancel: mine && (t.status === 'pending' || t.status === 'accepted'),
      });
    });
  },

  onTitle(e) {
    this.setData({ 'form.title': e.detail.value });
  },
  onPoints(e) {
    this.setData({ 'form.points': e.detail.value });
  },

  createTask() {
    const title = (this.data.form.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }
    if (!this.data.partner) {
      wx.showToast({ title: '请先绑定情侣', icon: 'none' });
      return;
    }
    const points = Number(this.data.form.points) || 0;
    api
      .post('/api/tasks', { title, assigneeId: this.data.partner.id, points })
      .then(() => {
        this.setData({ form: { title: '', points: '' } });
        wx.showToast({ title: '已发布', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '发布失败', icon: 'none' }));
  },

  act(e) {
    const { id, action } = e.currentTarget.dataset;
    api
      .post(`/api/tasks/${id}/${action}`, {})
      .then(() => {
        wx.showToast({ title: '已操作', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
