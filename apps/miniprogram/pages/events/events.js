// pages/events/events.js — 纪念日 / 倒计时 / 约会计划
const api = require('../../utils/api.js');

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
    loggedIn: false,
    bound: false,
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

  load() {
    api
      .get('/api/couples/current')
      .then((d) => {
        const bound = !!(d && d.couple && d.couple.status === 'active');
        this.setData({ bound });
        if (!bound) {
          this.setData({ ready: true, events: [] });
          return null;
        }
        return api.get('/api/events');
      })
      .then((d) => {
        if (!d) return;
        this.setData({ events: this.decorate(d.events || []), ready: true });
      })
      .catch((err) => {
        this.setData({ ready: true });
        if (err && err.code === 'NO_ACTIVE_COUPLE') this.setData({ bound: false });
        else wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
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
      .catch((err) => wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' }));
  },

  delEvent(e) {
    const id = e.currentTarget.dataset.id;
    api
      .request({ url: `/api/events/${id}`, method: 'DELETE' })
      .then(() => {
        wx.showToast({ title: '已删除', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' }));
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
