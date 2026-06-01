# REFERENCE ANALYSIS — love-map-mini

Phase 2 产出。本文件只做**架构与功能层面的学习**，不复制两个参考项目的源代码、UI 素材、
图片、品牌或文案。分析基于本地 `references/`（已 gitignore，不进本仓库）中实际克隆的代码。

参考项目：

- mappedlove — https://github.com/Yizack/mappedlove （MIT，作者 Yizack Rangel）
- qinglv — https://github.com/Leng-bingo/qinglv （MIT）

---

## 1. mappedlove 可借鉴点

**技术栈（实际）**：Nuxt 4（Vue 3 全栈）+ Drizzle ORM + Cloudflare D1（SQLite）+
NuxtHub Blob（R2，存图）+ Leaflet（Web 地图）+ nuxt-auth-utils（会话）+ Zod 校验 +
Paddle（订阅支付）。是 **Web 应用**，不是小程序。

### 数据模型启发（`server/db/schema.ts`）

| 表 | 关键字段 | 对本项目的启发 |
|---|---|---|
| `users` | email, password, name, country, birthDate, showAvatar, language, confirmed | 我们的 User（但用微信 openid 登录，而非邮箱密码） |
| `bonds` | code（唯一邀请码）, partner1, partner2, coupleDate, bonded(bool), public(bool), premium | **情侣绑定核心**：邀请码 + 双方 id + 在一起日期 + 是否公开。对应我们的 Couple |
| `markers` | lat, lng, group, bond, title, description, country, order | 地图地点。对应我们的 Place（我们再加 placeType/visibility/visitedAt） |
| `stories` | marker, bond, user, description, year, month | 某地点下的回忆故事。对应我们的 Memory |
| `logins` | user, attempts, updatedAt | 登录失败次数限流，安全实践可借鉴 |

### 值得借鉴的做法

- **情侣 bond 模型**：用唯一 `code` 邀请绑定，`partner1/partner2` + `bonded` 状态，
  `coupleDate` 记录在一起日期 → 直接启发我们的 Couple（inviteCode / userAId / userBId /
  togetherAt / status）。
- **图片服务端上传**（`server/api/stories/index.post.ts`）：用 `ensureBlob` 校验
  `image/jpeg|png|gif|webp` 类型与大小上限，再 `uploadImage` 上传到对象存储，前端不碰密钥。
  **这正是我们 Phase 12 要的服务端签名/代传模式**。
- **公开地图脱敏**（`server/api/bond/public/[code].get.ts`）：只在 `bond.public === true`
  时返回；返回前**剥离敏感字段**（subscriptionId、nextPayment、partner1、partner2），
  story 用 `hash` 替代真实 id。→ 启发我们 Phase 10 公开地图：默认关闭、只返回 public、
  隐去 openid 和精确信息。
- **marker 排序**（`order` 字段 + rearrange 接口）：地点可排序，启发"路线沉淀"。
- RESTful 接口按资源拆分文件（markers / stories / bond），方法语义正确
  （post/patch/put/delete）。

### 不照搬

- Nuxt/Vue/Leaflet 整套 Web 前端 —— 我们是微信原生小程序，地图用内置 `map` 组件。
- Cloudflare D1/NuxtHub —— 我们用 MySQL + Prisma。
- Paddle 订阅支付、premium 配额 —— MVP 不做支付。
- 邮箱密码 + 邮件验证登录 —— 我们用微信 openid 登录。
- 其品牌、文案、`public/images` 素材、locales。

---

## 2. qinglv 可借鉴点

**技术栈（实际）**：微信原生小程序 + Node.js（Express）+ MySQL（`mysql` 连接池）+
阿里云 OSS（multer + ali-oss）+ nodemailer（邮件验证码）。后端是**单文件**
`nodejs/wxapi.js`（1523 行，约 48 个路由）。

### 微信小程序页面结构（`miniprogram/pages/`）

实际页面：`MainPage`(首页)、`BindCouple`(绑定)、`Account/Register/ForgetSerect`(账号)、
`My/ChangeUserInfo/CutTou`(我的/改资料/裁头像)、`Mission/MissionAdd/MissionDetail`(任务)、
`Market/MarketAdd/MarketDetail/ItemDetail`(商城/商品)、`Daka`(打卡)、`Didian`(地点)、
`RiCheng/RiChengAdd`(日程)、`Fankui`(反馈)。

→ 启发我们的页面拆分：首页 + 绑定 + 我的 + 任务（列表/新增/详情）+ 商城（列表/新增/详情）
+ 打卡 + 日程（列表/新增）。我们按 tab 归并为 home/map/tasks/shop/events/me。

### MySQL 表设计启发（从 `wxapi.js` SQL 语句反推）

实际用到的表：`user`、`missionlist`(任务)、`marketlist`(商城)、`strogelist`(库存/背包)、
`matterlist`(日程事件)、`signin`(签到)、`locationlist`(位置打卡)。

| qinglv 表 | 对应本项目模型 | 调整 |
|---|---|---|
| `user` | User | 改用 openid；情侣关系独立成 Couple 表（qinglv 把绑定塞在 user 上） |
| `missionlist` | Task | 显式状态机枚举 + creator/assignee + coupleId |
| `marketlist` | ShopItem | 加 coupleId、status、stock |
| `strogelist` | Redemption（背包） | 加 status(unused/used/cancelled)、事务 |
| `matterlist` | Event | eventType(anniversary/date/countdown/plan) |
| `signin` | PointLedger(sourceType=signin) | 并入统一积分流水 |
| `locationlist` | Checkin | 加 shareScope、expiresAt、软删除 |
| —（无独立积分表） | **PointLedger（我们新增）** | qinglv 积分直接加在 user 字段上，我们独立成流水，可审计 |

### 业务流程（README + 路由）

- **任务闭环**：发布任务 → 对方接受/拒绝 → 完成 → 发布者确认 → 发积分。
  （对应路由 `addElement` / `editAvailable` / `checkAvailable` / `editStar` 等）
- **商城闭环**：发布商品 → 对方用积分兑换 → 进库存(strogelist) → 使用后标记已使用（不可逆）。
- **签到**：每日签到 +1 积分（`isSignIn` / `addNewSignIn` / `getSignDate`）。
- **日程**：倒计时 + 正计时，首页显示最新 5 条（`searchMatter` / `doMatter`）。

→ 这些闭环直接映射到我们的 Phase 7/8/9，但我们会补齐**状态机约束**与**积分/库存事务**。

### 不照搬（含明确的安全/合规风险）

> qinglv 是个人学习项目，存在多处不安全写法。我们**借鉴功能，但重写实现**。

1. **硬编码密钥**（高风险）：`wxapi.js` 中明文写有 MySQL 密码（`password: 'lgn970722'`）、
   OSS `accessKeyId/Secret` 占位、`APP_ID/APP_SECRET` 直接写在源码。
   → 我们一律走 `.env`，密钥不入库、不进前端。
2. **OSS 密钥在后端可被打包风险**：其上传逻辑把 OSS client 配置写死在代码。
   → 我们用服务端签名上传 + provider 抽象（Phase 12）。
3. **用 GET 做写操作**（高风险）：如 `deleteMatter`、`doMatter`、`editCredit`、
   `deleteElement` 等大量 mutation 走 `app.get`，且无鉴权中间件、无 CSRF 防护、参数走 query。
   → 我们用正确 HTTP 方法 + requireAuth + Zod 校验 + coupleId 越权校验。
4. **缺少权限校验**：接口多以 `openid`/id 作为信任参数，未验证调用者是否属于该 couple。
   → 我们每个私有接口校验 `userId` + `coupleId`。
5. **单文件 1523 行**、无 TypeScript、无统一响应格式、无分页。
   → 我们模块化（src/modules/*）+ TS + 统一 success/error + 分页。
6. **网络图片素材、作者文案、品牌**（"小冷小洋的爱情杂货铺"）、`Pics/`、
   `miniprogram/images/` 内素材 —— 一律不使用，改用自建占位图标。
7. **位置功能**：qinglv `locationlist` 无默认关闭/过期/共享范围概念。
   → 我们位置默认 self、可设 expiresAt、无后台定位、伴侣需显式分享才可见。

---

## 3. 本项目最终功能模块拆分

```
Auth        微信登录(占位→真实)、mock 登录、token
Couple      邀请码、绑定/解绑、partner 信息
Place       地点（visited/wishlist/plan）、visibility、地图 marker
Memory      回忆故事（关联 place）、心情、日期
Media       照片元数据、服务端签名上传
Checkin     主动打卡、临时共享(self/partner/memory)、过期、距离
Task        任务状态机、creator/assignee、积分挂钩
Point       PointLedger 统一流水、签到、余额
Shop        商品、库存、积分兑换（事务）
Redemption  背包、使用/取消（事务退回）
Event       纪念日/倒计时/计划、首页聚合
Privacy     PrivacyConsent 授权记录
PublicShare 公开地图骨架、脱敏、默认关闭
```

各模块开发顺序见 [ROADMAP.md](ROADMAP.md)。

---

## 4. License 与素材使用风险

- 两个参考项目均为 **MIT** 许可证：允许借鉴思路并重写实现；若直接复制其源码片段，需保留
  其 MIT 版权与许可声明。**本项目选择不复制源码**，因此以"参考致谢"方式记入
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- **图片/品牌风险**：qinglv 的 README、`Pics/`、`miniprogram/images/` 中含作者品牌
  （"小冷小洋"）与网络图片，**严禁复用**——这些可能含第三方版权，且属于他人品牌标识。
- mappedlove 的 `public/images`、字体、locales 文案同样不复用。
- 我们引入的任何 npm 生产依赖，其许可证将补记到 THIRD_PARTY_NOTICES.md。

---

## 5. 关键差异化（我们 > 参考项目）

| 维度 | 参考项目现状 | 本项目改进 |
|---|---|---|
| 密钥管理 | 硬编码 | 全部 .env，前端零密钥 |
| 鉴权/越权 | 弱/缺失 | requireAuth + userId + coupleId 校验 |
| 积分 | 直接改 user 字段 | 独立 PointLedger 可审计流水 |
| 事务 | 无 | 积分扣减/库存/兑换用事务 |
| 位置隐私 | 无默认关闭 | 默认 self、过期、无后台定位、显式共享 |
| 公开分享 | mappedlove 有脱敏，qinglv 无 | 默认关闭 + 坐标模糊 + 字段剥离 |
| 代码组织 | 单文件 JS | TS 模块化 + 统一响应 + 校验 + 分页 |
