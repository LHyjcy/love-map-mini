# 两人私用指南（PRIVATE_USE）

> 只给你和女朋友两个人用，不公开发布。可以**砍掉一大半上线工作**：
> ❌ 不用提审/发布、❌ 不用应用市场材料、❌ 不用内容审核、❌ 隐私指引最简、❌ 不用 Redis/运营后台。
> 用 **体验版**（无需审核）即可像正常小程序一样长期使用。

---

## 关键简化

- **登录**：两人各自用**真实微信登录**（个人小程序的 AppID/Secret 免费即可，无需审核）；或开发期用「体验登录」。登录后一方「生成邀请码」、另一方「输入邀请码」即绑定。
- **照片**：两人用量极小，配一个**腾讯云 COS 小桶**（按量，几乎免费）即可持久化；不想配就先不存照片（其余功能照常）。
- **内容审核 / 隐私指引 / 订阅消息 / Redis / 运营后台**：私用都**不需要**（代码里有也会自动空跑，不影响）。

---

## 方案 A：零部署，偶尔一起玩（最省事）

不部署服务器，后端跑在你电脑上，手机用开发者工具连。

1. 你电脑跑后端：`E:\dt\scripts\start-dev.bat`（保持窗口）。
2. 开发者工具导入 `apps/miniprogram`，「详情→本地设置」勾「不校验合法域名」。
3. 点「预览」扫码 / 或「真机调试」，手机即可体验。
- 优点：零部署、零费用。
- 缺点：每次要开着开发者工具 + 你电脑；女朋友**不能独立日常使用**。适合一起试玩。

---

## 方案 B：体验版，日常长期用（推荐）

像正常小程序一样,装到两人微信里长期用,**但不提审、不发布**。

### 一次性准备

1. **注册个人小程序**（mp.weixin.qq.com，个人主体免费，1–2 天）→ 拿到 **AppID**，开发设置里生成 **AppSecret**。
2. **一台小服务器 + 域名 + HTTPS**：
   - 最省心：买一台轻量云服务器 + 一个域名，给**域名做 ICP 备案**（免费，约 1–2 周，国内服务器必须）。HTTPS 用 Let's Encrypt 免费证书。
   - 想免备案：用**海外/香港**服务器（国内访问稍慢；微信合法域名仍要求 HTTPS）。
3. **部署后端**（用仓库已带的脚手架）：
   ```bash
   # 服务器上：填好 .env（MYSQL_ROOT_PASSWORD / JWT_SECRET / WECHAT_APP_ID / WECHAT_APP_SECRET）
   docker compose up -d --build
   docker compose exec api npx prisma migrate deploy   # 首次建表
   ```
   用 `deploy/nginx.conf.sample` 配 HTTPS 反代到 `127.0.0.1:3000`（含 `/ws/location` 的 WebSocket 升级头）。
4. **照片（推荐 disk，免 COS）**：在 `.env` 设：
   ```env
   STORAGE_PROVIDER=disk
   STORAGE_PUBLIC_BASE_URL=https://你的API域名     # 用于拼 /api/media/upload 与 /files 地址
   ```
   照片直接存在服务器磁盘（compose 已挂 `api_uploads` 持久卷到 `/app/uploads`，容器重建不丢）。
   - 备份：用 `scripts/backup.sh`（数据库 + 照片一起备，见 `docs/SERVER_SETUP.md`「日常运维」）。
   - 也可改用 COS：`STORAGE_PROVIDER=cos` + `STORAGE_*` + 桶 CORS，跑 `node --env-file=apps/api/.env scripts/verify-cos.mjs` 验证。
5. **小程序后台「开发管理→服务器域名」** 配合法域名（均 HTTPS/wss）：
   - `request` = 你的 API 域名；`socket` = wss（你的 API 域名）；
   - `uploadFile` = 你的 API 域名（disk 上传走本服务 `PUT /api/media/upload`）；若用 COS 则填 COS 桶域名。
   - 照片读取 `/files/...` 走 `<image>`，普通图片域名/`downloadFile` 即可。
6. **小程序 `app.js`**：`globalData.baseUrl` 改成你的 HTTPS API 域名；`globalData.enableDevLogin` 改为 `false`（体验版只留「微信登录」，隐藏演示/体验登录按钮，避免邀请来的人点到仅开发可用的按钮）。

### 发布给两人用（无需审核！）

7. 开发者工具「上传」代码 → 微信后台「版本管理」里这就是**体验版/开发版**。
8. 「成员管理→体验成员」把**女朋友的微信**加进去。
9. 你俩在微信里打开「体验版」即可长期使用；一方生成邀请码、另一方绑定。
- **体验版不需要提交审核、不需要发布**，所以**跳过了内容审核、隐私协议审核、应用市场材料**这些最麻烦的环节。

> 注：个人小程序「体验版」长期可用；只有要让**陌生人**也能搜到用，才需要提审+发布（那才触发审核/备案材料等）。两人私用不需要。

---

## 私用最小清单

- [ ] 注册个人小程序拿 AppID/Secret（免费）
- [ ] 一台服务器 + 域名 + HTTPS（国内需备案，或用海外免备案）
- [ ] `docker compose up` 起后端 + MySQL，`migrate deploy` 建表
- [ ] 照片设 `STORAGE_PROVIDER=disk` + `STORAGE_PUBLIC_BASE_URL`（用持久卷，免 COS）
- [ ] 小程序后台配合法域名（request/socket/uploadFile 均填 API 域名）+ `baseUrl` 改生产域名 + `enableDevLogin=false`
- [ ] 上传体验版 + 加女朋友为体验成员
- [ ] 两人微信打开体验版 → 绑定 → 开始记录 ❤️
- [ ] 定期备份：`scripts/backup.sh` 挂 cron（数据库 + 照片，详见 `docs/SERVER_SETUP.md`）

> 费用量级：域名约几十元/年 + 轻量服务器约几十元/月。照片走 disk 时**无对象存储费用**。其余全免费、无需审核。
