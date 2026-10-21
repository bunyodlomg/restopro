#!/usr/bin/env bash
# ============================================================
#  RestoPro — zaxira nusxa (backup)
#
#  MongoDB bazasi + server/uploads (rasmlar, logo, tovushlar)
#  bitta arxivga yig'iladi:  restopro-YYYYMMDD-HHMMSS.tar.gz
#
#  Sozlamalar server/.env faylidan o'qiladi:
#    MONGO_URI                 — majburiy
#    BACKUP_DIR                — arxivlar papkasi (standart: /var/backups/restopro)
#    BACKUP_KEEP               — nechta oxirgi arxiv saqlansin (standart: 14)
#    BACKUP_TELEGRAM_BOT_TOKEN — ixtiyoriy: arxivni Telegram'ga yuborish
#    BACKUP_TELEGRAM_CHAT_ID   — ixtiyoriy: kimga yuborilsin
#
#  Ishlatish:   ./deploy/backup.sh                                  — hamma restoranlar
#               ENV_FILE=/etc/restopro/itop.env ./deploy/backup.sh  — bittasi
#  Cron (har kuni 03:30):
#    30 3 * * * /root/restopro/deploy/backup.sh >> /var/log/restopro-backup.log 2>&1
#
#  Talab: mongodump (MongoDB Database Tools), tar, curl
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# ENV_FILE berilmagan (cron) — shu VPS'dagi hamma restoranlar navbat bilan, har biri o'z papkasiga
if [ -z "${ENV_FILE:-}" ]; then
  # shellcheck source=lib.sh
  . "$SCRIPT_DIR/lib.sh"
  mapfile -t ALL < <(instance_envs)
  [ "${#ALL[@]}" -gt 0 ] || { echo "Restoran topilmadi ($APP_DIR/server/.env yoki $INST_DIR/*.env)" >&2; exit 1; }
  RC=0
  for f in "${ALL[@]}"; do ENV_FILE="$f" "$SCRIPT_DIR/backup.sh" || RC=1; done
  exit "$RC"
fi

log()  { echo "[$(date '+%F %T')] $*"; }
fail() { log "❌ $*"; notify "❌ RestoPro backup xatosi ($(hostname)): $*"; exit 1; }

# .env dan bitta qiymatni o'qish (source qilmasdan — maxsus belgilar xavfsiz)
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  { grep -E "^[[:space:]]*$1=" "$ENV_FILE" || true; } | tail -n1 | cut -d= -f2- \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

MONGO_URI="${MONGO_URI:-$(env_get MONGO_URI)}"
UPLOADS_DIR="$(env_get UPLOAD_DIR)"; UPLOADS_DIR="${UPLOADS_DIR:-$APP_DIR/server/uploads}"
INSTANCE="$(env_get PM2_NAME)"; INSTANCE="${INSTANCE:-restopro}"
BACKUP_DIR="${BACKUP_DIR:-$(env_get BACKUP_DIR)}";  BACKUP_DIR="${BACKUP_DIR:-/var/backups/restopro}"
BACKUP_KEEP="${BACKUP_KEEP:-$(env_get BACKUP_KEEP)}"; BACKUP_KEEP="${BACKUP_KEEP:-14}"
TG_TOKEN="${BACKUP_TELEGRAM_BOT_TOKEN:-$(env_get BACKUP_TELEGRAM_BOT_TOKEN)}"
TG_CHAT="${BACKUP_TELEGRAM_CHAT_ID:-$(env_get BACKUP_TELEGRAM_CHAT_ID)}"
# restore.sh xavfsizlik nusxasi uchun: Telegram'ga yubormaslik
[ "${BACKUP_NO_TELEGRAM:-0}" = 1 ] && TG_TOKEN="" TG_CHAT=""
TG_MAX_BYTES=$((49 * 1024 * 1024))   # Telegram bot fayl chegarasi ~50 MB

notify() {
  [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ] || return 0
  curl -sS -m 30 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" --data-urlencode "text=$1" >/dev/null || true
}

# ── Tekshiruvlar ───────────────────────────────────────────────
[ -n "$MONGO_URI" ] || fail "MONGO_URI topilmadi ($ENV_FILE)"
[[ "$BACKUP_KEEP" =~ ^[0-9]+$ ]] && [ "$BACKUP_KEEP" -ge 1 ] || fail "BACKUP_KEEP musbat son bo'lishi kerak"
command -v mongodump >/dev/null || fail "mongodump o'rnatilmagan (sudo apt install mongodb-database-tools)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Bir vaqtda ikki backup ishlamasin
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { log "Boshqa backup ishlayapti — o'tkazib yuborildi"; exit 0; }

STAMP="$(date '+%Y%m%d-%H%M%S')"
NAME="restopro-$STAMP"
WORK="$(mktemp -d "$BACKUP_DIR/.tmp-XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
umask 077

# ── 1. MongoDB ─────────────────────────────────────────────────
log "[$INSTANCE] MongoDB dump..."
mongodump --uri="$MONGO_URI" --archive="$WORK/db.archive.gz" --gzip --quiet \
  || fail "mongodump muvaffaqiyatsiz"

# ── 2. Yuklangan fayllar ───────────────────────────────────────
if [ -d "$UPLOADS_DIR" ]; then
  log "uploads/ nusxalanmoqda..."
  tar -C "$(dirname "$UPLOADS_DIR")" -czf "$WORK/uploads.tar.gz" "$(basename "$UPLOADS_DIR")" \
    || fail "uploads arxivlanmadi"
fi

# ── 3. Ma'lumot fayli ──────────────────────────────────────────
{
  echo "created=$(date -Iseconds)"
  echo "host=$(hostname)"
  echo "instance=$INSTANCE"
  echo "commit=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
} > "$WORK/meta.txt"

# ── 4. Yakuniy arxiv ───────────────────────────────────────────
ARCHIVE="$BACKUP_DIR/$NAME.tar.gz"
tar -C "$WORK" -cf "$ARCHIVE.part" . || fail "arxiv yaratilmadi"
mv "$ARCHIVE.part" "$ARCHIVE"
SIZE_BYTES=$(stat -c %s "$ARCHIVE")
SIZE_HUMAN=$(du -h "$ARCHIVE" | cut -f1)
log "✅ Tayyor: $ARCHIVE ($SIZE_HUMAN)"

# ── 5. Eski arxivlarni o'chirish (oxirgi BACKUP_KEEP tasi qoladi) ──
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/restopro-*.tar.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))")
for f in "${OLD[@]}"; do rm -f -- "$f"; log "O'chirildi: $(basename "$f")"; done

# ── 6. Telegram'ga yuborish (server buzilsa ham nusxa qolsin) ──
if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ]; then
  CAPTION="🗄 RestoPro backup — $INSTANCE ($(hostname)) — $(date '+%d.%m.%Y %H:%M') — $SIZE_HUMAN"
  if [ "$SIZE_BYTES" -le "$TG_MAX_BYTES" ]; then
    if curl -sS -m 300 -o "$WORK/tg.json" "https://api.telegram.org/bot${TG_TOKEN}/sendDocument" \
         -F "chat_id=${TG_CHAT}" -F "caption=${CAPTION}" -F "document=@${ARCHIVE}" \
       && grep -q '"ok":true' "$WORK/tg.json"; then
      log "📤 Telegram'ga yuborildi"
    else
      log "⚠️  Telegram'ga yuborilmadi: $(cat "$WORK/tg.json" 2>/dev/null || true)"
    fi
  else
    notify "⚠️ RestoPro backup ($(hostname)) ${SIZE_HUMAN} — Telegram uchun juda katta, faqat serverda saqlandi: $ARCHIVE"
    log "⚠️  Arxiv 49 MB dan katta — Telegram'ga yuborilmadi"
  fi
fi
