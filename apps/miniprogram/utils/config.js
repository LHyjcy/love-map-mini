// utils/config.js — 按运行环境自动选择 API 配置（CommonJS）
// 取代 app.js 里两处容易忘改的手动开关（baseUrl / enableDevLogin）：
// 开发版连本地后端并开启开发期登录；体验版/正式版连生产域名。

// 生产 API 域名（HTTPS），后端部署好后在这里填一次即可，
// 例如 'https://api.example.com'。留空时体验版/正式版会回退到本地地址并告警。
const PROD_BASE_URL = '';

// 本地联调地址（开发者工具勾选「不校验合法域名」后可用）。
const DEV_BASE_URL = 'http://localhost:3000';

// 读取当前小程序版本：develop=开发版，trial=体验版，release=正式版。
// 读取失败时按开发版处理，保证本地联调可用。
function getEnvVersion() {
  try {
    const info = wx.getAccountInfoSync();
    return (info && info.miniProgram && info.miniProgram.envVersion) || 'develop';
  } catch (e) {
    return 'develop';
  }
}

// 体验版/正式版优先用生产域名；未配置时回退本地地址并提醒填写。
function resolveProdBaseUrl() {
  if (PROD_BASE_URL) {
    return PROD_BASE_URL;
  }
  // eslint-disable-next-line no-console
  console.warn('未配置生产 API 域名，回退本地地址');
  return DEV_BASE_URL;
}

const envVersion = getEnvVersion();

let baseUrl;
let enableDevLogin;
if (envVersion === 'release') {
  // 正式版：只保留微信登录，避免用户点到仅开发可用的登录按钮。
  baseUrl = resolveProdBaseUrl();
  enableDevLogin = false;
} else if (envVersion === 'trial') {
  // 体验版：本应用私用，体验版走体验登录 + 邀请码绑定，保留开发期登录。
  baseUrl = resolveProdBaseUrl();
  enableDevLogin = true;
} else {
  // 开发版：本地联调。
  baseUrl = DEV_BASE_URL;
  enableDevLogin = true;
}

module.exports = { baseUrl, enableDevLogin };
