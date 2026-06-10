# ROADMAP — love-map-mini

按阶段推进，每个阶段单独执行、单独验证，每阶段完成后输出：新增/修改文件、运行命令、
验证方式、已知限制、下一步建议。

> Phase 2 参考项目分析已完成，见 [REFERENCE_ANALYSIS.md](REFERENCE_ANALYSIS.md)。
> 数据模型与功能闭环的设计依据来自对 mappedlove（bond/marker/story、图片服务端上传、
> 公开地图脱敏）与 qinglv（小程序页面结构、任务/商城/签到/打卡闭环、MySQL 表）的借鉴，
> 但全部重写实现，并补齐密钥管理、鉴权越权校验、积分流水、事务与位置隐私默认值。

## 进度

- [x] Phase 1 — 项目骨架（已提交：`/health` 可用、小程序 6 页、docs 全套）
- [x] Phase 2 — 参考项目分析（REFERENCE_ANALYSIS.md）
- [x] Phase 3 — 数据库 Schema（13 模型、11 枚举、初始迁移 SQL，client 生成通过）
- [x] Phase 4 — 认证与情侣绑定（JWT 鉴权、mock 登录、微信登录占位、邀请码绑定/解绑）
- [x] Phase 5 — 地图与回忆（Place/Memory/Media API、小程序地图标记 + me 页登录绑定）
- [x] Phase 6 — 位置打卡（Checkin API、临时共享、伴侣最近有效位置 + 距离、无后台定位）
- [x] Phase 7 — 任务与积分（任务状态机、积分流水、每日签到、事务发分一次）
- [x] Phase 8 — 商城与背包（Shop/Redemption、兑换/退回走事务、库存与积分一致）
- [x] Phase 9 — 日程与首页（Event API、dashboard 聚合）
- [x] Phase 10 — 隐私与公开地图（PrivacyConsent、PublicShare 骨架、默认关闭）
- [x] Phase 11 — 真实微信登录（code2session，AppSecret 仅 env，session_key 不返前端，生产禁 mock）
- [x] Phase 12 — 图片上传抽象（上传凭证、类型/大小限制；cos/oss 待接 SDK）
- [x] Phase 13 — 审查与部署（REVIEW_REPORT、DEPLOYMENT 补全，API 文档同步）

> **MVP 13 阶段全部完成。** 后端路由全部一起 `tsc` 通过、服务启动无报错、未授权访问统一 401；
> 安全/隐私审查见 REVIEW_REPORT.md。数据路径需连 MySQL 才能端到端运行。

## 里程碑

### 2026-06-03 — P1 体验批次（共同打卡转回忆、数据导出、地图筛选、订阅消息占位、扫码绑定、微信登录按钮）

本批次围绕「让既有能力在小程序侧真正可用」，前后端一起落地以下 P1 体验项：

| 能力 | 产出 | 隐私/约束 |
|---|---|---|
| 共同打卡 → 回忆 | `GET /api/co-checkin` 检测双方 ≤200m / ≤180min 的既有打卡对；打卡页提示「生成共同回忆」 | **仅读既有的用户主动打卡，无后台追踪**；响应不含伴侣坐标/身份 |
| 数据导出 | `GET /api/export` 导出本情侣全量数据；me 页一键复制 JSON | 仅本 `coupleId`，不含 openid/unionid/sessionKey/密钥 |
| 地图按类型筛选 | 地图页全部/想去/计划/已去切换；`GET /api/places` 新增 `?city=`/`?year=` 过滤 | 仅本情侣可见数据 |
| 事件「提醒我」 | `wx.requestSubscribeMessage` 占位 + `POST /api/notifications/subscribe`、`GET /api/notifications/templates` | **占位**：用户授权 opt-in，不调用微信、不落库、不真实下发 |
| 扫码绑定 | me 页 `wx.scanCode` 扫伴侣邀请码完成绑定 | 复用既有邀请码绑定流 |
| 微信登录按钮 | me 页 `wx.login → POST /api/auth/wechat-login`；**开发环境未配 AppID 时给出提示** | AppSecret 仅服务端 env，session_key 不返前端 |

仍待生产收尾：**真实微信登录**需配置 AppID/Secret 并真机验证；**真实推送（微信订阅消息下发）**仍未实现（当前占位）；
**真实 COS/OSS 桶**需配置并真机验证照片直传；生产部署（HTTPS / 小程序合法域名 / web-share 上线）。

### 2026-06-02 — 公开地图渲染、坐标脱敏与计划/搜索/照片闭环

在「补齐小程序页面」之后，本次落地了此前留作骨架/后续的几项能力，使公开地图与
计划/搜索/照片流程真正端到端可用：

| 能力 | 产出 | 隐私/约束 |
|---|---|---|
| 公开地图 web 渲染 | web-share 应用以 Leaflet 读取 `GET /api/public-map/:shareCode` 渲染公开地图 | 免登录、只读，仅公开内容 |
| 坐标脱敏 | `GET /api/public-map/:shareCode` 返回前经纬度统一保留 3 位小数（约 110m） | 精确家/学校/工作坐标永不外泄；停用/不存在 → `404 PUBLIC_SHARE_NOT_FOUND` |
| 计划转回忆 | `PATCH /api/plans/:id/complete`：wishlist/plan 地点 → visited，并在同一事务生成回忆 | 登录、按 coupleId 隔离；非计划地点 → `404 PLAN_NOT_FOUND` |
| 搜索 | `GET /api/search?q=`：地点（标题/地址/城市）与回忆（标题/内容） | 登录、按 coupleId 隔离；空 q 返回空数组 |
| 回忆照片 | 小程序回忆「添加照片」流程（`wx.chooseMedia` 手动选图 → upload-credential → media） | 用户主动逐张选择，不读取相册、无后台取图 |
| 新增页面 | `pages/planAdd`、`pages/planDetail`、`pages/search` | 接通既有 API |
| 任务模板 | 任务创建提供常用任务模板 | — |

仍存缺口：**真实云对象存储（OSS/COS）签名直传仍待接 SDK**（当前 `cos/oss` 返回
`501 STORAGE_PROVIDER_NOT_WIRED`，开发用 `local`）；**订阅消息（subscribe message）推送待实现**。

### 2026-06-02 — 补齐缺失小程序页面并接通导航

后端各闭环 API 已就绪，但小程序此前仅有 6 个 tab 级页面，详情/明细类页面缺失、部分入口无处可跳。
本次补齐 7 个页面并全部在 `app.json` 注册、接通导航，使既有 API 在小程序侧真正可达：

| 页面 | 说明 | 入口 |
|---|---|---|
| pages/placeDetail | 地点详情：地点信息 + 关联回忆，支持软删除地点 | 地图 marker 点击 |
| pages/memoryDetail | 回忆详情：内容 + 照片，支持软删除 | 回忆列表项、时间轴 |
| pages/timeline | 时间轴：回忆按日期排序 | 首页、me 页 |
| pages/wishlist | 想去清单：placeType=wishlist 的地点 | 首页、me 页 |
| pages/pointsLedger | 积分流水：余额 + 流水明细 | me 页 |
| pages/privacy | 隐私中心：consent 开关 | me 页 |
| pages/publicShare | 公开分享：创建/启用/停用分享 | me 页 |

导航接线：地图 marker 点击 → placeDetail；回忆列表项 → memoryDetail；me 页「功能」卡 → 上述 5 个页面；
首页快捷入口 → timeline 与 wishlist；打卡页补充情侣共同打卡提示。

仍未单独成页（当前以 events 或内联方式承载）：me/couple。
（plan/add、plan/detail 已在随后的「公开地图渲染、坐标脱敏与计划/搜索/照片闭环」里程碑中补齐。）
公开地图的 web 渲染与坐标脱敏亦已在该里程碑实现，不再是骨架。

### 里程碑 2026-06-03 — 共同打卡判定、数据导出、OSS 直传、地图筛选与真实微信登录接入

- **共同打卡服务端判定**：`GET /api/co-checkin`，依据双方最近若干条打卡的距离（≤200m）
  与时间窗口（≤180min）判断；打卡页接入提示。响应不返回伴侣原始坐标（隐私安全）。
- **数据导出**：`GET /api/export`，按 `coupleId` 导出全量数据；me 页「导出数据」复制到剪贴板。
- **对象存储 OSS（阿里云）签名直传**：与 COS 并列，纯 `node:crypto`、无 SDK（OSS 的 Content-Type 参与签名）。
- **地图按 placeType 筛选**：全部/想去/计划/已去 切换。
- **真实微信登录接入（小程序侧）**：`wx.login → POST /api/auth/wechat-login`，未配置时优雅回退到体验/演示登录。
- **本地环境打通**：MySQL 注册为 Windows 服务（开机自启）；`dev` 脚本改用
  `node --watch --env-file=.env --import tsx src/server.ts` 以加载 `.env`。

仍待完成（v1 收尾）：真实微信登录需配置 AppID/Secret 并真机验证；照片真机直传需配置真实 COS/OSS 桶并验证；
生产部署（HTTPS / 小程序合法域名 / web-share 上线）；微信订阅消息提醒仍为占位。

| Phase | 主题 | 关键产出 | 验收要点 |
|---|---|---|---|
| 1 | 项目初始化 | monorepo 骨架、Fastify `/health`、小程序 6 页骨架、docs | `npm run api:dev` 可起，`/health` 返回 ok；无业务 API、无密钥 |
| 2 | 参考项目分析 | docs/REFERENCE_ANALYSIS.md、ROADMAP 更新 | 只出文档，明确 license/素材风险 |
| 3 | 数据库 Schema | Prisma schema、迁移、DATABASE.md | 12 模型、枚举、索引、软删除 |
| 4 | 认证与情侣绑定 | mock 登录、微信登录占位、邀请码绑定 | 统一响应、Zod 校验、requireAuth |
| 5 | 地图与回忆 | Place/Memory/Media API、小程序地图页 | 全部校验 coupleId、软删除 |
| 6 | 位置打卡 | Checkin API、临时共享、距离计算 | 仅主动打卡、默认 self、无后台定位 |
| 7 | 任务与积分 | 任务状态流、积分流水、签到 | 状态机正确、每任务只发一次积分 |
| 8 | 商城与背包 | Shop/Redemption、库存与积分事务 | 兑换用事务，取消可退回 |
| 9 | 日程与首页 | Event API、dashboard 聚合 | 在一起天数、积分、最近回忆/任务/日程 |
| 10 | 隐私与公开地图 | PrivacyConsent、PublicShare 骨架 | 默认关闭、公开仅 public、坐标脱敏 |
| 11 | 真实微信登录 | code2session，生产禁用 mock | AppSecret 不入码，session_key 不返前端 |
| 12 | 图片上传 | 服务端签名上传抽象 | 密钥不进前端、限制类型与大小 |
| 13 | 审查与部署 | REVIEW_REPORT、DEPLOYMENT | 鉴权/隐私/密钥/合规审查 + 部署文档 |

## 执行建议

- 先创建 CLAUDE.md → 跑 Phase 1 确认骨架能跑。
- clone references 后再做 Phase 2。
- 优先跑通「地图回忆闭环」，再做「任务积分闭环」。
- 位置打卡只做主动打卡和临时共享，**绝不做后台持续定位**。
- 每 2–3 个阶段运行一次 `/phase-review` 或 `/security-review`。
- 最后补部署文档、隐私文档和 THIRD_PARTY_NOTICES。
