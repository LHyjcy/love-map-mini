# 地图模块改造规划（MAP_MODULE_REFACTOR_PLAN）

> 本文件为 **Phase 1 交付物**：仅做分析与规划，不改任何业务代码。
> 目标：把地图模块改造为「双地图结构（真实地图 + 足迹地图）+ 临时位置共享 + MapProvider 适配层」。
> 借鉴 https://github.com/zkeyoned/map-of-us-template 的**思路**（省份/城市点亮、足迹仪式感），
> **不复制其源码、图片、品牌、文案或本地数据**；GeoJSON/省市数据自行采集自公开来源并预处理。

日期：2026-06-03 · 版本：v1（规划）

---

## 0. 文档范围

- 现状分析（代码级）
- 目标架构与关键技术决策
- 数据模型变更
- API 设计
- 小程序页面结构与改造
- 隐私与安全设计
- Phase 2–10 的文件级执行计划与验收映射
- **需你确认的事项**（新增依赖 / 第三方密钥 / 基础设施）

---

## 1. 现状分析

### 1.1 小程序端
- `app.json`：扁平 `pages/`，**无 subPackages**；tabBar「地图」指向 `pages/map/map`。
- `pages/map/map.*`：单页原生 `<map>`，加载 `/api/places/markers` 或 `/api/places?placeType=`，
  marker `id` 用数组下标 + `markerPlaceIds` 映射真实地点 id；`bindmarkertap` → `placeDetail`；
  顶部 placeType 筛选条；悬浮入口（加地点 / 打卡 / 回忆）。**marker 点击目前是跳详情页，非底部卡片。**
- 已存在相关页：`addPlace`、`checkin`、`memories`、`memoryDetail`、`placeDetail`、`wishlist`、`planAdd/planDetail`、`privacy`、`publicShare`。
- `utils/api.js`：统一封装，`api.get/post(url)` 解析后返回 `data`，`api.request({url,method})` 用于其它方法。
- **无** 足迹地图、**无** 位置共享实时页、**无** GeoJSON/canvas 资产。

### 1.2 后端（apps/api）
- 栈：Fastify v4 + Prisma(MySQL) + Zod + @fastify/jwt；**依赖仅** `@fastify/jwt`、`@prisma/client`、`fastify`、`zod`。
- `checkins.ts`：`POST /api/checkins`、`GET /api/checkins`、`GET /api/checkins/partner-latest`、`DELETE /api/checkins/:id`。
  - 已具备 `shareScope(self/partner/memory)` + `expiresAt`；partner-latest 仅返回未过期且 shareScope∈{partner,memory} 的最近一条；全程 coupleId 隔离；**无后台定位**。
  - **缺**：`coordType`；独立的「共享会话」概念；高频点位表；Redis/WebSocket。
- `places.ts`：CRUD + `markers` + 列表筛选（placeType/city/year）；`Place` 有自由文本 `city/province/country` + `Decimal` 经纬度 + `placeType` + `visibility`。
  - **缺**：`provinceId/cityId`（行政区划 adcode）、`coordType`。
- `co-checkin.ts`、`export.ts`、`publicMap.ts`、`search.ts`、`plans.ts` 等已存在。
- `services/storage.ts`：COS 预签名直传已实现（纯 crypto）。
- `plugins/cors.ts`：手写 CORS。
- **无** MapProvider、**无** Redis 客户端、**无** WebSocket 插件。
- 运行环境：本机 MySQL 已服务化（开机自启）；`.env`/`.env.example`/`.env.production.example` 已就绪。

### 1.3 现有隐私基线（已满足，需延续）
- 位置默认 `self`、伴侣仅见主动共享且未过期的最近位置、用户可删除、无后台持续定位、全私有接口 requireAuth + coupleId。

---

## 2. 借鉴边界（map-of-us-template 合规）

| 借鉴（思路） | 禁止（直接搬运） |
|---|---|
| 省份/城市「点亮」交互模型；全国→省→市→回忆的下钻层级 | 其源码文件、组件实现 |
| 足迹仪式感、年度回顾、分享海报的产品形态 | 其图片 / Logo / 配色资产 / 文案 |
| 用预处理后的省市边界做静态渲染的思路 | 其内置 GeoJSON/本地数据文件 |

GeoJSON 采用**公开来源**（如阿里 DataV GeoAtlas 等，许可允许的前提下）自行下载、用脚本简化（topojson/mapshaper）并裁剪精度后纳入本仓库 `apps/miniprogram/assets/geo/`，附 `THIRD_PARTY_NOTICES.md` 出处与许可说明。**不从参考仓库取数据。**

---

## 3. 目标架构与关键技术决策

### 3.1 双地图结构
```
地图首页 pages/map/index
├─ 统计卡：点亮省份数 / 城市数 / 地点数 / 回忆数（GET /api/footprint/overview）
├─ 入口：真实地图 / 足迹地图 / 位置共享
真实地图 pages/map/real/index        —— 原生 <map>，marker + 底部卡片 + 加地点/回忆/打卡/共享入口
足迹地图 pages/map/footprint/index   —— canvas 全国图，点亮省份；统计；点省下钻
        /province/index             —— 省内城市点亮；点市下钻
        /city/index                 —— 城市回忆/地点列表
位置共享 pages/location/index        —— 临时共享、双方 marker、距离、过期、停止
```

### 3.2 关键决策（含取舍）

**D1. 足迹地图如何在小程序渲染（不可用 Leaflet/d3 DOM）**
- 选型：**Canvas 2D（`<canvas type="2d">`）+ 自带投影**，而非原生 `<map>` 的 polygons。
- 理由：(a) 足迹是「仪式感/海报」场景，canvas 可导出图片（`wx.canvasToTempFilePath`）做分享海报；(b) 省/市下钻、点亮配色、点击命中（point-in-polygon）完全可控；(c) 不依赖底图，免去与原生 map（GCJ-02）的坐标系耦合。
- 投影：简单等距圆柱（经纬度线性映射到画布 bbox）即可满足「点亮」展示；后续可换 Albers。
- 命中检测：射线法 point-in-polygon，over 简化后的多边形。

**D2. GeoJSON 数据与体积**
- 全国省界（简化）≈ 数百 KB；地级市界（简化）体积较大。
- 方案：**省界打进主包或 map 分包**；**市界按省份懒加载**（放分包，或由后端 `GET /api/geo/province/:id` 下发）。
- 强约束：主包 ≤ 2MB。→ 引入 **subPackages**：`pkgMap`（真实/足迹）、`pkgLocation`（位置共享）。tabBar「地图」入口仍在主包 `pages/map/index`，子页放分包。

**D3. 省市归一化（点亮的数据基础）**
- 现状 `Place.city/province` 为自由文本，不可靠。新增 `provinceId/cityId`（**国标 adcode**，6 位）。
- 写入策略：新建/编辑地点时，由后端 `reverseGeocode(lat,lng)` 得到 adcode（缓存），落库；
  兜底用「名称→adcode」静态字典匹配。历史数据用一次性回填脚本（Phase 3 附带，幂等、可重跑）。
- 「点亮」定义（满足验收①）：某 `cityId` 被点亮 ⟺ 该情侣存在 (`Place.placeType='visited'`) **或** (该城市的 Place 关联了至少 1 条 Memory)。省份点亮 ⟺ 其下任一城市点亮。

**D4. 坐标系**
- 全链路默认 **GCJ-02**；模型新增 `coordType` 字段（默认 `'gcj02'`）显式标注，便于未来接入 BD-09（百度）时转换。

**D5. 位置共享实时通道**
- 主通道 **WebSocket**（`couple:{coupleId}` 房间，仅推给伴侣）；**降级轮询** `GET /api/location/partner/latest`。
- 最新位置存 **Redis** `location:latest:{coupleId}:{userId}`（TTL=共享过期时间）；点位审计入 `LocationPoint`（节流后，非高频全量轨迹）。

**D6. MapProvider 适配层**
- 接口：`reverseGeocode / searchPoi / suggestKeyword / distance / routePlan / coordinateConvert`。
- 默认 `TencentMapProvider`；预留 `Amap`/`Baidu`（百度标 GCJ-02/BD-09 转换 TODO）。
- 密钥**仅后端环境变量**；前端零密钥。`reverseGeocode` 带缓存；搜索防抖+限流；**不在每次位置更新时逆地址**。

### 3.3 ⚠ 需你确认（涉及 CLAUDE.md「新增重依赖 / 付费服务 / 停机确认」）
1. **新增后端依赖**：WebSocket（`@fastify/websocket`）、Redis 客户端（`ioredis`）。→ 建议加**抽象层 + 内存兜底**，使本地无 Redis/WS 也能跑（降级轮询 + 进程内 Map），生产再接真 Redis/WS。
2. **付费/Key 服务**：腾讯位置服务（`TENCENT_MAP_KEY`）。无 Key 时 Provider 返回明确「未配置」错误并走兜底（如 Haversine 直线距离代替 routePlan）。
3. **GeoJSON 数据来源与许可**：确认采用的公开数据源（默认拟用 DataV GeoAtlas），并在 THIRD_PARTY_NOTICES 标注。
4. **wx 定位权限**：仅用 `wx.startLocationUpdate`（**前台**）+ `wx.onLocationChange`，**不使用** `startLocationUpdateBackground`（不触发后台持续定位，符合隐私红线）。需在 `app.json` 声明 `requiredPrivateInfos`/`permission.scope.userLocation` 文案。

> 在你确认 1–3 之前，Phase 6/8 我会以「抽象层 + 兜底」实现，保证可运行、可验收，不强依赖外部基础设施；接真 Redis/WS/Key 作为部署步骤。

### 3.4 决策已确认（2026-06-03）
1. **实时通道**：直接接真 **Redis（ioredis）+ WebSocket（@fastify/websocket）**。Phase 6 引入；本地需运行 Redis（届时按 MySQL 同样方式就绪）。仍保留连接失败时的轮询降级以满足验收⑧。
2. **MapProvider**：先 **无 Key 兜底**——适配层与接口做完，无 `TENCENT_MAP_KEY` 时逆地址/搜索返回「未配置」、`distance` 用 Haversine 兜底；后续填 key 即生效。
3. **GeoJSON**：采用 **DataV GeoAtlas** 公开数据，自行下载→mapshaper 简化→裁剪精度，纳入 `apps/miniprogram/assets/geo/`，在 `THIRD_PARTY_NOTICES.md` 标注来源与许可；不取自参考仓库。
4. **定位权限**：仅 `wx.startLocationUpdate`（前台），不使用后台版（已为既定红线）。

---

## 4. 数据模型变更（Phase 2，全部为**附加式**，不破坏现有数据）

`Place` 新增（均可空，安全迁移）：
- `provinceId String?`、`cityId String?`（adcode）、`coordType String? @default("gcj02")`
- `placeType`、`visibility` 已存在（无需改）。

`Checkin` 新增：
- `coordType String? @default("gcj02")`（`shareScope`、`expiresAt` 已存在）。

新增模型：
```
LocationShareSession {
  id, coupleId, userId,
  status   // active | stopped | expired
  mode     // temporary
  visibility // partner
  startedAt, expiresAt, stoppedAt, createdAt, updatedAt
  @@index([coupleId, userId, status])
}
LocationPoint {
  id, sessionId, coupleId, userId,
  latitude Decimal, longitude Decimal, coordType,
  accuracy?, speed?, heading?, address?,
  clientTime, serverTime, createdAt, deletedAt?
  @@index([coupleId, userId, createdAt])
}
```
迁移方式：`prisma migrate dev`（本地）/ `migrate deploy`（生产）。新增枚举建议用 String + 应用层 Zod 校验（与现有风格一致，避免枚举迁移成本）。

---

## 5. API 设计（统一 `{success,data}` / `{success,error}`，私有接口 requireAuth + coupleId）

足迹：
- `GET /api/footprint/overview` → `{ provinceCount, cityCount, placeCount, memoryCount, litProvinceIds[] }`
- `GET /api/footprint/provinces/:provinceId` → `{ provinceId, litCityIds[], cities:[{cityId,name,placeCount,memoryCount}] }`
- `GET /api/footprint/cities/:cityId` → `{ cityId, places:[...], memories:[...] }`

真实地图：
- `GET /api/map/markers`（聚合 地点/回忆/打卡 marker；可带 bbox/type）→ `{ markers:[{kind,id,lat,lng,title,placeType?}] }`

位置共享：
- `POST /api/location/share-session`（开启，body: `{durationMinutes:30|120}`）
- `POST /api/location/share-session/:id/stop`（停止）
- `GET /api/location/status`（我当前/伴侣共享状态）
- `POST /api/location/points`（上传节流后的点位）
- `GET /api/location/partner/latest`（降级轮询用）
- `DELETE /api/location/points/:id`

MapProvider（key 仅后端）：
- `GET /api/map/reverse-geocode`、`GET /api/map/search-poi`、`GET /api/map/distance`、`GET /api/map/route`、`POST /api/map/coordinate-convert`

复用既有：`/api/places*`、`/api/memories*`、`/api/checkins*`（保留，real map 仍用）。

---

## 6. 小程序页面与工程结构

`app.json` 调整（Phase 4 起）：
- 主包：`pages/map/index`（tabBar 改指向它）。
- `subPackages`：
  - `root: "pkgMap"` → `real/index`、`footprint/index`、`footprint/province/index`、`footprint/city/index`
  - `root: "pkgLocation"` → `location/index`
- `requiredPrivateInfos: ["getLocation","onLocationChange","startLocationUpdate"]` + `permission.scope.userLocation` 文案。
- tabBar 迁移要点：把当前 `pages/map/map` 的真实地图逻辑迁到 `pkgMap/real`，`pages/map/index` 作为聚合首页；旧 `pages/map/map` 暂保留并重定向，确认稳定后再删（小步、可回滚）。

新增工具：`utils/geo-canvas.js`（投影+绘制+命中）、`utils/throttle.js`（位置节流）、`utils/ws.js`（WebSocket+降级）。

---

## 7. 隐私与安全设计（贯穿全程）

- 仅 `wx.startLocationUpdate`（前台）；**不**用后台版；权限文案明确「仅前台、临时、可随时关闭」。
- 上传节流：间隔 ≥10s、移动 ≥30m、`accuracy>100m` 不传/提示低精度。
- 共享会话强制 `expiresAt`；到期 Redis key 自然失效 + 状态置 `expired`；伴侣仅见 active 且未过期会话的最新点。
- 不保存高频全量轨迹（`LocationPoint` 仅留节流后样本，可定期清理/软删）。
- 所有私有接口：`requireAuth` + `requireActiveCouple` + coupleId 越权校验；WebSocket 连接需鉴权且仅入自己 couple 房间，只推给伴侣。
- 地图服务商**不参与实时位置同步**，仅逆地址/搜索/路线；key 不入前端、不记日志。
- 隐私中心 `pages/me/privacy` 增加：当前共享状态、历史会话、一键停止全部共享、隐私文案。

---

## 8. 分阶段执行计划（文件级，逐阶段可运行可验收）

> 原则：小步、附加式、每阶段后端 `tsc` + `npm test` 通过、小程序可编译。共享集成点（`server.ts`、`app.json`、`schema.prisma`）由主程串行接线，避免冲突。

- **Phase 2 数据库**：改 `schema.prisma`（附加字段 + 2 新模型）→ 迁移 → `docs/DATABASE.md`。回填脚本 `scripts/backfill-adcode.mjs`（占位，Phase 3 完善）。
- **Phase 3 足迹后端**：`routes/footprint.ts` + `utils/footprint.ts`（点亮计算）+ `services/adcode`（名称↔adcode 字典）；注册路由；单测（鉴权 401 + 计算单元）。
- **Phase 4 真实地图**：`routes/mapMarkers.ts`（`/api/map/markers` 聚合）；小程序 `pkgMap/real`（marker + **底部卡片** + 入口）；tabBar 迁移到 `pages/map/index`（聚合首页 + overview 统计）。
- **Phase 5 足迹小程序**：`assets/geo/` 省界数据 + `utils/geo-canvas.js`；`pkgMap/footprint`（全国点亮+统计）、`/province`、`/city`；分享海报导出。
- **Phase 6 位置共享后端**：`routes/location.ts`（6 接口）+ `services/locationStore`（Redis 抽象 + 内存兜底）+ `plugins/ws.ts`（WebSocket 房间，抽象 + 降级）。**先做确认项 1。**
- **Phase 7 位置共享小程序**：`pkgLocation/location`（startLocationUpdate + onLocationChange + 节流 + 双 marker + 距离 + 30m/2h + 停止 + WS/轮询 + 隐私文案）。
- **Phase 8 MapProvider**：`services/map/MapProvider.ts` 接口 + `TencentMapProvider`（+Amap/Baidu 占位）；`routes/map.ts`（reverse-geocode/search/distance/route/convert，缓存+防抖+限流）。**先做确认项 2。**
- **Phase 9 隐私与文档**：`pages/me/privacy` 增强；更新 `docs/API.md`、`DATABASE.md`、`PRD.md`、`PRIVACY.md`、`DEPLOYMENT.md`、`.env.example`（新增 MAP_*、REDIS_*、WS 相关）。
- **Phase 10 验收与安全**：按第 9 节验收清单逐条核验；越权/密钥/定位红线检查；`tsc`+`test`+小程序编译。

---

## 9. 验收标准映射

| 验收项 | 由哪些 Phase 保证 |
|---|---|
| 1 杭州回忆→点亮杭州&浙江 | P2(cityId/provinceId)+P3(点亮计算)+P5(渲染) |
| 2 足迹首页四项统计 | P3(overview)+P4/P5(展示) |
| 3 真实地图四类 marker（含我/TA） | P4(markers)+P7(共享 marker) |
| 4/5/6/7 未开启/开启30m/停止/过期 可见性 | P6(会话+Redis TTL)+P7(端) |
| 8 WS 断开降级轮询 | P6(WS 抽象)+P7(utils/ws 降级) |
| 9 key 不在前端 | P8(key 仅后端 env) |
| 10 不每次逆地址 | P7(节流，不调逆地址)+P8(缓存) |
| 11 私有接口校验 userId+coupleId | P3/P4/P6/P8 统一 requireAuth+coupleId |
| 12 文档更新 | P9 |

---

## 10. 风险与回滚

- **包体积**：省市 GeoJSON 可能超限 → 分包 + 懒加载 + 后端下发；先省界后市界。
- **adcode 准确性**：reverseGeocode 无 key 时退化为名称字典，可能误匹配 → 标注 `coordType`/来源，提供回填脚本可重跑修正。
- **Redis/WS 缺失**：抽象层 + 内存/轮询兜底，本地与未配基础设施时仍可验收。
- **tabBar 页迁移**：保留旧 `pages/map/map` 重定向过渡，确认后再删，单步可回滚。
- **隐私红线**：严禁后台持续定位；仅前台 + 过期 + 可停止；评审在 P10 复核。

---

## 附：下一步
Phase 1 完成（本文件）。**请确认第 3.3 节的 4 项（依赖/付费 Key/数据源/定位权限策略）**，确认后我按 Phase 2 起逐阶段实现；每阶段产出「改动文件 / 运行命令 / 测试步骤 / 文档更新 / 越权与密钥检查」小结。
