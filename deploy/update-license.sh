#!/usr/bin/env bash
# ============================================================
#  RestoPro litsenziya serverini yangilash
#
#    ./deploy/update-license.sh                  — qo'lda (VPS'da)
#    PM2_NAME=boshqa ./deploy/update-license.sh  — pm2 nomi boshqacha bo'lsa
#
#  Odatda qo'lda ishga tushirish shart emas: main'ga push qilinganda GitHub Actions
#  litsenziya serveriga "yangilan" deydi, yoki admin paneldagi «Yangilash» tugmasi.
#
#  Tartib: data/ zaxirasi → git pull → (package-lock o'zgarsa) npm ci → pm2 restart →
#  /health tekshiruvi. Yangi versiya ishga tushmasa, oldingi commit'ga avtomatik qaytadi.
#  Natija: license-server/data/update.log (admin panelda ko'rinadi).
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
LIC_DIR="$APP_DIR/license-server"
PM2_NAME="${PM2_NAME:-restopro-license}"
env_val() { grep -E "^$1=" "$LIC_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }
PORT="$(env_val PORT)"; PORT="${PORT:-7070}"
DATA_DIR="$(env_val DATA_DIR)"; DATA_DIR="${DATA_DIR:-./data}"
case "$DATA_DIR" in /*) ;; *) DATA_DIR="$LIC_DIR/${DATA_DIR#./}" ;; esac
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/restopro-license-backups}"

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "❌ $*"; exit 1; }
# Kutilmagan xato (masalan git pull) — logda natija bo'lsin (admin panel va CI shunga qaraydi)
trap 'log "❌ Kutilmagan xato (${BASH_COMMAND}) — oldingi versiya ishlayapti"' ERR

# Bir vaqtda ikkita yangilanish bo'lmasin
exec 9>/tmp/restopro-license-update.lock
flock -n 9 || fail "Boshqa yangilanish ketyapti"

[ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] || fail "Repozitoriyda saqlanmagan o'zgarishlar bor: git -C $APP_DIR status"

log "data/ zaxirasi..."
mkdir -p "$BACKUP_ROOT"
tar -czf "$BACKUP_ROOT/data-$(date +%F-%H%M%S).tar.gz" --exclude="$(basename "$DATA_DIR")/updates" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")" \
  || fail "Zaxira olinmadi — yangilash to'xtatildi"
ls -1t "$BACKUP_ROOT"/data-*.tar.gz | tail -n +31 | xargs -r rm -f   # oxirgi 30 tasi qoladi

OLD="$(git -C "$APP_DIR" rev-parse HEAD)"
log "Yangi versiya yuklanmoqda..."
git -C "$APP_DIR" pull --ff-only
NEW="$(git -C "$APP_DIR" rev-parse HEAD)"
if [ "$OLD" = "$NEW" ]; then log "✅ Allaqachon oxirgi versiya ($(git -C "$APP_DIR" rev-parse --short HEAD))"; exit 0; fi
git -C "$APP_DIR" log --oneline "$OLD..$NEW" -- license-server deploy/update-license.sh | sed 's/^/  /'

restart_and_check() {
  if ! git -C "$APP_DIR" diff --quiet "$1" HEAD -- license-server/package-lock.json license-server/package.json; then
    (cd "$LIC_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
  fi
  pm2 restart "$PM2_NAME" --update-env >/dev/null
  sleep 2
  for _ in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

log "Qayta ishga tushirish..."
if restart_and_check "$OLD"; then
  pm2 save >/dev/null 2>&1 || true
  log "✅ Yangilandi: $(git -C "$APP_DIR" rev-parse --short "$OLD") → $(git -C "$APP_DIR" rev-parse --short "$NEW")"
else
  log "⚠️  Yangi versiya ishlamadi — oldingisiga qaytarilmoqda..."
  git -C "$APP_DIR" reset -q --hard "$OLD"
  restart_and_check "$NEW" || fail "Qaytarish ham ishlamadi! pm2 logs $PM2_NAME"
  fail "Yangilash bekor qilindi, $(git -C "$APP_DIR" rev-parse --short "$OLD") versiyasi ishlayapti. Sabab: pm2 logs $PM2_NAME"
fi
