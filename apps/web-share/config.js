// 部署配置（运行时读取，无需修改 app.js）。
// 生产环境只需将 API_BASE 改为已部署后端的源地址，例如 'https://api.example.com'。
// 注意：后端需对本静态站点的来源开启 CORS（后端读取 PUBLIC_WEB_ORIGIN）。
window.LOVE_MAP_CONFIG = { API_BASE: 'http://localhost:3000' };
