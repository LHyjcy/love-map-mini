# DEPLOYMENT — love-map-mini

本文档覆盖后端、数据库、对象存储、微信小程序的部署与配置。**任何真实密钥都只放在
部署环境的 `.env` / 密钥管理服务里，绝不提交仓库。**

生产环境变量模板见 `apps/api/.env.production.example`（复制为 `.env` 填真实值）。

## 上线检查清单（P0）

剩余 3 项 P0 上线工作。每块给出确切步骤与需要填写的 env / 配置项。密钥一律用占位值，真实值只注入部署环境。

### A. 微信登录

- [ ] 在**微信公众平台**（开发管理 → 开发设置）获取 **AppID** 与 **AppSecret**。
- [ ] 填入 env：`WECHAT_APP_ID=<wx-app-id>`、`WECHAT_APP_SECRET=<wx-app-secret>`（AppSecret 仅服务端读取，切勿提交）。
- [ ] 在小程序后台「开发管理 → 服务器域名」把后端 **API 域名**加入 **`request` 合法域名**（必须 HTTPS，如 `https://api.example.com`）。
- [ ] 小程序 `app.js` 的 `globalData.baseUrl` 改为生产 **https** 域名。
- [ ] 用**真机**验证 `POST /api/auth/wechat-login` 走通（`wx.login` → 后端换取 openid → 签发登录态）。
- [ ] 注意：开发环境因未配置 AppID/AppSecret，`/api/auth/wechat-login` 返回 **501** 属预期，配齐后即正常。

### B. 照片存储（COS）

- [ ] 在腾讯云**创建 bucket**（名称**含 APPID**，如 `myapp-1250000000`）。
- [ ] 填入 env：`STORAGE_PROVIDER=cos`、`STORAGE_REGION=ap-guangzhou`、`STORAGE_BUCKET=myapp-1250000000`、`STORAGE_ACCESS_KEY_ID=<cos-secret-id>`、`STORAGE_ACCESS_KEY_SECRET=<cos-secret-key>`，可选 `STORAGE_PUBLIC_BASE_URL`（CDN/自定义域名）。
- [ ] 在 **COS 控制台为该 bucket 配置 CORS**：允许来源为小程序的 **`PUT`**（含 `Content-Type` 等必要 header），并为 `fileUrl` 读取配置适当访问权限（私有读+签名 或 受控公共读）。
- [ ] 在小程序后台把 **bucket 域名**（如 `https://myapp-1250000000.cos.ap-guangzhou.myqcloud.com`）加入 **`uploadFile` 合法域名**，否则真机直传被拦截。
- [ ] 验证：运行 `node --env-file=apps/api/.env scripts/verify-cos.mjs`（该脚本由团队另一成员创建）确认签名直传可用。

### C. 公开地图部署（web-share）

- [ ] 部署 `apps/web-share` **静态站点**（Nginx / 对象存储静态网站 / Vercel 等）。
- [ ] 设置该站 `config.js` 的 **`API_BASE`** 为生产 API 来源。
- [ ] 后端 env **`PUBLIC_WEB_ORIGIN`** 收紧为该站点确切域名（如 `https://share.example.com`），不再用默认 `*`。
- [ ] 小程序 `publicShare` 页的 **`WEB_SHARE_BASE`** 改为已部署的 web-share URL。

完成上述三块即满足 P0 上线条件；详细背景见下文各章节。

## 1. 环境要求

- Node.js ≥ 18（后端用到全局 `fetch`）
- MySQL ≥ 8（或兼容版本）
- 微信小程序开发者工具（前端调试）
- 微信小程序 AppID + AppSecret（Phase 11 真实登录）
- 对象存储 bucket（COS/OSS，Phase 12 图片直传）

## 2. 数据库（MySQL 8）

本项目跑在 **MySQL 8** 上。

**Windows（开发机做法，作为常驻服务）**：把 MySQL 注册成系统服务并设为开机自启，避免每次手动拉起。

```powershell
# 以管理员身份运行（mysqld 路径与 my.ini 按本机实际填写）
mysqld --install MySQL --defaults-file="C:\mysql\my.ini"
net start MySQL
# 设为开机自启（Automatic）
Set-Service -Name MySQL -StartupType Automatic
```

之后建库并创建专用账号（示例）：

```sql
CREATE DATABASE love_map_mini CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'love_map'@'%' IDENTIFIED BY '<db-password>';
GRANT ALL PRIVILEGES ON love_map_mini.* TO 'love_map'@'%';
FLUSH PRIVILEGES;
```

**Linux 服务器**：用系统自带的 MySQL（`apt install mysql-server` / `yum install mysql-server`），
`systemctl enable --now mysql` 设为常驻自启，其余建库/建号同上。

`DATABASE_URL` 统一格式：

```
mysql://用户:密码@主机:3306/love_map_mini
```

迁移见 §5（生产用 `npx prisma migrate deploy`）。

## 3. 本地开发

```bash
npm install
cp apps/api/.env.example apps/api/.env     # 按需填写本地值（至少 DATABASE_URL / JWT_SECRET）
# MySQL 服务已起（见 §2）后：
npm run prisma:generate --workspace apps/api
npm run prisma:migrate  --workspace apps/api   # 首次建表（prisma migrate dev）
npm run dev --workspace apps/api                # http://localhost:3000
curl http://localhost:3000/health
```

`npm run dev` 现为 `node --watch --env-file=.env --import tsx src/server.ts`，会**自动读取
`apps/api/.env`** 并在文件变更时热重启。

> 说明：`tsx watch` 子命令不会把 `--env-file` 透传给被监听进程，所以这里改用 **Node 原生
> flag**（`node --watch --env-file` + `--import tsx`）来同时拿到热重载与 `.env` 自动加载。

小程序：用微信开发者工具导入 `apps/miniprogram`，在 `app.js` 的 `globalData.baseUrl`
指向后端地址（本地调试可在开发者工具关闭「校验合法域名」）。

## 4. 环境变量

见 `apps/api/.env.example`。**生产用真实环境变量注入密钥（容器 env / 密钥管理服务 /
进程管理器的 env 配置），`.env` 文件仅用于本地，绝不提交仓库。**

### 生产必备清单

```bash
NODE_ENV=production            # 生产会禁用 mock 登录
PORT=3000
HOST=0.0.0.0
DATABASE_URL=mysql://love_map:<db-password>@127.0.0.1:3306/love_map_mini
JWT_SECRET=<生产强随机密钥>      # 缺失会直接启动失败（绝不回退占位值）
JWT_EXPIRES_IN=7d
```

启用**真实微信登录**时追加：

```bash
WECHAT_APP_ID=<wx-app-id>
WECHAT_APP_SECRET=<wx-app-secret>
```

启用**对象存储直传**时追加（密钥仅服务端读取）：

```bash
STORAGE_PROVIDER=cos                       # cos | oss | disk | local（local 仅开发；disk 见 §7）
STORAGE_REGION=ap-guangzhou
STORAGE_BUCKET=myapp-1250000000            # COS 含 APPID
STORAGE_ACCESS_KEY_ID=<access-key-id>
STORAGE_ACCESS_KEY_SECRET=<access-key-secret>
STORAGE_PUBLIC_BASE_URL=https://cdn.example.com   # 可选，CDN/自定义域名
```

公开地图页（web-share）：

```bash
PUBLIC_WEB_ORIGIN=https://share.example.com  # CORS 精确来源；默认 * 仅供开发
```

启用 **AI 文案**（回忆/分享/回顾智能生成）时追加（**均可选**，密钥仅服务端读取）：

```bash
AI_API_KEY=<openai-compatible-api-key>            # 不设则全部走本地模板兜底（无外部调用）
AI_API_BASE=https://api.openai.com/v1             # OpenAI 兼容网关地址
AI_MODEL=gpt-4o-mini                              # 使用的模型名
```

> **未配置 `AI_API_KEY` 时，`/api/ai/*` 自动回落本地模板**（`source: "template"`），不发起任何外部
> 调用，开发/生产均可正常使用；`AI_API_KEY` **仅后端环境变量读取，绝不返回前端、绝不入日志**。

### 字段说明

| 变量 | 必填 | 说明 |
|---|---|---|
| `NODE_ENV` | 生产=production | 生产环境会**禁用 mock 登录** |
| `PORT` / `HOST` | 否 | 监听端口/地址；容器内常用 `HOST=0.0.0.0` |
| `DATABASE_URL` | 是 | `mysql://用户:密码@主机:3306/love_map_mini` |
| `JWT_SECRET` | 生产必填 | 登录令牌签名密钥；**生产缺失会启动失败**（绝不回退占位值） |
| `JWT_EXPIRES_IN` | 否 | 默认 `7d` |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 微信登录必填 | 未配置时 `/api/auth/wechat-login` 返回 501 |
| `STORAGE_PROVIDER` | 否 | `cos` / `oss` / `disk`(自托管磁盘) / `local`(默认，仅开发) |
| `STORAGE_DISK_DIR` | disk 时可选 | 照片落盘目录（默认 `uploads`；容器部署务必挂持久卷） |
| `MOCK_LOGIN_ENABLED` | 否 | 生产显式设 `true` 才开放体验登录（私用「体验登录+邀请码绑定」需要） |
| `STORAGE_REGION` | 直传时 | 地域，如 `ap-guangzhou` |
| `STORAGE_BUCKET` | 直传时 | bucket 名（COS **含 APPID**），如 `myapp-1250000000` |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_ACCESS_KEY_SECRET` | 直传时 | **仅服务端读取，绝不进前端、绝不提交仓库** |
| `STORAGE_PUBLIC_BASE_URL` | 否 | CDN/自定义域名；不设则用默认存储域名拼 `fileUrl` |
| `PUBLIC_WEB_ORIGIN` | 否 | 公开地图页 CORS 允许来源；默认 `*`，**生产应设为精确来源**，如 `https://share.example.com` |
| `AI_API_KEY` | 否 | AI 文案的 OpenAI 兼容密钥；**不设则全部走本地模板兜底**（无外部调用）。仅服务端读取，绝不进前端/日志 |
| `AI_API_BASE` | 否 | AI 网关地址，如 `https://api.openai.com/v1` |
| `AI_MODEL` | 否 | 使用的模型名，如 `gpt-4o-mini` |

## 5. 数据库迁移

```bash
# 生产：应用已有迁移（不会改 schema，只跑 migrations/）
cd apps/api && npx prisma migrate deploy
```

初始迁移在 `apps/api/prisma/migrations/`。schema 变更时本地 `prisma migrate dev` 生成新
迁移并提交，生产再 `migrate deploy`。

## 6. 后端生产部署

### 构建

```bash
npm install --workspaces --include-workspace-root
npm run prisma:generate --workspace apps/api
npm run build --workspace apps/api          # 产出 apps/api/dist/
```

### 常驻运行

生产不要用 `npm run dev`（watch 模式）。用进程管理器把编译产物**常驻**起来，密钥通过真实
环境变量注入：

```bash
# 直接运行（密钥已在进程环境变量中时）
NODE_ENV=production node apps/api/dist/server.js

# 或读取一个仅存在于服务器、不入 Git 的 env 文件
node --env-file=.env apps/api/dist/server.js
```

PM2 示例（推荐，自带重启/日志/开机自启）：

```bash
pm2 start apps/api/dist/server.js --name love-map-api \
  --env production
pm2 save           # 保存进程列表
pm2 startup        # 生成开机自启脚本（按提示执行输出的命令）
```

建议：

- 用进程管理（PM2/systemd）或容器（Docker）运行，前置 HTTPS 反向代理（Nginx/Caddy）。
- 微信小程序要求后端为 **HTTPS 合法域名**；在小程序后台「开发管理 → 服务器域名」
  配置 `request` 与 `uploadFile` 合法域名。
- 健康检查接 `/health`。

## 7. 对象存储（腾讯云 COS 签名直传）

后端用纯 Node `crypto` 实现 COS **签名 V5**，**不依赖厂商 SDK**；前端拿到预签名 PUT
URL 后直传，密钥仅在服务端 env，绝不下发也绝不提交仓库。

启用步骤：

1. 设置 env：
   - `STORAGE_PROVIDER=cos`
   - `STORAGE_REGION`（如 `ap-guangzhou`）
   - `STORAGE_BUCKET`（**含 APPID**，如 `myapp-1250000000`）
   - `STORAGE_ACCESS_KEY_ID` / `STORAGE_ACCESS_KEY_SECRET`
   - 可选 `STORAGE_PUBLIC_BASE_URL`（CDN/自定义域名；不设则用默认 COS 域名拼 `fileUrl`）
2. 预签名 PUT URL 有效期约 **10 分钟**；后端已限制 ≤10MB 与图片 mime。
3. 在 **COS 控制台为 bucket 配置 CORS**：允许来自小程序的 `PUT`（含 `Content-Type`
   等必要 header），并为 `fileUrl` 的读取配置合适的访问权限（私有读+签名访问或受控公共读）。
4. `local` provider（默认）**仅用于开发**，不返回上传 URL。

### disk（自托管磁盘，免 COS——私用推荐）

照片直接存到 API 服务器磁盘，适合两人私用、不想开通对象存储的场景
（`docs/PRIVATE_USE.md` 的推荐照片方案）：

1. 设置 env：
   - `STORAGE_PROVIDER=disk`
   - `STORAGE_PUBLIC_BASE_URL`（**必填**，本服务对外可达的基础地址，如
     `https://api.example.com`；缺失时签发凭证返回 `500 STORAGE_NOT_CONFIGURED`）
   - 可选 `STORAGE_DISK_DIR`（默认 `uploads`）
2. 上传走本服务 `PUT /api/media/upload?key&exp&sig`（HMAC 短时签名，10 分钟），读取走
   `GET /files/<objectKey>`（已删除照片 404；`Cache-Control: private`）。
3. **持久化与备份**：docker-compose 已把 `/app/uploads` 挂到 `api_uploads` 卷，容器重建照片不丢；
   裸机部署请定期备份 `STORAGE_DISK_DIR` 目录。
4. 小程序 `uploadFile`/`request` 合法域名需包含 API 自身域名（disk 模式下图片上传/读取都走它）。

## 8. 公开地图页（web-share）与 CORS

后端内置**极简手写 CORS**（`apps/api/src/plugins/cors.ts`，无新增依赖），读取
`PUBLIC_WEB_ORIGIN`（默认 `*`）。CORS 头**只下发给公开只读路由 `/api/public-map/*`**，
私有 API 一律不带 CORS 头（保留浏览器同源防线）。**生产应设为已部署的 web-share 精确来源**，
如 `PUBLIC_WEB_ORIGIN=https://share.example.com`。

web-share（`apps/web-share`）是纯静态站点：`index.html` + `app.js` + `config.js` +
`styles.css`，Leaflet 走 CDN。部署：

1. 在 `config.js` 把 `API_BASE` 设为生产 API 来源。
2. 把整个目录托管到任意静态主机（Nginx / 对象存储静态网站 / Vercel 等）。
3. 公开地图入口为 `index.html?code=<shareCode>`；页面调用公开接口
   `GET /api/public-map/:shareCode`（无需鉴权），仅渲染**已模糊处理的公开内容**。

小程序 `publicShare` 页用 `WEB_SHARE_BASE` 拼分享链接，需设为已部署的 web-share URL。

## 9. 微信小程序发布

- 在小程序后台「开发管理 → 服务器域名」配置**合法域名**：
  - `request` 合法域名 = 生产后端 **HTTPS** 域名（如 `https://api.example.com`）。
  - `uploadFile` 合法域名 = 生产后端 HTTPS 域名；**直传 COS/OSS 时还需把对象存储域名
    （如 `https://myapp-1250000000.cos.ap-guangzhou.myqcloud.com`）也加入 `uploadFile`
    合法域名**，否则真机直传会被拦截。
- 真实登录走 `wx.login` → `POST /api/auth/wechat-login`。
- 体验版 → 提交审核 → 发布。审核需提供隐私政策（位置/相册/相机用途说明，见
  `docs/PRIVACY.md`）。

## 10. 隐私与合规

- 位置共享、公开地图**默认关闭**；申请相册/相机/位置权限需在小程序内说明用途。
- 见 `docs/PRIVACY.md` 与 `docs/THIRD_PARTY_NOTICES.md`。

## 11. 排查

- 启动即退出：多为 `JWT_SECRET`（生产）或 `DATABASE_URL` 缺失/不可连。
- 业务接口 500 且日志为 Prisma 连接错误：检查 `DATABASE_URL` 与 MySQL 可达性。
- `/api/auth/wechat-login` 返回 501：未配置 `WECHAT_APP_ID/SECRET`。
- 上传凭证返回 501 或无上传 URL：`STORAGE_PROVIDER` 仍为 `local`（开发态），或 COS
  相关 env 未配齐。
- web-share 跨域报错（CORS）：检查后端 `PUBLIC_WEB_ORIGIN` 是否为站点精确来源。
- 小程序直传 COS 失败：检查 COS 控制台 bucket CORS 与 `uploadFile` 合法域名。

## 12. 运营底座（错误日志 / 限流，均为内置，无外部依赖）

- **错误日志**：服务端级错误（`statusCode >= 500`）由统一错误处理器**即发即忘**异步写入
  数据库表 **`ErrorLog`**（`method/url/statusCode/code?/message?/userId?`），用于线上排查接口异常。
  写库随 Prisma 迁移自动建表，**无需任何额外服务**；日志写入失败绝不影响响应。
- **接口限流**：`/api/auth/*`、`/api/couples/invite`、`/api/couples/accept` 启用**内置内存限流**
  （固定窗口，按 IP+路径，60s/30 次→`429 RATE_LIMITED`），**无第三方依赖**。
  注意为**进程内计数**：进程重启清零、多实例不共享，仅作第一道防线；如需跨实例强限流可在
  反向代理层（Nginx `limit_req` 等）另加一层。

## 地图模块部署

### 环境变量（apps/api/.env，详见 .env.example）
- `REDIS_URL`：位置共享最新位置缓存 + 跨实例。**未设置时退化为进程内内存**（仅单实例可用；多实例生产必须配 Redis）。
- `MAP_PROVIDER`（默认 tencent）/`MAP_FALLBACK_PROVIDER`、`TENCENT_MAP_KEY`/`AMAP_KEY`/`BAIDU_MAP_AK`：地图服务商 key，**仅后端**。
  未配 key 时逆地址/搜索/路线返回 501，`distance` 仍可用（Haversine）。

### WebSocket
- 后端已注册 `/ws/location`（`@fastify/websocket`）。生产经反向代理时需放行 WS 升级（Nginx：`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`）。
- 小程序 `socket` 合法域名需加入后端域名（wss）。

### GeoJSON 足迹数据
- 省/市边界放 `apps/api/assets/geo/`（已含全国 `100000_full.json` 与浙江 `330000_full.json`）。
- `/api/geo/province/:adcode` 在本地文件缺失时会在线拉取 DataV GeoAtlas 并缓存到该目录；生产建议预热常用省份或预先放齐文件。数据来源与许可见 `docs/THIRD_PARTY_NOTICES.md`。

### 行政区划 adcode 回填
- 存量地点（早于地图改造）可执行：`node --env-file=apps/api/.env scripts/backfill-adcode.mjs` 依据 city/province 文本补 `provinceId/cityId`，使其参与足迹点亮。

### Redis（本地，可选）
- 与 MySQL 同样方式在本机运行一个 Redis（或 Memurai/WSL）；设置 `REDIS_URL=redis://127.0.0.1:6379` 后位置最新点改走 Redis。不配则自动用内存兜底，本地开发无需 Redis。
