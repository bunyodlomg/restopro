#!/usr/bin/env bash
# ============================================================
#  RestoPro — zaxira nusxadan tiklash (restore)
#
#  Ishlatish:
#    ./deploy/restore.sh                      — mavjud arxivlar ro'yxati
#    ./deploy/restore.sh <arxiv.tar.gz>       — tiklash (tasdiq so'raladi)
#    ./deploy/restore.sh <arxiv.tar.gz> --yes — tasdiqsiz
#    ENV_FILE=/etc/restopro/itop.env ./deploy/restore.sh ...  — boshqa restoran (bir VPS'da bir nechta)
#
#  DIQQAT: joriy baza va uploads/ arxivdagisi bilan ALMASHTIRILADI.
#  Tiklashdan oldin joriy holatning xavfsizlik nusxasi olinadi.
#
#  Talab: mongorestore (MongoDB Database Tools), tar
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
# Bir VPS'da bir nechta restoran: ENV_FILE=/etc/restopro/<nom>.env ./deploy/restore.sh ...
export ENV_FILE="${ENV_FILE:-$APP_DIR/server/.env}"   # backup.sh ham shu restoranni zaxiralasin
[ -f "$ENV_FILE" ] || { echo "❌ $ENV_FILE topilmadi" >&2; exit 1; }

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "❌ $*"; exit 1; }

env_get() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^[[:space:]]*$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

MONGO_URI="${MONGO_URI:-$(env_get MONGO_URI)}"
PM2_NAME="${PM2_NAME:-$(env_get PM2_NAME)}"; PM2_NAME="${PM2_NAME:-restopro}"
# uploads/ ning ota papkasi (arxivda "uploads" nomi bilan saqlangan)
SERVER_DIR="$(env_get UPLOAD_DIR)"; SERVER_DIR="$(dirname "${SERVER_DIR:-$APP_DIR/server/uploads}")"
BACKUP_DIR="${BACKUP_DIR:-$(env_get BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/var/backups/restopro}"

ARCHIVE="${1:-}"
if [ -z "$ARCHIVE" ]; then
  echo "Mavjud arxivlar ($BACKUP_DIR):"
  ls -1t "$BACKUP_DIR"/restopro-*.tar.gz 2>/dev/null | while read -r f; do
    echo "  $(basename "$f")  $(du -h "$f" | cut -f1)"
  done || true
  echo
  echo "Tiklash:  $0 $BACKUP_DIR/<arxiv nomi>"
  exit 0
fi

[ -f "$ARCHIVE" ] || fail "Arxiv topilmadi: $ARCHIVE"
[ -n "$MONGO_URI" ] || fail "MONGO_URI topilmadi ($ENV_FILE)"
command -v mongorestore >/dev/null || fail "mongorestore o'rnatilmagan (sudo apt install mongodb-database-tools)"
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

tar -C "$WORK" -xf "$ARCHIVE" || fail "Arxiv ochilmadi (buzilgan?)"
[ -f "$WORK/db.archive.gz" ] || fail "Arxiv ichida db.archive.gz yo'q — bu RestoPro backup emas"

echo "Arxiv ma'lumoti:"
sed 's/^/  /' "$WORK/meta.txt" 2>/dev/null || true
echo

if [ "${2:-}" != "--yes" ]; then
  echo "⚠️  Joriy baza va uploads/ shu arxiv bilan ALMASHTIRILADI."
  read -r -p "Davom etish uchun 'ha' deb yozing: " ANSWER
  [ "$ANSWER" = "ha" ] || { echo "Bekor qilindi."; exit 1; }
fi

# ── Joriy holatning xavfsizlik nusxasi ─────────────────────────
log "Joriy holat zaxiralanmoqda (xavfsizlik uchun)..."
BACKUP_NO_TELEGRAM=1 BACKUP_KEEP=1000 \
  "$SCRIPT_DIR/backup.sh" || fail "Xavfsizlik nusxasi olinmadi — tiklash to'xtatildi"

# ── Serverni to'xtatish (tiklash vaqtida yozuv bo'lmasin) ──────
PM2_STOPPED=0
if command -v pm2 >/dev/null && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  log "pm2: $PM2_NAME to'xtatilmoqda..."
  pm2 stop "$PM2_NAME" >/dev/null && PM2_STOPPED=1
fi
restart() { [ "$PM2_STOPPED" = 1 ] && pm2 start "$PM2_NAME" >/dev/null && log "pm2: $PM2_NAME qayta ishga tushdi"; return 0; }
trap 'restart; rm -rf "$WORK"' EXIT

# ── Baza ───────────────────────────────────────────────────────
log "MongoDB tiklanmoqda..."
mongorestore --uri="$MONGO_URI" --archive="$WORK/db.archive.gz" --gzip --drop --quiet \
  || fail "mongorestore muvaffaqiyatsiz"

# ── Yuklangan fayllar ──────────────────────────────────────────
if [ -f "$WORK/uploads.tar.gz" ]; then
  log "uploads/ tiklanmoqda..."
  rm -rf "$SERVER_DIR/uploads.restore-old"
  [ -d "$SERVER_DIR/uploads" ] && mv "$SERVER_DIR/uploads" "$SERVER_DIR/uploads.restore-old"
  if tar -C "$SERVER_DIR" -xzf "$WORK/uploads.tar.gz"; then
    rm -rf "$SERVER_DIR/uploads.restore-old"
  else
    rm -rf "$SERVER_DIR/uploads"
    [ -d "$SERVER_DIR/uploads.restore-old" ] && mv "$SERVER_DIR/uploads.restore-old" "$SERVER_DIR/uploads"
    fail "uploads tiklanmadi — eski holat qaytarildi"
  fi
fi

log "✅ Tiklash tugadi: $(basename "$ARCHIVE")"
