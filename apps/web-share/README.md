# web-share（公开地图分享页）

只读、免登录的公开情侣地图分享页。纯静态站点，无构建步骤、无需 `npm install`，
仅通过 CDN 引入 Leaflet 1.9.x。

## 文件

- `index.html` — 页面骨架，CDN 加载 Leaflet（CSS + JS），含标题头、地图容器、地点/回忆列表。
- `config.js` — 运行时部署配置，定义 `window.LOVE_MAP_CONFIG.API_BASE`，在 `app.js` 之前加载。
- `app.js` — 从 URL 查询参数 `?code=<shareCode>` 读取分享码，调用后端接口并渲染。
- `styles.css` — 简洁响应式样式（地图高度约 60vh）。

## 后端接口约定

`GET {API_BASE}/api/public-map/:shareCode`（免登录）

成功：

```json
{
  "success": true,
  "data": {
    "share": { "title": "我们的地图" },
    "places": [
      { "id": 1, "title": "第一次约会", "placeType": "visited", "city": "北京", "latitude": 39.9, "longitude": 116.39 }
    ],
    "memories": [{ "id": 1, "title": "一起看日落", "memoryDate": "2024-05-01T00:00:00.000Z", "placeId": 1 }]
  }
}
```

未找到 / 已关闭：HTTP 404 + `{ "success": false, "error": { "code": "...", "message": "..." } }`。

坐标已在服务端模糊化（约 3 位小数 / ~110m），本页不做任何精确定位。

## 本地运行

1. 启动后端 API（默认 `http://localhost:3000`）。
2. 静态托管本目录，例如：

   ```bash
   # 任选其一
   npx serve apps/web-share
   # 或
   python -m http.server 8080   # 在本目录内执行
   ```

3. 浏览器访问并带上分享码：

   ```
   http://localhost:3000-static-host/index.html?code=<shareCode>
   # 例如使用 npx serve 默认端口：
   http://localhost:3000/index.html?code=abc123   （以实际静态服务端口为准）
   ```

   注意：必须通过 HTTP 静态服务器访问，直接用 `file://` 打开时浏览器会因 CORS / fetch 限制无法请求接口。

## 生产部署

本目录为纯静态站点，**无构建步骤、无需 `npm install`**，可直接部署到任意静态托管
（对象存储 + CDN、Nginx、Vercel/Netlify 等）。生产部署无需修改任何代码逻辑，
仅需配置 `config.js` 与后端 CORS。

### 步骤

1. **设置 API 源地址**：编辑 `config.js`，把 `API_BASE` 改为生产后端的源地址：

   ```js
   // config.js
   window.LOVE_MAP_CONFIG = { API_BASE: 'https://api.example.com' };
   ```

   - `config.js` 在 `index.html` 中先于 `app.js` 加载；若该文件缺失或未定义，
     `app.js` 会优雅回退到 `http://localhost:3000`（仅用于本地兜底，生产请务必设置）。
   - 修改后无需重新构建，刷新页面即可生效（前提：静态托管对 `config.js` 关闭缓存，
     见下方 Nginx 示例）。

2. **静态托管本目录**：将整个目录（`index.html` / `app.js` / `config.js` / `styles.css`）
   原样上传即可。可使用任意静态托管，或使用仓库内提供的 Nginx 示例
   [`nginx.conf.sample`](./nginx.conf.sample)：

   ```bash
   cp apps/web-share/nginx.conf.sample /etc/nginx/conf.d/love-map-share.conf
   # 修改其中的 server_name 与 root，然后：
   nginx -t && systemctl reload nginx
   ```

   该示例已配置：正确的 MIME 类型、静态资源长缓存、`config.js` 强制 NO-cache
   （便于切换后端源后立即生效），并含 HTTPS（certbot）与 CORS 的说明注释。

3. **后端必须放行本站点来源（CORS）**：本页直接跨域 `fetch` 后端接口，
   后端从环境变量 `PUBLIC_WEB_ORIGIN` 读取允许的来源，必须设置为**本静态站点的实际源**：

   ```
   PUBLIC_WEB_ORIGIN=https://share.example.com
   ```

   否则浏览器会拦截响应（CORS 错误）。

4. **必须使用 HTTPS**：
   - 微信内置浏览器要求 HTTPS；
   - 页面为 HTTPS 时，`config.js` 中的 `API_BASE` 也**必须是 HTTPS**，
     否则浏览器会因「混合内容（mixed content）」拦截对后端的请求。
   - 推荐用 certbot 一键签发并自动续期：`certbot --nginx -d share.example.com`。

5. **打开分享页**：访问形如下面的链接（`<shareCode>` 由后端分享接口生成）：

   ```
   https://share.example.com/index.html?code=<shareCode>
   ```

## 行为说明

- 无 `code` 参数：提示缺少分享码。
- 接口 404 / 失败：展示友好提示「分享不存在或已关闭」。
- 成功：以 `share.title` 作为页面标题与头部；为每个地点添加 Leaflet 标记，
  弹窗显示标题、类型标签（已去过 / 想去 / 计划中）、城市；自动缩放至所有标记范围
  （无地点时使用默认中心）。下方渲染地点与回忆列表，并显示隐私说明
  「坐标已做模糊处理，仅展示公开内容」。
