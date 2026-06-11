# scripts

Helper scripts for love-map-mini.

## backup.sh

服务器（docker compose 部署）每日备份脚本：MySQL 全量 dump（gzip）+ 照片目录
`/app/uploads`（tar.gz）→ `backups/<时间戳>/`，自动校验完整性、清理过期备份
（默认保留 14 天），可选 `BACKUP_SYNC_CMD` 异地同步。

```sh
./scripts/backup.sh
# cron: 30 3 * * * /opt/love-map/scripts/backup.sh >> /var/log/love-map-backup.log 2>&1
```

环境变量：`BACKUP_DIR` / `BACKUP_KEEP_DAYS` / `BACKUP_SYNC_CMD`。
恢复方法见 `docs/SERVER_SETUP.md`「日常运维」。

## verify-cos.mjs

Standalone connectivity check for Tencent Cloud COS direct upload.

It uses the exact same COS Signature V5 (HMAC-SHA1) presign algorithm as
`apps/api/src/services/storage.ts` (`cosPresignedPutUrl`) and performs a full
round trip against a real bucket:

1. Presign a `PUT` URL and upload a tiny test object (`uploads/_verify_<random>.txt`).
2. Presign a `GET` URL, download the object, and confirm the body matches.
3. Print the resulting `fileUrl` on success, or the failing HTTP status + response on error.

No external dependencies: only the built-in `node:crypto` and the global `fetch`
(requires Node 20+ / 24).

### Run

```sh
node --env-file=apps/api/.env scripts/verify-cos.mjs
```

### Required environment variables

| Variable | Notes |
| --- | --- |
| `STORAGE_PROVIDER` | must be `cos` |
| `STORAGE_REGION` | e.g. `ap-guangzhou` |
| `STORAGE_BUCKET` | includes APPID, e.g. `myapp-1250000000` |
| `STORAGE_ACCESS_KEY_ID` | Tencent Cloud SecretId |
| `STORAGE_ACCESS_KEY_SECRET` | Tencent Cloud SecretKey |
| `STORAGE_PUBLIC_BASE_URL` | optional custom access domain |

If `STORAGE_PROVIDER` is not `cos` or any required value is missing, the script
prints a clear message and exits with code 1.

### Note on CORS

This script validates the **server-side** presigned `PUT`/`GET` path. The
miniprogram client (browser/`wx.uploadFile`) additionally requires the bucket's
**CORS** rules to be configured in the COS console; that is not (and cannot be)
checked here, since server-side PUT is not subject to CORS.
