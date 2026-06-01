# DEPLOYMENT — love-map-mini

> Phase 1 占位。完整部署文档在 Phase 13 补全。

## 本地开发（Phase 1 可用部分）

```bash
npm install
npm run api:dev          # 启动后端，默认 http://localhost:3000
curl http://localhost:3000/health
```

小程序：用微信开发者工具导入 `apps/miniprogram`。

## 后续将补充

- MySQL 启动与 `.env` 配置、Prisma migrate
- 后端生产部署（优先 Docker + HTTPS + 反向代理）
- 对象存储 bucket 权限与服务端签名上传
- 微信小程序 request / uploadFile 合法域名、体验版、审核注意事项
- 隐私合规说明
- 常见问题排查
