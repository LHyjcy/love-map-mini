# @love-map-mini/api

love-map-mini 后端：Node.js + TypeScript + Fastify。

## 启动

```bash
# 在仓库根目录安装依赖（npm workspaces）
npm install

# 复制环境变量示例
cp apps/api/.env.example apps/api/.env   # Windows: copy apps\api\.env.example apps\api\.env

# 开发模式（热重载）
npm run api:dev
# 或在本目录：
#   npm run dev
```

默认监听 `http://localhost:3000`。

## 验证

```bash
curl http://localhost:3000/health
# {"success":true,"data":{"status":"ok","service":"love-map-mini-api","time":"..."}}
```

## 脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | tsx 热重载启动 |
| `npm run build` | tsc 编译到 `dist/` |
| `npm run start` | 运行编译产物 |
| `npm run typecheck` / `lint` | 仅类型检查 |

## 约定

- 所有接口使用统一响应格式（`src/utils/response.ts`）。
- 错误统一经 `src/utils/errors.ts` 处理。
- Phase 1 只有 `/health`，不接 MySQL、不含业务接口、不放真实密钥。
