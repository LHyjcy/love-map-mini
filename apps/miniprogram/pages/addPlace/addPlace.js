const api = require('../../utils/api.js')

Page({
  data: {
    latitude: 39.908,
    longitude: 116.397,
    title: '',
    address: '',
    typeIndex: 0,
    typeLabels: ['去过', '想去', '计划'],
    typeValues: ['visited', 'wishlist', 'plan'],
    markers: []
  },

  onShow() {
    if (!api.getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
    }
  },

  onMapTap(e) {
    const latitude = e.detail.latitude
    const longitude = e.detail.longitude
    this.setData({
      latitude: latitude,
      longitude: longitude,
      markers: [{ id: 1, latitude: latitude, longitude: longitude }]
    })
  },

  useCurrentLocation() {
    const that = this
    wx.getLocation({
      type: 'gcj02',
      success(res) {
        that.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          markers: [{ id: 1, latitude: res.latitude, longitude: res.longitude }]
        })
      },
      fail() {
        wx.showToast({ title: '获取位置失败', icon: 'none' })
      }
    })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
  },

  onAddressInput(e) {
    this.setData({ address: e.detail.value })
  },

  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) })
  },

  onSave() {
    const data = this.data
    const title = (data.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请输入标题', icon: 'none' })
      return
    }
    if (!api.getToken()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    api.post('/api/places', {
      title: title,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      placeType: data.typeValues[data.typeIndex]
    }).then(function () {
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(function () {
        wx.navigateBack()
      }, 600)
    }).catch(function (err) {
      if (err && err.code === 'NO_ACTIVE_COUPLE') {
        wx.showToast({ title: '请先绑定情侣', icon: 'none' })
      } else {
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
      }
    })
  }
})
