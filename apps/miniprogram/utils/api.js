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

// 鉴权失效统一处理的防抖时间戳：3 秒内多个请求同时 401 时，
// 只弹一次「登录已过期」提示、只跳一次「我的」页。
let lastUnauthorizedAt = 0;

// 鉴权失效统一处理：清 token、同步全局状态、提示并引导用户去重新登录。
function handleUnauthorized() {
  clearToken();
  // 同步清空 globalData.token（启动早期 getApp() 可能拿不到 app 实例，需判空）。
  const app = typeof getApp === 'function' ? getApp() : null;
  if (app && app.globalData) {
    app.globalData.token = '';
  }
  const now = Date.now();
  if (now - lastUnauthorizedAt < 3000) {
    return;
  }
  lastUnauthorizedAt = now;
  wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
  // 「我的」页是登录入口（tabBar 页面），引导用户直接重新登录。
  wx.switchTab({ url: '/pages/me/me' });
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
      timeout: 15000,
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
        // 鉴权失效：清除本地过期 token、同步全局状态，并提示/跳转到登录入口（带防抖）。
        // 仍以相同的错误结构 reject，调用方 catch 行为不变。
        if (res.statusCode === 401 || error.code === 'UNAUTHORIZED') {
          handleUnauthorized();
        }
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
