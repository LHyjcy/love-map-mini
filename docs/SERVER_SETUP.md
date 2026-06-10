# 服务器首次部署 · 手把手（SERVER_SETUP）

> 目标：在一台全新 Linux 服务器上,把 love-map-mini 后端跑起来,供两人微信「体验版」使用。
> 配套：`docker-compose.yml`、`deploy/nginx.conf.sample`、私用说明见 `docs/PRIVATE_USE.md`。
> 约定：`<...>` 都是占位,换成你的真实值;命令以 Ubuntu 22.04 为例(root 或 sudo)。

---

## 0. 前置（你需要先有的）

- 一台云服务器（1C2G 起步够用），公网 IP。
- 一个域名，解析一条 A 记录指向服务器 IP，例如 `api.example.com`。
  - 国内服务器：域名需 **ICP 备案**（免费，约 1–2 周）。海外/香港服务器可免备案（国内访问略慢）。
- 已注册的**个人小程序 AppID**（mp.weixin.qq.com）。

---

## 1. 装 Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version && docker compose version
```

## 2. 拿到代码

把项目传到服务器（任选）：
```bash
# 方式 A：git
git clone <你的仓库地址> /opt/love-map && cd /opt/love-map
# 方式 B：本地打包上传后解压到 /opt/love-map
```

## 3. 写 .env（compose 会读取）

在项目根目录（与 `docker-compose.yml` 同级）建 `.env`：
```bash
cat > /opt/love-map/.env <<'EOF'
MYSQL_ROOT_PASSWORD=<一个强密码>
JWT_SECRET=<一段长随机串，可用 openssl rand -hex 32 生成>
# 微信登录（个人小程序开发设置里拿）
WECHAT_APP_ID=<wx-app-id>
WECHAT_APP_SECRET=<wx-app-secret>
# 照片：本机磁盘存储，免 COS（已挂持久卷 api_uploads）
STORAGE_PROVIDER=disk
STORAGE_PUBLIC_BASE_URL=https://api.example.com
# 公开地图 CORS（没部署 web-share 可留默认）
PUBLIC_WEB_ORIGIN=*
EOF
```
> `openssl rand -hex 32` 可生成 JWT_SECRET。`.env` 不要提交仓库。

## 4. 起服务 + 建表

```bash
cd /opt/love-map
docker compose up -d --build
docker compose exec api npx prisma migrate deploy   # 首次/每次升级后建/改表
docker compose ps                                   # api、mysql 都 healthy/running
curl http://127.0.0.1:3000/health                   # {"success":true,...}
```

## 5. 配 HTTPS 反向代理（Nginx + 免费证书）

```bash
apt-get update && apt-get install -y nginx
# 用仓库样例改出你的站点配置（把 server_name / 证书路径换成你的）
cp deploy/nginx.conf.sample /etc/nginx/sites-available/love-map.conf
#   编辑：server_name api.example.com; proxy_pass http://127.0.0.1:3000; 保留 /ws/location 升级头
ln -s /etc/nginx/sites-available/love-map.conf /etc/nginx/sites-enabled/
# 申请证书（自动改写 Nginx 为 HTTPS）
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d api.example.com
nginx -t && systemctl reload nginx
curl https://api.example.com/health                 # 外网 HTTPS 通
```

## 6. 小程序后台配置（mp.weixin.qq.com）

「开发管理 → 开发设置 → 服务器域名」全部填 `https://api.example.com`（及 `wss://api.example.com`）：
- `request` 合法域名：`https://api.example.com`
- `socket` 合法域名：`wss://api.example.com`（位置共享 WebSocket）
- `uploadFile` 合法域名：`https://api.example.com`（照片 disk 直传走本服务）
- `downloadFile` 合法域名：`https://api.example.com`（照片读取 `/files/...`）

## 7. 小程序指向生产 + 上传体验版

- 改 `apps/miniprogram/app.js`：
  - `globalData.baseUrl = 'https://api.example.com'`；
  - `globalData.enableDevLogin = false`（体验版只留「微信登录」，隐藏演示/体验登录，避免邀请来的人点到仅开发可用的按钮）。
- 微信开发者工具「上传」→ 公众平台「版本管理」即为**体验版**。
- 「成员管理 → 体验成员」加入**你邀请的人的微信号**（最多可加多名体验成员）。
- 各自微信打开「体验版」→ 一方生成邀请码（可「分享给 TA」或「复制」）、另一方绑定 → 开始用。**无需提审/发布。**

## 8. 日常运维

```bash
docker compose logs -f api          # 看后端日志
docker compose pull && docker compose up -d --build   # 更新代码后重建
docker compose exec api npx prisma migrate deploy      # 有 schema 变更时
# 备份：数据库
docker compose exec mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" love_map_mini' > db_backup.sql
# 备份：照片卷（卷名前缀 = compose 项目名，docker volume ls 可查，通常是 love-map_api_uploads）
docker run --rm -v love-map_api_uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads.tgz -C /data .
```

---

## 排错速查

| 现象 | 处理 |
|---|---|
| `/health` 不通 | `docker compose logs api`；确认 mysql healthy、DATABASE_URL 对 |
| 小程序请求被拦 | 合法域名没配全 / 不是 HTTPS / 域名未备案（国内） |
| 微信登录失败 | AppID/Secret 错或没填；域名未在合法域名内 |
| 照片传不上 | `STORAGE_PUBLIC_BASE_URL` 必须是外网可达的 https；`uploadFile` 合法域名要包含它 |
| 照片重建后丢 | 确认 `api_uploads` 卷已挂载（compose 已配）；别用 `docker compose down -v`（会删卷） |
| WebSocket 不通 | Nginx 的 `/ws/location` 需带 `Upgrade`/`Connection` 升级头（样例已含） |

> 体验版长期可用,只有让陌生人也能搜到才需提审+发布（两人私用不需要）。
