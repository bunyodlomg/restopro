#!/usr/bin/env bash
# ============================================================
#  RestoPro — yangi versiyaga yangilash
#
#    sudo ./deploy/update.sh            — joriy branchning oxirgi versiyasi
#    PM2_NAME=cafe1 ./deploy/update.sh  — pm2 nomi boshqacha bo'lsa
#
#  Tartib: backup → git pull → npm ci → frontend build → pm2 restart → tekshiruv.
#  Yangi versiya ishga tushmasa, oldingi commit'ga avtomatik qaytadi.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
PM2_NAME="${PM2_NAME:-restopro}"
WEB_ROOT="/var/www/restopro-$PM2_NAME"
PORT="$(grep -E '^PORT=' "$APP_DIR/server/.env" | tail -n1 | cut -d= -f2 || true)"; PORT="${PORT:-5050}"

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "❌ $*"; exit 1; }

[ -d "$WEB_ROOT" ] || fail "$WEB_ROOT topilmadi — avval install.sh ishga tushiring (yoki PM2_NAME ni to'g'rilang)"
[ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] || fail "Repozitoriyda saqlanmagan o'zgarishlar bor: git -C $APP_DIR status"

build_and_restart() {
  (cd "$APP_DIR/server"   && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
  (cd "$APP_DIR/frontend" && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)
  rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
  pm2 restart "$PM2_NAME" --update-env >/dev/null
  for _ in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

log "Backup..."
"$SCRIPT_DIR/backup.sh" || fail "Backup olinmadi — yangilash to'xtatildi"

OLD="$(git -C "$APP_DIR" rev-parse HEAD)"
log "Yangi versiya yuklanmoqda..."
git -C "$APP_DIR" pull --ff-only
NEW="$(git -C "$APP_DIR" rev-parse HEAD)"
if [ "$OLD" = "$NEW" ]; then log "Allaqachon oxirgi versiya ($(git -C "$APP_DIR" rev-parse --short HEAD))"; exit 0; fi
git -C "$APP_DIR" log --oneline "$OLD..$NEW" | sed 's/^/  /'

log "Yig'ish va qayta ishga tushirish..."
if build_and_restart; then
  log "✅ Yangilandi: $(git -C "$APP_DIR" rev-parse --short "$OLD") → $(git -C "$APP_DIR" rev-parse --short "$NEW")"
else
  log "⚠️  Yangi versiya ishlamadi — oldingisiga qaytarilmoqda..."
  git -C "$APP_DIR" checkout -q "$OLD"
  build_and_restart || fail "Qaytarish ham ishlamadi! pm2 logs $PM2_NAME"
  git -C "$APP_DIR" checkout -q -   # branchga qaytish (keyingi pull uchun)
  git -C "$APP_DIR" reset -q --hard "$OLD"
  fail "Yangilash bekor qilindi, $(git -C "$APP_DIR" rev-parse --short "$OLD") versiyasi ishlayapti. Sabab: pm2 logs $PM2_NAME"
fi
