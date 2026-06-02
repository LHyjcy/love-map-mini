// pages/shop/shop.js — 情侣商城与兑换背包
const api = require('../../utils/api.js');

const RDM_TEXT = { unused: '未使用', used: '已使用', cancelled: '已取消' };

Page({
  data: {
    ready: false,
    loggedIn: false,
    bound: false,
    tab: 'shop', // shop | bag
    balance: 0,
    items: [],
    redemptions: [],
    form: { title: '', pricePoints: '', stock: '' },
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
          this.setData({ ready: true });
          return null;
        }
        return Promise.all([
          api.get('/api/points/balance'),
          api.get('/api/shop/items'),
          api.get('/api/shop/redemptions'),
        ]);
      })
      .then((res) => {
        if (!res) return;
        const [bal, items, rdm] = res;
        this.setData({
          balance: (bal && bal.balance) || 0,
          items: this.decorateItems((items && items.items) || []),
          redemptions: this.decorateRdm((rdm && rdm.redemptions) || []),
          ready: true,
        });
      })
      .catch((err) => {
        this.setData({ ready: true });
        if (err && err.code === 'NO_ACTIVE_COUPLE') this.setData({ bound: false });
        else wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  decorateItems(items) {
    const bal = this.data.balance;
    return items.map((it) =>
      Object.assign({}, it, {
        canRedeem: it.status === 'active' && it.stock > 0 && bal >= it.pricePoints,
      })
    );
  },

  decorateRdm(list) {
    return list.map((r) =>
      Object.assign({}, r, {
        statusText: RDM_TEXT[r.status] || r.status,
        badgeClass: r.status === 'used' ? 'gray' : r.status === 'cancelled' ? 'gray' : 'green',
      })
    );
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  onTitle(e) {
    this.setData({ 'form.title': e.detail.value });
  },
  onPrice(e) {
    this.setData({ 'form.pricePoints': e.detail.value });
  },
  onStock(e) {
    this.setData({ 'form.stock': e.detail.value });
  },

  createItem() {
    const title = (this.data.form.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请输入商品名称', icon: 'none' });
      return;
    }
    api
      .post('/api/shop/items', {
        title,
        pricePoints: Number(this.data.form.pricePoints) || 0,
        stock: Number(this.data.form.stock) || 0,
      })
      .then(() => {
        this.setData({ form: { title: '', pricePoints: '', stock: '' } });
        wx.showToast({ title: '已上架', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '上架失败', icon: 'none' }));
  },

  redeem(e) {
    const id = e.currentTarget.dataset.id;
    api
      .post(`/api/shop/items/${id}/redeem`, {})
      .then(() => {
        wx.showToast({ title: '兑换成功', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '兑换失败', icon: 'none' }));
  },

  useRdm(e) {
    const id = e.currentTarget.dataset.id;
    api
      .post(`/api/shop/redemptions/${id}/use`, {})
      .then(() => {
        wx.showToast({ title: '已核销', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
  },

  cancelRdm(e) {
    const id = e.currentTarget.dataset.id;
    api
      .post(`/api/shop/redemptions/${id}/cancel`, {})
      .then(() => {
        wx.showToast({ title: '已退回', icon: 'success' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' }));
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
