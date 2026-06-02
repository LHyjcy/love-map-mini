# REVIEW REPORT — love-map-mini

Phase 13 安全 / 隐私 / 越权 / 合规审查。基于当前 `apps/api/src` 与 `apps/miniprogram` 实际代码。

审查范围：Phase 4–12 全部后端路由（auth、couples、places、memories、media、uploads、
checkins、tasks、points、shop、events、dashboard、privacy、publicShare）与小程序联调。

## 结论速览

| 维度 | 评级 | 说明 |
|---|---|---|
| 鉴权与越权 | ✅ 通过 | 全部业务端点带 `preHandler:[app.authenticate]`；情侣资源经 `requireActiveCouple` 按 `coupleId` 隔离 |
| 密钥管理 | ✅ 通过 | 无硬编码密钥；`.env` 已 gitignore；生产缺 `JWT_SECRET` 直接失败；`session_key`/AppSecret 不返前端 |
| 位置隐私 | ✅ 通过 | 无后台定位；打卡默认 `self`；伴侣位置需显式共享且未过期 |
| 公开分享 | ✅ 通过（骨架） | 默认关闭；当前不输出坐标；脱敏待公开页实现 |
| 数据一致性 | ✅ 通过 | 积分流水不可变；任务发分、商城兑换/退回均走 `$transaction` |
| 软删除 | ✅ 通过 | 读查询统一过滤 `deletedAt:null` |
| 写校验 | ✅ 通过 | 写接口统一 Zod `parse`；错误响应统一格式 |
| 分页 | ⚠️ 低风险 | 列表用 `take` 上限（如 ledger 100、checkins 50），但多数列表暂无游标分页 |
| 开源合规 | ✅ 通过 | 未复制参考项目素材/文案；见 THIRD_PARTY_NOTICES.md |

## 1. 鉴权与越权

- 逐文件核对：每个路由文件 `preHandler` 数量 == 路由数量（端点 100% 需登录）。
- 情侣资源：取 `userId=request.user.sub` → `requireActiveCouple(userId)` → 所有查询带
  `coupleId: couple.id`；资源读取/改删用 `where:{ id, coupleId, deletedAt:null }`，不属于本
  情侣即 `404`，避免越权读写。
- `PrivacyConsent` 为按用户资源，正确地按 `userId` 隔离（不挂 couple）。
- **建议**：未来加“资源创建者 vs 伴侣”更细粒度操作权限（如仅创建者可删任务）时，集中到
  工具函数，避免分散判断。

## 2. 密钥与登录

- `JWT_SECRET` 仅 env 读取；生产缺失 `throw`，开发用显式占位且标注 insecure。
- `mockLoginEnabled = !isProduction`：生产自动禁用 mock 登录（`403 MOCK_LOGIN_DISABLED`）。
- 微信登录：AppSecret 仅 env；`code2session` 错误信息不带 URL/secret；`session_key` 仅服务端
  使用，响应只回 `{ token, user }`，**不含 session_key/openid 之外的敏感字段**。
- JWT 载荷仅 `{ sub }`，不含可识别信息。
- 仓库核验：无 `.env` 入库、无密钥字面量。

## 3. 位置与隐私

- 无任何后台/定时定位逻辑；打卡仅由 `POST /api/checkins` 主动触发。
- `shareScope` 默认 `self`；`partner-latest` 仅返回伴侣 `shareScope ∈ {partner,memory}` 且
  `expiresAt` 未过期的记录；过期即不可见。
- 打卡、回忆、媒体、地点均可软删除；删除后不参与查询。
- 公开分享默认关闭，骨架不输出坐标。

## 4. 数据一致性

- 积分只经 `PointLedger`（不可变流水）增减，余额=求和，不直接改用户字段。
- 任务 `confirm` 在 `$transaction` 内更新状态并发分，凭 `completed→confirmed` 流转保证只发一次。
- 商城兑换/退回在 `$transaction` 内同时处理库存与积分，避免超卖/积分不一致。

## 5. 待办 / 低风险项

1. **列表分页**：多数列表接口目前无游标分页，仅 `take` 限量。数据增长后应补 `cursor`/`page`。
2. **对象存储**：`cos`/`oss` 预签名未接线（需厂商 SDK，待确认依赖后实现），当前返回 501。
3. **速率限制**：mock/wechat 登录、邀请接受等可加限流，防爆破邀请码（已 6 位+24h+绑定即失效，
   风险较低）。
4. **运行期验证**：数据路径需连 MySQL 才能端到端跑；CI 建议加一个带 MySQL 的集成测试。

## 6. 开源合规

- 参考项目（mappedlove、qinglv）仅作灵感，未复制大段代码/素材/文案/品牌；许可声明见
  `docs/THIRD_PARTY_NOTICES.md`。
- 未引入未经确认的重型生产依赖（COS/OSS SDK 留待确认）。

## 复核方式

```bash
# 每个路由文件 preHandler 覆盖
grep -c "preHandler: \[app.authenticate\]" apps/api/src/routes/*.ts
# 无硬编码密钥
git grep -nIE "AppSecret|ACCESS_KEY_SECRET" -- apps
# .env 未入库
git ls-files | grep -E "(^|/)\.env$"
```
