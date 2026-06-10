// pages/events/events.js — 纪念日 / 倒计时 / 约会计划
const api = require('../../utils/api.js');

// 微信订阅消息模板 id 占位符。正式上线前在微信公众平台申请「订阅消息」模板，
// 并把真实模板 id 填到这里（部署时替换）。
const REMINDER_TMPL_ID = 'REPLACE_WITH_REAL_TEMPLATE_ID';

const TYPES = [
  { value: 'anniversary', label: '纪念日' },
  { value: 'date', label: '约会' },
  { value: 'countdown', label: '倒数' },
  { value: 'plan', label: '计划' },
];
const TYPE_LABEL = TYPES.reduce((m, t) => ((m[t.value] = t.label), m), {});

Page({
  data: {
    ready: false,
    loading: false,
    loggedIn: false,
    bound: false,
    submitting: false,
    deletingId: null,
    remindingId: null,
    events: [],
    typeLabels: TYPES.map((t) => t.label),
    form: { title: '', typeIndex: 0, eventDate: '' },
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
    this.setData({ loading: true });
    const finish = () => {
      this.setData({ ready: true, loading: false });
      if (typeof done === 'function') done();
    };
    api
      .get('/api/couples/current')
      .then((d) => {
        const bound = !!(d && d.couple && d.couple.status === 'active');
        this.setData({ bound });
        if (!bound) {
          this.setData({ events: [] });
          return null;
        }
        return api.get('/api/events');
      })
      .then((d) => {
        if (d) this.setData({ events: this.decorate(d.events || []) });
        finish();
      })
      .catch((err) => {
        if (err && err.code === 'NO_ACTIVE_COUPLE') this.setData({ bound: false });
        else wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        finish();
      });
  },

  decorate(events) {
    return events.map((e) => {
      const d = e.daysUntil;
      let countdown;
      if (d === 0) countdown = '今天';
      else if (d > 0) countdown = d + ' 天后';
      else countdown = '已过 ' + -d + ' 天';
      return Object.assign({}, e, {
        typeLabel: TYPE_LABEL[e.eventType] || e.eventType,
        countdown,
        dateText: (e.eventDate || '').slice(0, 10),
        badgeClass: d > 0 ? '' : d === 0 ? 'green' : 'gray',
      });
    });
  },

  onTitle(e) {
    this.setData({ 'form.title': e.detail.value });
  },
  onType(e) {
    this.setData({ 'form.typeIndex': Number(e.detail.value) });
  },
  onDate(e) {
    this.setData({ 'form.eventDate': e.detail.value });
  },

  createEvent() {
    const title = (this.data.form.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!this.data.form.eventDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    api
      .post('/api/events', {
        title,
        eventType: TYPES[this.data.form.typeIndex].value,
        eventDate: this.data.form.eventDate + 'T00:00:00.000Z',
      })
      .then(() => {
        this.setData({ form: { title: '', typeIndex: 0, eventDate: '' } });
        wx.showToast({ title: '已添加', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' }))
      .then(() => this.setData({ submitting: false }));
  },

  delEvent(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.deletingId) return;
    this.setData({ deletingId: id });
    api
      .request({ url: `/api/events/${id}`, method: 'DELETE' })
      .then(() => {
        wx.showToast({ title: '已删除', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }))
      .then(() => this.setData({ deletingId: null }));
  },

  remindMe(e) {
    const eventId = e.currentTarget.dataset.id;
    const remindAt = e.currentTarget.dataset.date || null;
    // 防止重复点击同一条日程
    if (this.data.remindingId === eventId) return;
    this.setData({ remindingId: eventId });
    const self = this;
    wx.requestSubscribeMessage({
      tmplIds: [REMINDER_TMPL_ID],
      success() {
        // 用户已授权（正式模板时生效）：记录订阅并提示已开启
        self.recordSubscription(eventId, remindAt, '已开启提醒');
      },
      fail() {
        // 开发环境下模板 id 为占位符会走到这里；不崩溃，
        // 仍记录订阅意向，方便联调，并提示模板待配置。
        self.recordSubscription(eventId, remindAt, '提醒已记录（订阅模板待配置）');
      },
    });
  },

  recordSubscription(eventId, remindAt, successToast) {
    api
      .post('/api/notifications/subscribe', {
        templateId: REMINDER_TMPL_ID,
        eventId,
        remindAt,
      })
      .then(() => {
        if (successToast) wx.showToast({ title: successToast, icon: 'none' });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '提醒开启失败', icon: 'none' });
      })
      .then(() => this.setData({ remindingId: null }));
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
