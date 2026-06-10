# love-map-mini

情侣记忆地图 + 情侣互动微信小程序。原创实现，仅在产品与架构思路上参考
[mappedlove](https://github.com/Yizack/mappedlove) 与
[qinglv](https://github.com/Leng-bingo/qinglv)，不复制其代码、素材、品牌或密钥。

## 仓库结构

```
love-map-mini/
├─ CLAUDE.md              # Claude Code 项目规则与完成标准
├─ .claude/               # settings.json + skills
├─ apps/
│  ├─ miniprogram/        # 微信原生小程序
│  ├─ api/                # Node.js + TypeScript + Fastify 后端
│  └─ web-share/          # 公开地图分享页（Leaflet 静态站，已实现；部署见 docs/DEPLOYMENT.md §8）
├─ packages/
│  └─ shared/             # 共享类型、枚举、校验
├─ database/
│  ├─ migrations/
│  └─ seed/
├─ docs/                  # PRD / API / DATABASE / PRIVACY / DEPLOYMENT 等
└─ scripts/               # 辅助脚本
```

## 快速开始（Phase 1）

```bash
# 安装依赖（根目录，npm workspaces）
npm install

# 启动后端（开发模式，默认 http://localhost:3000）
npm run api:dev

# 健康检查
curl http://localhost:3000/health
```

小程序：用微信开发者工具导入 `apps/miniprogram` 目录。

## 开发方式

本项目按阶段（Phase 1–13）推进，每个阶段单独执行、单独验证。详见
[docs/ROADMAP.md](docs/ROADMAP.md) 与 [CLAUDE.md](CLAUDE.md)。

## 隐私优先

位置共享默认关闭、无后台持续定位、公开地图默认关闭、所有私有接口校验
`userId` + `coupleId`。详见 [docs/PRIVACY.md](docs/PRIVACY.md)。
