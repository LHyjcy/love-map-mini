# 上线缺口与待办（GO_LIVE_GAP）

> 功能代码已基本完整。本表区分「✅ 已在代码侧完成」与「👤 需你线下操作」。
> 配套：部署见 `docs/DEPLOYMENT.md`，联调见 `docs/DEVTOOLS_CHECKLIST.md`。

---

## A. 已在代码侧完成（本轮）

- ✅ **账号注销**：`POST /api/account/delete`（软删除+匿名化+解绑），「我的→注销账号」二次确认入口。
- ✅ **UGC 内容安全审核**：`services/contentSec.ts`（微信 `msgSecCheck` v2），已接入**回忆/反馈/公开分享**创建；未配微信时放行、异常 fail-open；命中违规返回 `400 CONTENT_REJECTED`。
- ✅ **用户反馈**：`/api/feedback` + 反馈页。
- ✅ **运营底座**：5xx 错误持久化 `ErrorLog`；登录/绑定接口内存限流（60s/30→429）。
- ✅ **定位权限声明**：`app.json` 的 `permission.scope.userLocation` + `requiredPrivateInfos`。
- ✅ **部署脚手架**：`apps/api/ecosystem.config.cjs`(PM2)、`apps/api/Dockerfile`、`deploy/nginx.conf.sample`(含 `/ws/location` 升级头)、`apps/api/.env.production.example`(全量变量模板)。
- ✅ 数据导出、删除回忆/照片/位置等数据控制能力。

---

## B. 需你线下操作（按阻塞程度）

### 🔴 阻塞上线（必须）

1. **正式小程序 + 微信登录**
   - 注册正式小程序（非测试号），拿正式 AppID。
   - 部署环境填 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`（仅服务端）。
   - 真机验证 `wx.login` → `/api/auth/wechat-login`（开发态 501 属预期）。
2. **服务器域名配置**（小程序后台「开发管理→服务器域名」，均须 HTTPS/wss）
   - `request` 合法域名：后端 API 域名。
   - `uploadFile` 合法域名：COS/OSS bucket 域名。
   - `socket` 合法域名：后端 wss 域名（位置共享 WebSocket）。
3. **后端生产部署**
   - HTTPS 域名 + 常驻进程（用 `ecosystem.config.cjs` / `Dockerfile` + `deploy/nginx.conf.sample`）。
   - 生产 MySQL；`cd apps/api && npx prisma migrate deploy`；定期备份（`scripts/backup.sh` 挂 cron）。
   - `JWT_SECRET` 换强随机；`NODE_ENV=production`（自动禁用 mock 登录）。
   - 服务器域名 **ICP 备案**。
4. **照片存储二选一**：私用推荐 `STORAGE_PROVIDER=disk`（照片落服务器磁盘，免 COS，compose 已挂持久卷）；公开上架建议 COS/OSS（建桶 + `STORAGE_*` 密钥 + 桶 CORS，跑 `node --env-file=apps/api/.env scripts/verify-cos.mjs` 验证）。两者都不配则照片功能不可用。
5. **小程序内 baseUrl**：`app.js` 的 `globalData.baseUrl` 改生产 HTTPS。

### 🟠 审核硬要求（合规）

6. **微信隐私保护指引**：在小程序后台「设置→服务内容声明→用户隐私保护指引」填写采集项（位置、相册、相机、用户信息等）。开启隐私协议后，前端会用到 `wx.requirePrivacyAuthorize`（如需我接入授权弹窗 util 可补）。
7. **内容审核生效**：`contentSec` 代码已就位，**配齐 `WECHAT_APP_ID/SECRET` 后自动生效**（开发态放行）。确认审核策略满足平台要求。
8. **隐私政策 / 用户协议文案**：在后台与小程序内提供。

### 🟡 强烈建议

9. **真机回归**：按 `docs/DEVTOOLS_CHECKLIST.md` 跑一遍；重点 立体地图、照片直传、微信登录、位置共享。
10. **订阅消息**：申请模板 → 填 `pages/events/events.js` 的 `REMINDER_TMPL_ID`；`POST /api/notifications/run-due` 接**定时任务**（cron / 云函数定时触发）真实下发。
11. **Redis**：多实例部署时配 `REDIS_URL`（位置最新点/WS/限流跨实例）；单实例可内存兜底。
12. **web-share 公开地图**：部署静态站，改其 `config.js` 的 `API_BASE`，后端 `PUBLIC_WEB_ORIGIN` 收紧为该域名，小程序 `publicShare.js` 的 `WEB_SHARE_BASE` 改部署 URL。
13. **AI 文案**（可选）：配 `AI_API_KEY`/`AI_API_BASE`/`AI_MODEL` 走真模型，否则本地模板。
14. tabBar 图标（现纯文字）、小程序名称/图标/截图等上架材料。

### ⚪ 技术债（不阻塞）

15. ~~线上库历史缺约 25 个外键~~ ✅ 已修复：孤儿数据检查后用 `prisma db execute` 补齐全部 26 条外键，`migrate diff` 已清零（新部署走 `migrate deploy` 本就含外键，不受影响）。
16. adcode 字典非全量地级市（个别城市不点亮）；`packages/shared` 未被使用；监控/告警缺失。

---

## C. 最小上线路径（推荐顺序）

1. 注册正式小程序 + 备案域名 → 2. 部署 HTTPS 后端 + 生产 MySQL（migrate deploy）→ 3. 配微信 AppID/Secret，配合法域名，真机打通登录 → 4. 配 COS 桶并验证照片 → 5. 后台填隐私保护指引/协议 → 6. 真机回归（DEVTOOLS_CHECKLIST）→ 7. 提审发布。
   （订阅消息、AI、Redis、web-share 可在 1.1 迭代补。）
