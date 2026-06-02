// utils/api.js — 简单的请求封装（CommonJS）
// 统一响应格式：{ success:boolean, data?, error?:{ code, message } }

function getToken() {
  return wx.getStorageSync('token') || '';
}

function setToken(t) {
  wx.setStorageSync('token', t);
}

function clearToken() {
  wx.removeStorageSync('token');
}

function request({ url, method = 'GET', data } = {}) {
  const app = getApp();
  const baseUrl = (app && app.globalData && app.globalData.baseUrl) || '';
  const token = getToken();

  const header = { 'content-type': 'application/json' };
  if (token) {
    header.Authorization = 'Bearer ' + token;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + url,
      method,
      data,
      header,
      success(res) {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.success === true) {
          resolve(body.data);
          return;
        }
        const err = body.error || {};
        const error = new Error(err.message || '请求失败');
        error.code = err.code || 'REQUEST_FAILED';
        error.statusCode = res.statusCode;
        reject(error);
      },
      fail(e) {
        const error = new Error((e && e.errMsg) || '网络错误');
        error.code = 'NETWORK_ERROR';
        reject(error);
      },
    });
  });
}

function get(url) {
  return request({ url, method: 'GET' });
}

function post(url, data) {
  return request({ url, method: 'POST', data });
}

module.exports = { request, get, post, getToken, setToken, clearToken };
