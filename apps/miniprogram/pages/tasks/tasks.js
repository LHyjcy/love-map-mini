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

// 快捷任务模板：点一下即可填入创建表单
const TEMPLATES = [
  { title: '夸夸对方', points: 5 },
  { title: '一起合照', points: 10 },
  { title: '准备一次约会', points: 20 },
  { title: '手写一封信', points: 15 },
  { title: '一起打卡新地点', points: 10 },
];

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    myId: '',
    partner: null,
    tasks: [],
    templates: TEMPLATES,
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

  onPullDownRefresh() {
    if (!api.getToken()) {
      this.setData({ ready: true, loggedIn: false, bound: false });
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ loggedIn: true });
    // 等数据真正回来后再收起刷新指示器
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  load() {
    // 三个请求互相独立，并行发出；未绑定时 /api/tasks 抛 NO_ACTIVE_COUPLE，由 catch 统一处理
    return Promise.all([
      api.get('/api/me'),
      api.get('/api/couples/current'),
      api.get('/api/tasks'),
    ])
      .then(([meData, coupleData, taskData]) => {
        const couple = coupleData && coupleData.couple;
        const bound = !!(couple && couple.status === 'active');
        this.setData({
          myId: (meData && meData.user && meData.user.id) || '',
          bound,
          partner: (coupleData && coupleData.partner) || null,
        });
        if (!bound) {
          this.setData({ ready: true, tasks: [] });
          return;
        }
        this.setData({ tasks: this.decorate((taskData && taskData.tasks) || []), ready: true });
      })
      .catch((err) => {
        this.setData({ ready: true });
        if (err && err.code !== 'NO_ACTIVE_COUPLE') {
          wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        } else {
          this.setData({ bound: false, tasks: [] });
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

  // 点击模板，填入标题与积分
  useTemplate(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const t = TEMPLATES[idx];
    if (!t) return;
    this.setData({ 'form.title': t.title, 'form.points': String(t.points) });
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
