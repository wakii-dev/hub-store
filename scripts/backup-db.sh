#!/usr/bin/env bash
# SF-12 (FI-257) — backup-db.sh: pg_dump cả 2 DB (fulfillment + batching) qua
# container postgres → gzip → backups/<db>-<ts>.sql.gz, giữ BACKUP_KEEP bản/DB.
#
#   POSTGRES_CONTAINER  tên container postgres (default hub-store-postgres-1 —
#                       verify từ `docker ps`; fallback `docker compose ps -q postgres`)
#   POSTGRES_USER       user pg_dump (default hubstore — docker exec peer auth,
#                       KHÔNG cần password)
#   BACKUP_KEEP         số bản giữ mỗi DB (default 7)
#   BACKUP_DIR          thư mục đích (default <repo>/backups)
#
# Fail-loud: 1 DB dump lỗi (exit code != 0 hoặc file rỗng) → exit non-zero,
# DB còn lại vẫn được dump. Cron/systemd wiring: README mục "Backup / Restore".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then set -a; . "$ROOT/.env"; set +a; fi
POSTGRES_USER="${POSTGRES_USER:-hubstore}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-hub-store-postgres-1}"

# Resolve container: tên tường minh trước, fallback compose service "postgres".
if ! docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
  cid="$(docker compose ps -q postgres 2>/dev/null || true)"
  if [[ -n "$cid" ]]; then
    POSTGRES_CONTAINER="$cid"
  else
    echo "backup-db: ERROR — postgres container chưa chạy ('$POSTGRES_CONTAINER' + compose 'postgres' đều không thấy). 'docker compose up -d postgres'?" >&2
    exit 1
  fi
fi

if ! [[ "$BACKUP_KEEP" =~ ^[0-9]+$ ]] || [[ "$BACKUP_KEEP" -lt 1 ]]; then
  echo "backup-db: ERROR — BACKUP_KEEP phải là số nguyên >= 1 (nhận: '$BACKUP_KEEP')" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
FAILED=()

for DB in fulfillment batching; do
  out="$BACKUP_DIR/$DB-$TS.sql.gz"
  echo "backup-db: pg_dump $DB → $out"
  # pipefail: exit code pg_dump không bị gzip nuốt; kiểm cả file size >0.
  if ! docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$DB" | gzip > "$out"; then
    echo "backup-db: ERROR — pg_dump $DB (container $POSTGRES_CONTAINER) exit khác 0" >&2
    rm -f "$out"
    FAILED+=("$DB")
    continue
  fi
  if [[ ! -s "$out" ]]; then
    echo "backup-db: ERROR — dump $DB rỗng (0 bytes)" >&2
    rm -f "$out"
    FAILED+=("$DB")
    continue
  fi

  # Retention per-DB prefix: giữ BACKUP_KEEP bản mới nhất của <db>-*.sql.gz.
  old="$(ls -1t "$BACKUP_DIR/$DB"-*.sql.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) || true)"
  if [[ -n "$old" ]]; then
    while IFS= read -r f; do
      echo "backup-db: retention — xóa $f"
      rm -f "$f"
    done <<< "$old"
  fi
done

if [[ "${#FAILED[@]}" -gt 0 ]]; then
  echo "backup-db: FAILED — DB lỗi: ${FAILED[*]}" >&2
  exit 1
fi

echo "backup-db: OK — backups (giữ tối đa $BACKUP_KEEP bản/DB):"
ls -lh "$BACKUP_DIR"/*.sql.gz | tail -n 4
