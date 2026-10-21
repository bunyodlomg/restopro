#!/usr/bin/env bash
# ============================================================
#  RestoPro — yangi versiyaga yangilash (shu VPS'dagi hamma restoranlar)
#
#    sudo ./deploy/update.sh           — joriy branchning oxirgi versiyasi
#    sudo ./deploy/update.sh --force   — versiya o'zgarmagan bo'lsa ham qayta yig'ish va qayta ishga tushirish
#
#  Kod bitta (shu papka), restoranlar ko'p: server/.env va /etc/restopro/*.env.
#  Tartib: backup → git pull → npm ci → frontend build → har restoran: pm2 restart → tekshiruv.
#  Birorta restoran ishga tushmasa, hammasi oldingi commit'ga avtomatik qaytadi.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "❌ $*"; exit 1; }

# Kod umumiy — yangilansa hamma restoran qayta ishga tushadi (eski kodda qolib ketmasin)
mapfile -t ENVS < <(instance_envs)
[ "${#ENVS[@]}" -gt 0 ] || fail "Restoran topilmadi — avval install.sh ishga tushiring"
for f in "${ENVS[@]}"; do
  [ -d "$(instance_web "$f")" ] || fail "$(instance_web "$f") topilmadi — install.sh ni qayta ishga tushiring ($(instance_name "$f"))"
done
[ -z "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ] || fail "Repozitoriyda saqlanmagan o'zgarishlar bor: git -C $APP_DIR status"

restart_one() {
  local f="$1" name port
  name="$(instance_name "$f")"; port="$(instance_port "$f")"
  rsync -a --delete "$APP_DIR/frontend/dist/" "$(instance_web "$f")/"
  pm2 restart "$name" --update-env >/dev/null
  for _ in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1 && { log "  ✓ $name ($(instance_domain "$f"))"; return 0; }
    sleep 1
  done
  log "  ✗ $name javob bermayapti (pm2 logs $name)"
  return 1
}

build_and_restart() {
  (cd "$APP_DIR/server"   && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
  (cd "$APP_DIR/frontend" && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)
  local f rc=0
  for f in "${ENVS[@]}"; do restart_one "$f" || rc=1; done
  return "$rc"
}

log "Backup..."
for f in "${ENVS[@]}"; do
  ENV_FILE="$f" "$SCRIPT_DIR/backup.sh" || fail "Backup olinmadi ($(instance_name "$f")) — yangilash to'xtatildi"
done

# Restoranlarga oxirgi o'rnatilgan versiya. Litsenziya serveri o'zini yangilaganda shu papkada git pull
# qiladi — shuning uchun HEAD ga emas, shu faylga qaraymiz (aks holda restoranlar eski kodda qolib ketadi).
DEPLOYED_FILE="$APP_DIR/.deployed-commit"
OLD="$(cat "$DEPLOYED_FILE" 2>/dev/null || true)"
git -C "$APP_DIR" cat-file -e "${OLD:-x}^{commit}" 2>/dev/null || OLD="$(git -C "$APP_DIR" rev-parse HEAD)"
log "Yangi versiya yuklanmoqda..."
git -C "$APP_DIR" pull --ff-only
NEW="$(git -C "$APP_DIR" rev-parse HEAD)"
if [ "$OLD" = "$NEW" ] && [ "${1:-}" != "--force" ]; then
  log "Allaqachon oxirgi versiya ($(git -C "$APP_DIR" rev-parse --short HEAD)). Baribir qayta yig'ish: $0 --force"; exit 0
fi
git -C "$APP_DIR" log --oneline "$OLD..$NEW" | sed 's/^/  /'

log "Yig'ish va qayta ishga tushirish (${#ENVS[@]} ta restoran)..."
if build_and_restart; then
  echo "$NEW" > "$DEPLOYED_FILE"
  log "✅ Yangilandi: $(git -C "$APP_DIR" rev-parse --short "$OLD") → $(git -C "$APP_DIR" rev-parse --short "$NEW")"
else
  log "⚠️  Yangi versiya ishlamadi — oldingisiga qaytarilmoqda..."
  git -C "$APP_DIR" checkout -q "$OLD"
  build_and_restart || fail "Qaytarish ham ishlamadi! pm2 logs"
  git -C "$APP_DIR" checkout -q -   # branchga qaytish (keyingi pull uchun)
  git -C "$APP_DIR" reset -q --hard "$OLD"
  fail "Yangilash bekor qilindi, $(git -C "$APP_DIR" rev-parse --short "$OLD") versiyasi ishlayapti. Sabab: pm2 logs"
fi
