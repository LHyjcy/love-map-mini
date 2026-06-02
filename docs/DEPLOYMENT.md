# DEPLOYMENT — love-map-mini

本文档覆盖后端、数据库、对象存储、微信小程序的部署与配置。**任何真实密钥都只放在
部署环境的 `.env` / 密钥管理服务里，绝不提交仓库。**

## 1. 环境要求

- Node.js ≥ 18（后端用到全局 `fetch`）
- MySQL ≥ 8（或兼容版本）
- 微信小程序开发者工具（前端调试）
- 微信小程序 AppID + AppSecret（Phase 11 真实登录）
- 对象存储 bucket（COS/OSS，Phase 12 图片直传）

## 2. 本地开发

```bash
npm install
cp apps/api/.env.example apps/api/.env     # 按需填写本地值
# 启动 MySQL 后：
npm run prisma:generate --workspace apps/api
npm run prisma:migrate  --workspace apps/api   # 首次建表（prisma migrate dev）
npm run api:dev                                 # http://localhost:3000
curl http://localhost:3000/health
```

小程序：用微信开发者工具导入 `apps/miniprogram`，在 `app.js` 的 `globalData.baseUrl`
指向后端地址（本地调试可在开发者工具关闭「校验合法域名」）。

## 3. 环境变量

见 `apps/api/.env.example`。关键项：

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | `mysql://用户:密码@主机:3306/love_map_mini` |
| `JWT_SECRET` | 生产必填 | 登录令牌签名密钥；**生产缺失会启动失败**（绝不回退占位值） |
| `JWT_EXPIRES_IN` | 否 | 默认 `7d` |
| `NODE_ENV` | 生产=production | 生产环境会**禁用 mock 登录** |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 微信登录必填 | 未配置时 `/api/auth/wechat-login` 返回 501 |
| `STORAGE_PROVIDER` | 否 | `local`(默认) / `cos` / `oss` |
| `STORAGE_REGION` / `STORAGE_BUCKET` / `STORAGE_PUBLIC_BASE_URL` | 云存储时 | bucket 信息 |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_ACCESS_KEY_SECRET` | 云存储时 | **仅服务端读取，绝不进前端** |

## 4. 数据库迁移

```bash
# 生产：应用已有迁移（不会改 schema，只跑 migrations/）
cd apps/api && npx prisma migrate deploy
```

初始迁移在 `apps/api/prisma/migrations/`。schema 变更时本地 `prisma migrate dev` 生成新
迁移并提交，生产再 `migrate deploy`。

## 5. 后端生产部署

```bash
npm install --workspaces --include-workspace-root
npm run prisma:generate --workspace apps/api
npm run build --workspace apps/api
NODE_ENV=production node apps/api/dist/server.js
```

建议：

- 用进程管理（pm2/systemd）或容器（Docker）运行，前置 HTTPS 反向代理（Nginx/Caddy）。
- 微信小程序要求后端为 **HTTPS 合法域名**；在小程序后台「开发管理 → 服务器域名」
  配置 `request` 与 `uploadFile` 合法域名。
- 健康检查接 `/health`。

## 6. 对象存储（Phase 12）

- 当前内置 `local` provider 用于开发（不做真实签名）。
- 接入 COS/OSS 需引入对应厂商 SDK（`cos-nodejs-sdk-v5` / `ali-oss`）并在
  `apps/api/src/services/storage.ts` 的对应分支实现预签名直传；密钥从 env 读取。
- bucket 建议：图片对象设为「私有读 + 临时签名访问」或受控公共读；限制上传类型与大小
  （后端已限制 ≤10MB 与图片 mime）。

## 7. 微信小程序发布

- `request`/`uploadFile` 合法域名配置为生产后端 HTTPS 域名。
- 真实登录走 `wx.login` → `POST /api/auth/wechat-login`。
- 体验版 → 提交审核 → 发布。审核需提供隐私政策（位置/相册/相机用途说明，见
  `docs/PRIVACY.md`）。

## 8. 隐私与合规

- 位置共享、公开地图**默认关闭**；申请相册/相机/位置权限需在小程序内说明用途。
- 见 `docs/PRIVACY.md` 与 `docs/THIRD_PARTY_NOTICES.md`。

## 9. 排查

- 启动即退出：多为 `JWT_SECRET`（生产）或 `DATABASE_URL` 缺失/不可连。
- 业务接口 500 且日志为 Prisma 连接错误：检查 `DATABASE_URL` 与 MySQL 可达性。
- `/api/auth/wechat-login` 返回 501：未配置 `WECHAT_APP_ID/SECRET`。
- 上传凭证返回 501：`STORAGE_PROVIDER` 为 cos/oss 但尚未接线厂商 SDK。
