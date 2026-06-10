# 真机联调清单 — love-map-mini

面向 WeChat 小程序的实操联调清单，按顺序执行。涵盖：本地后端启动、开发者工具模拟器联调、
真机预览/体验版、定位权限声明、分模块联调步骤与预期、常见问题排查、上线前安全自查。

> 约定：后端默认监听 `http://localhost:3000`；小程序 API 基地址在 `apps/miniprogram/app.js`
> 的 `globalData.baseUrl`（当前值 `http://localhost:3000`）。

---

## 1. 本地后端启动

1. 确认 MySQL 已作为系统服务开机自启（见 `docs/DEPLOYMENT.md` §2）。开发机已把 MySQL
   注册为常驻服务，正常情况无需手动拉起。
2. 启动后端（任选其一，**保持窗口开启即服务持续运行**）：
   - 双击 `E:\dt\scripts\start-dev.bat`（内部调用 `start-dev.ps1`，`-NoExit` 保持窗口）；
   - 或终端执行 `npm run dev --workspace apps/api`（`node --watch --env-file=.env --import tsx`，
     自动读取 `apps/api/.env` 并热重启）。
3. 健康检查：浏览器或命令访问 `http://localhost:3000/health`，应返回正常响应。
   - `curl http://localhost:3000/health`
4. 首次或 schema 变更后还需：`npm run prisma:generate --workspace apps/api` 与
   `npm run prisma:migrate --workspace apps/api`（详见 `docs/DEPLOYMENT.md` §3）。

---

## 2. 微信开发者工具（模拟器联调）

1. 打开微信开发者工具，导入 `apps/miniprogram`。
2. **详情 → 本地设置 → 勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**。
   仅模拟器/本地调试可用；真机不生效（见 §3）。
3. 确认 `app.js` 的 `globalData.baseUrl` 指向 `http://localhost:3000`（与本地后端一致）。
4. 编译运行，在模拟器内验证页面能正常请求后端（如首页、登录、地图）。

> 说明：模拟器走宿主机网络，`localhost` 可达；真机不行（见下一节）。

---

## 3. 真机预览 / 体验版

真机环境下 `localhost` **不可用**，且**不能关闭域名校验**。必须完成以下三步：

1. **后端部署到 HTTPS 公网域名**（如 `https://api.example.com`）。部署见 `docs/DEPLOYMENT.md`
   §6，前置 HTTPS 反向代理（Nginx/Caddy）。
2. **修改 `apps/miniprogram/app.js` 的 `globalData.baseUrl`** 为该 HTTPS 域名。
3. **微信公众平台「开发管理 → 服务器域名」配置合法域名**：
   - `request` 合法域名 = 后端 **API 域名**（HTTPS，如 `https://api.example.com`）。
   - `socket` 合法域名 = **wss** 域名，用于位置共享的 `/ws/location` WebSocket。
   - `uploadFile` 合法域名 = **COS 桶域名**（如
     `https://myapp-1250000000.cos.ap-guangzhou.myqcloud.com`），否则真机直传被拦截。
   - `downloadFile` 合法域名 = 如需直接下载存储域名资源时一并配置。

---

## 4. 定位权限声明（app.json）

位置共享 / 实时位置依赖定位权限。需在 `apps/miniprogram/app.json` 声明
`permission.scope.userLocation`（含中文用途说明）与 `requiredPrivateInfos`
（`getLocation`、`onLocationChange`、`startLocationUpdate`）。

> 现状：当前 `app.json` 尚未声明上述字段，仅在 `pages/location/index.js` 使用相关 API。
> 真机联调位置功能前请补上。

**仅前台定位**，本项目**不使用后台定位版本**（不声明 `requiredBackgroundModes: ["location"]`）。

示例片段（合入 `app.json` 顶层对象）：

```json
{
  "permission": {
    "scope.userLocation": {
      "desc": "用于情侣双方互看最新位置与距离，仅在你主动开启位置共享时使用，App 在前台运行，不做后台持续定位。"
    }
  },
  "requiredPrivateInfos": [
    "getLocation",
    "onLocationChange",
    "startLocationUpdate"
  ]
}
```

---

## 5. 分模块联调步骤与预期

### 5.1 真实地图（`pages/map/real/index`）

1. 登录并完成情侣绑定。
2. 进入「加地点」，填写信息（**城市填写如「杭州」**，用于行政区划归属）。
3. 返回真实地图，应出现对应 **marker**。
4. 点击 marker，**底部弹出地点卡片**。

### 5.2 足迹地图（`pages/map/footprint/index`）

1. 进入足迹首页，应看到**四项统计**。
2. **canvas 点亮已到访省份**；点击省份进入市级视图（`.../footprint/province/index`）。
3. 点击城市查看该城市下的回忆（`.../footprint/city/index`）。
4. 验证：完成 5.1 添加「杭州」地点后，**浙江/杭州应点亮**（依赖 `provinceId/cityId`）。

### 5.3 位置共享（`pages/location/index`）

1. 开启位置共享，设置时长（如 **30 分钟**）。
2. 用**另一台设备登录伴侣账号**，应能看到对方**最新位置与距离**。
3. **停止共享后**对方看不到；**到期后**也看不到。
4. 确认全程**无后台持续定位**（App 切后台不再上报）。

### 5.4 照片（上传）

1. 选择图片上传。
2. 预期：`local` provider（默认，仅开发）下图片**仅会话内可见**、不持久化；
   **配齐 COS 后**真机可持久化（见 `docs/DEPLOYMENT.md` §7）。

---

## 6. 常见问题排查

| 现象 | 可能原因 / 处理 |
|---|---|
| `ERR_CONNECTION_REFUSED` | 后端未启动，或 `baseUrl` 配置错误（真机指向了 `localhost`）。先起后端，再核对 §1/§2/§3。 |
| `401` | 未登录或登录态 token 失效。重新登录获取登录态。 |
| WebSocket 连不上 | `socket` 合法域名（wss）未配；或反向代理未放行 Upgrade（Nginx 需 `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`，见 `docs/DEPLOYMENT.md` 地图模块部署）。 |
| 足迹不点亮 | 地点缺 `city` → `provinceId/cityId` 为空。新增时填写城市；存量数据跑 `node --env-file=apps/api/.env scripts/backfill-adcode.mjs` 回填。 |
| 逆地址/搜索/路线返回 `501` | 地图服务商 key 未配（`TENCENT_MAP_KEY`/`AMAP_KEY`/`BAIDU_MAP_AK`，仅后端）。属预期；`distance` 仍可用（Haversine）。 |
| `/api/auth/wechat-login` 返回 `501` | 未配 `WECHAT_APP_ID/SECRET`（开发态预期，配齐后正常）。 |
| 上传无 URL / `501` | `STORAGE_PROVIDER` 仍为 `local`（开发态），或 COS env 未配齐 / `uploadFile` 域名 / bucket CORS 未配。 |

---

## 7. 上线前安全自查

- [ ] **地图服务商 key 不在前端**：`TENCENT_MAP_KEY`/`AMAP_KEY`/`BAIDU_MAP_AK` 仅在后端 env，逆地址/搜索经后端代理。
- [ ] **私有接口鉴权**：每个私有 API 都 `requireAuth` 并校验 `coupleId`（按 user_id + couple_id 控权）。
- [ ] **位置共享有过期**：共享设有时长，停止 / 过期后伴侣不可见。
- [ ] **无后台定位**：未声明后台定位模式，仅前台、用户主动发起。
- [ ] **无真实密钥入库**：未提交 `.env`、JWT_SECRET、WeChat AppSecret、COS/数据库密钥。
- [ ] **公开地图默认关闭**，且不暴露精确家庭/学校/工作坐标（见 `docs/PRIVACY.md`）。

> 配套审查见技能 `security-review` / `privacy-review` 与 `docs/PRIVACY.md`、`docs/DEPLOYMENT.md`。
