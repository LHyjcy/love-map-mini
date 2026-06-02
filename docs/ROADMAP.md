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
