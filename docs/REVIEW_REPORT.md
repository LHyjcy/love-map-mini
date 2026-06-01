# REVIEW REPORT — love-map-mini

> 占位文件。代码质量、安全、隐私、越权与开源合规审查在 Phase 13（或每 2–3 阶段
> 运行 `/phase-review` / `/security-review`）时填写。

## 审查维度

1. 鉴权：私有 API 是否 requireAuth；couple 资源是否校验 coupleId；是否可能越权。
2. 隐私：是否有后台定位；位置共享/公开地图是否默认关闭；公开地图是否脱敏；数据可删除。
3. 密钥：是否硬编码 AppSecret；OSS/COS 密钥是否进前端；`.env` 是否被 gitignore。
4. 数据库：关键关系是否有索引；软删除是否正确过滤；积分/库存是否用事务。
5. API：写接口是否 Zod 校验；错误响应是否统一；是否有分页。
6. 小程序：API baseUrl 是否可配置；授权失败是否提示；空状态是否友好。
7. 开源合规：THIRD_PARTY_NOTICES.md 是否完整；是否复制参考项目素材或文案。

## 结论

（待填写：高风险 / 中风险 / 低风险问题与建议修复顺序）
