// pages/map/map.js
// 情侣地点地图（Phase 5）：加载 marker 列表并渲染到内置 map 组件。
const api = require('../../utils/api.js');

Page({
  data: {
    title: '地图',
    markers: [],
    latitude: 39.908, // 默认北京中心
    longitude: 116.397,
  },

  onShow() {
    if (api.getToken()) {
      this.loadMarkers();
    }
  },

  // 加载地点 marker
  loadMarkers() {
    api
      .get('/api/places/markers')
      .then((data) => {
        const list = (data && data.markers) || [];
        // 微信 map 组件要求 marker id 为 Number，这里使用数组下标。
        const markers = list.map((m, index) => ({
          id: index,
          latitude: m.latitude,
          longitude: m.longitude,
          callout: {
            content: m.title || '',
            display: 'ALWAYS',
          },
        }));

        const update = { markers };
        // 若有地点，把地图中心移到第一个 marker
        if (markers.length > 0) {
          update.latitude = markers[0].latitude;
          update.longitude = markers[0].longitude;
        }
        this.setData(update);
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  goAddPlace() {
    wx.navigateTo({ url: '/pages/addPlace/addPlace' });
  },
  goCheckin() {
    wx.navigateTo({ url: '/pages/checkin/checkin' });
  },
  goMemories() {
    wx.navigateTo({ url: '/pages/memories/memories' });
  },
});
