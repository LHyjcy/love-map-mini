// pages/shop/shop.js — 情侣商城与兑换背包
const api = require('../../utils/api.js');

const RDM_TEXT = { unused: '未使用', used: '已使用', cancelled: '已取消' };

Page({
  data: {
    ready: false,
    loading: false,
    loggedIn: false,
    bound: false,
    tab: 'shop', // shop | bag
    balance: 0,
    items: [],
    redemptions: [],
    form: { title: '', pricePoints: '', stock: '' },
    submitting: false, // 上架中
    actingId: '', // 正在兑换/操作的记录或商品 id，避免重复点击
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
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return api
      .get('/api/couples/current')
      .then((d) => {
        const bound = !!(d && d.couple && d.couple.status === 'active');
        this.setData({ bound });
        if (!bound) {
          this.setData({ ready: true, loading: false });
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
        const balance = (bal && bal.balance) || 0;
        this.setData({
          balance,
          items: this.decorateItems((items && items.items) || [], balance),
          redemptions: this.decorateRdm((rdm && rdm.redemptions) || []),
          ready: true,
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ ready: true, loading: false });
        if (err && err.code === 'NO_ACTIVE_COUPLE') this.setData({ bound: false });
        else wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  // balance 通过参数传入，避免读到 setData 尚未提交的旧值
  decorateItems(items, balance) {
    const bal = typeof balance === 'number' ? balance : this.data.balance;
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
    if (this.data.submitting) return;
    const title = (this.data.form.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请输入商品名称', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    api
      .post('/api/shop/items', {
        title,
        pricePoints: Number(this.data.form.pricePoints) || 0,
        stock: Number(this.data.form.stock) || 0,
      })
      .then(() => {
        this.setData({ form: { title: '', pricePoints: '', stock: '' } });
        wx.showToast({ title: '已上架', icon: 'success' });
        return this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '上架失败', icon: 'none' }))
      .then(() => this.setData({ submitting: false }));
  },

  // 兑换、核销、退回共用一个互斥锁 actingId，避免重复点击
  redeem(e) {
    const id = e.currentTarget.dataset.id;
    this.runAction(id, `/api/shop/items/${id}/redeem`, '兑换成功', '兑换失败');
  },

  useRdm(e) {
    const id = e.currentTarget.dataset.id;
    this.runAction(id, `/api/shop/redemptions/${id}/use`, '已核销', '操作失败');
  },

  cancelRdm(e) {
    const id = e.currentTarget.dataset.id;
    this.runAction(id, `/api/shop/redemptions/${id}/cancel`, '已退回', '操作失败');
  },

  runAction(id, url, okText, failText) {
    if (this.data.actingId) return;
    this.setData({ actingId: id });
    api
      .post(url, {})
      .then(() => {
        wx.showToast({ title: okText, icon: 'success' });
        return this.load();
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || failText, icon: 'none' }))
      .then(() => this.setData({ actingId: '' }));
  },

  goMe() {
    wx.switchTab({ url: '/pages/me/me' });
  },
});
