#!/usr/bin/env bash
# love-map-mini 备份脚本（docker compose 部署用）。
# 备份内容：
#   1) MySQL 全量 dump（--single-transaction 不锁表，gzip 压缩）
#   2) 照片目录 /app/uploads（STORAGE_PROVIDER=disk 时的照片；tar.gz）
# 产物落在 <项目根>/backups/<时间戳>/ 下：db.sql.gz + uploads.tgz。
#
# 用法（在服务器上、compose 项目根可被定位的前提下）：
#   ./scripts/backup.sh
#   BACKUP_DIR=/data/backups BACKUP_KEEP_DAYS=30 ./scripts/backup.sh
#
# 建议 cron（每天 03:30，日志追加到 /var/log/love-map-backup.log）：
#   30 3 * * * /opt/love-map/scripts/backup.sh >> /var/log/love-map-backup.log 2>&1
#
# 可选环境变量：
#   BACKUP_DIR        备份输出目录（默认 <项目根>/backups，已在 .gitignore）
#   BACKUP_KEEP_DAYS  本地保留天数，过期目录自动清理（默认 14）
#   BACKUP_SYNC_CMD   备份成功后执行的异地同步命令，会把当天备份目录作为最后一个参数传入。
#                     例：BACKUP_SYNC_CMD="rclone copy --include '*'" 时实际执行
#                     `rclone copy --include '*' <备份目录>`；建议在命令里写好远端目标。
#
# 恢复方法见 docs/SERVER_SETUP.md「日常运维」一节。
set -euo pipefail

# cron 环境 PATH 很短，补上 docker 常见安装路径。
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# 项目根 = 本脚本所在目录的上一级（docker-compose.yml 所在处）。
cd "$(cd "$(dirname "$0")" && pwd)/.."

# 兼容 docker compose 插件与旧版 docker-compose 二进制。
if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  echo "[backup] 错误：找不到 docker compose / docker-compose" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

echo "[backup] $STAMP 开始 → $DEST"

# 1) 数据库：在 mysql 容器内执行 mysqldump，流式 gzip 落盘。
#    密码取容器自身的 MYSQL_ROOT_PASSWORD 环境变量，不经过宿主机命令行。
compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers love_map_mini' \
  | gzip > "$DEST/db.sql.gz"

# 2) 照片：在 api 容器内把 /app/uploads 打包（local 模式下目录为空，产物很小，无害）。
compose exec -T api tar czf - -C /app/uploads . > "$DEST/uploads.tgz"

# 3) 校验：两个压缩包完整、数据库 dump 不为可疑的空文件。
gzip -t "$DEST/db.sql.gz"
gzip -t "$DEST/uploads.tgz"
DB_SIZE="$(stat -c%s "$DEST/db.sql.gz")"
if [ "$DB_SIZE" -lt 1024 ]; then
  echo "[backup] 错误：db.sql.gz 仅 ${DB_SIZE} 字节，疑似 dump 失败，本次备份保留现场供排查" >&2
  exit 1
fi

echo "[backup] 完成：$(du -sh "$DEST" | cut -f1)（db.sql.gz + uploads.tgz）"

# 4) 清理过期备份：只清理本脚本生成的时间戳目录，绝不动 BACKUP_DIR 里的其他文件。
find "$BACKUP_DIR" -maxdepth 1 -type d -name '20??????-??????' -mtime +"$KEEP_DAYS" \
  -exec rm -rf {} + 2>/dev/null || true

# 5) 可选：异地同步（强烈建议，服务器盘坏了本地备份会一起丢）。
if [ -n "${BACKUP_SYNC_CMD:-}" ]; then
  echo "[backup] 异地同步：$BACKUP_SYNC_CMD $DEST"
  $BACKUP_SYNC_CMD "$DEST"
fi

echo "[backup] 全部完成"
