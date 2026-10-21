#!/usr/bin/env bash
# ============================================================
#  RestoPro — yangi serverga to'liq o'rnatish
#
#  Ubuntu 22.04 / 24.04, root huquqi bilan:
#    git clone https://github.com/bunyodlomg/restopro.git /opt/restopro
#    cd /opt/restopro
#    sudo ./deploy/install.sh --domain cafe.example.uz --email siz@example.uz
#
#  Parametrlar:
#    --domain D          sayt domeni (DNS shu serverga qaragan bo'lishi kerak)  [majburiy]
#    --email E           Let's Encrypt (SSL) uchun email                        [SSL uchun majburiy]
#    --port P            backend porti (standart: 5050)
#    --name N            pm2 jarayon nomi (standart: restopro)
#    --tg-token T        backup'larni Telegram'ga yuborish uchun bot token
#    --tg-chat C         backup'lar boradigan Telegram chat ID
#    --license-key K     sotuvchi bergan litsenziya kaliti (RP-XXXX-XXXX-XXXX)
#    --sync-key S        kassalar ulanish kaliti (litsenziya panelidan; bo'lmasa yaratiladi)
#    --no-ssl            SSL o'rnatmaslik (faqat test uchun)
#    --no-firewall       ufw'ni sozlamaslik
#
#  Qayta ishga tushirish xavfsiz: mavjud .env qiymatlari saqlanadi.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$APP_DIR/server/.env"

DOMAIN="" EMAIL="" PORT=5050 PM2_NAME="restopro" TG_TOKEN="" TG_CHAT="" LICENSE_KEY_ARG="" SYNC_KEY_ARG=""
WITH_SSL=1 WITH_FIREWALL=1
NODE_MAJOR=22
MONGO_SERIES=8.0

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
ok()   { echo -e "    \033[32m✓\033[0m $*"; }
warn() { echo -e "    \033[33m⚠\033[0m $*"; }
fail() { echo -e "\n\033[31m❌ $*\033[0m" >&2; exit 1; }

usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)      DOMAIN="${2:-}";   shift 2 ;;
    --email)       EMAIL="${2:-}";    shift 2 ;;
    --port)        PORT="${2:-}";     shift 2 ;;
    --name)        PM2_NAME="${2:-}"; shift 2 ;;
    --tg-token)    TG_TOKEN="${2:-}"; shift 2 ;;
    --tg-chat)     TG_CHAT="${2:-}";  shift 2 ;;
    --license-key) LICENSE_KEY_ARG="${2:-}"; shift 2 ;;
    --sync-key)    SYNC_KEY_ARG="${2:-}";    shift 2 ;;
    --no-ssl)      WITH_SSL=0;        shift ;;
    --no-firewall) WITH_FIREWALL=0;   shift ;;
    -h|--help)     usage 0 ;;
    *)             echo "Noma'lum parametr: $1"; usage 1 ;;
  esac
done

# ── .env yordamchilari ─────────────────────────────────────────
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^[[:space:]]*$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
# Kalit bo'lsa — qiymatini almashtiradi, bo'lmasa — oxiriga qo'shadi
env_set() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  if grep -qE "^[[:space:]]*$key=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $0 ~ "^[[:space:]]*"k"=" {print k"="v; next} {print}' "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"; echo "$key=$val" >> "$tmp"
  fi
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
# Faqat bo'sh bo'lsa o'rnatadi (mavjud qiymat saqlanadi)
env_default() { [ -n "$(env_get "$1")" ] || env_set "$1" "$2"; }

# ── 0. Tekshiruvlar ────────────────────────────────────────────
log "Tekshiruvlar"
[ "$(id -u)" -eq 0 ] || fail "Root huquqi kerak: sudo $0 ..."
[ -n "$DOMAIN" ] || { echo "--domain majburiy"; usage 1; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "Domen noto'g'ri: $DOMAIN"
[[ "$PORT" =~ ^[0-9]+$ ]] || fail "Port son bo'lishi kerak: $PORT"
[[ "$PM2_NAME" =~ ^[A-Za-z0-9_-]+$ ]] || fail "--name faqat harf, raqam, - va _ dan iborat bo'lsin"
[ "$WITH_SSL" = 0 ] || [ -n "$EMAIL" ] || fail "SSL uchun --email kerak (yoki --no-ssl)"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || fail "Faqat Ubuntu qo'llab-quvvatlanadi (topildi: ${ID:-?})"
case "${VERSION_CODENAME:-}" in jammy|noble) ;; *) fail "Ubuntu 22.04 yoki 24.04 kerak (topildi: ${VERSION_ID:-?})";; esac
[ -f "$APP_DIR/server/server.js" ] || fail "Skript RestoPro repozitoriysi ichidan ishga tushirilishi kerak"
ok "Ubuntu $VERSION_ID, domen: $DOMAIN, port: $PORT"

export DEBIAN_FRONTEND=noninteractive

# ── 1. Tizim paketlari ─────────────────────────────────────────
log "Tizim paketlari"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git nginx openssl rsync ufw >/dev/null
[ "$WITH_SSL" = 0 ] || apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
ok "curl, git, nginx, ufw$([ "$WITH_SSL" = 1 ] && echo ", certbot")"

# ── 2. Node.js ─────────────────────────────────────────────────
log "Node.js $NODE_MAJOR"
CUR_NODE="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || true)"
if [ -z "$CUR_NODE" ] || [ "$CUR_NODE" -lt 20 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
ok "node $(node -v)"
command -v pm2 >/dev/null || npm install -g pm2 --silent >/dev/null
ok "pm2 $(pm2 -v 2>/dev/null | tail -n1)"

# ── 3. .env ────────────────────────────────────────────────────
log "Sozlamalar (server/.env)"
FRESH_INSTALL=0
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/server/.env.example" "$ENV_FILE"
  FRESH_INSTALL=1
  ok ".env yaratildi"
else
  ok "mavjud .env ishlatiladi"
fi
chmod 600 "$ENV_FILE"

JWT="$(env_get JWT_SECRET)"
if [ "${#JWT}" -lt 32 ] || [ "$JWT" = "restopro_super_secret_key_2025_change_this" ]; then
  env_set JWT_SECRET "$(openssl rand -hex 32)"
  ok "yangi JWT_SECRET yaratildi"
fi
env_default MONGO_URI "mongodb://127.0.0.1:27017/restopro"
env_set     PORT "$PORT"
env_set     CLIENT_URL "https://$DOMAIN,http://$DOMAIN"
env_set     ALLOW_TUNNELS "false"
env_set     NODE_ENV "production"
[ -z "$LICENSE_KEY_ARG" ] || env_set LICENSE_KEY "$LICENSE_KEY_ARG"
# Litsenziya tizimi sozlangan bo'lsa (vendor.json da ochiq kalit) — kalit majburiy
if grep -q '"publicKey": *"[A-Za-z0-9+/=]\{20,\}"' "$APP_DIR/server/license/vendor.json" 2>/dev/null \
   && [ -z "$(env_get LICENSE_KEY)" ]; then
  fail "Litsenziya kaliti kerak: --license-key RP-XXXX-XXXX-XXXX"
fi
# Kassalar (Electron) ulanishi uchun. Panel bergan kalit — litsenziya panelida ko'rinib turadi
if [ -n "$SYNC_KEY_ARG" ]; then
  [ "${#SYNC_KEY_ARG}" -ge 32 ] || fail "--sync-key kamida 32 belgi bo'lishi kerak"
  env_set SYNC_KEY "$SYNC_KEY_ARG"
fi
env_default SYNC_KEY "$(openssl rand -hex 32)"
env_default BACKUP_DIR "/var/backups/restopro"
env_default BACKUP_KEEP "14"
[ -z "$TG_TOKEN" ] || env_set BACKUP_TELEGRAM_BOT_TOKEN "$TG_TOKEN"
[ -z "$TG_CHAT" ]  || env_set BACKUP_TELEGRAM_CHAT_ID  "$TG_CHAT"

ADMIN_PASSWORD=""
if [ "$FRESH_INSTALL" = 1 ]; then
  ADMIN_PASSWORD="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-12)"
  env_set ADMIN_PASSWORD "$ADMIN_PASSWORD"
fi

MONGO_URI="$(env_get MONGO_URI)"
LOCAL_MONGO=0
[[ "$MONGO_URI" =~ ^mongodb://(127\.0\.0\.1|localhost)(:|/) ]] && LOCAL_MONGO=1

# ── 4. MongoDB ─────────────────────────────────────────────────
log "MongoDB $MONGO_SERIES"
KEYRING="/usr/share/keyrings/mongodb-server-${MONGO_SERIES}.gpg"
if [ ! -f "$KEYRING" ]; then
  curl -fsSL "https://www.mongodb.org/static/pgp/server-${MONGO_SERIES}.asc" | gpg --dearmor -o "$KEYRING"
  echo "deb [ arch=amd64,arm64 signed-by=$KEYRING ] https://repo.mongodb.org/apt/ubuntu ${VERSION_CODENAME}/mongodb-org/${MONGO_SERIES} multiverse" \
    > "/etc/apt/sources.list.d/mongodb-org-${MONGO_SERIES}.list"
  apt-get update -qq
fi
if [ "$LOCAL_MONGO" = 1 ]; then
  # MongoDB 5+ AVX'siz protsessorlarda ishlamaydi (ba'zi arzon VPS'lar)
  grep -qw avx /proc/cpuinfo || fail "Protsessor AVX'ni qo'llab-quvvatlamaydi — MongoDB ishlamaydi. Boshqa VPS tanlang yoki MONGO_URI ga MongoDB Atlas manzilini yozing."
  apt-get install -y -qq mongodb-org >/dev/null
  systemctl enable --now mongod >/dev/null
  for _ in $(seq 1 30); do mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break; sleep 1; done
  mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 || fail "mongod ishga tushmadi: journalctl -u mongod"
  ok "mongod ishlayapti (faqat 127.0.0.1 da)"
else
  apt-get install -y -qq mongodb-database-tools >/dev/null
  ok "tashqi baza ishlatiladi; backup uchun mongodump o'rnatildi"
fi

# ── 5. Ilovani yig'ish ─────────────────────────────────────────
log "Ilovani yig'ish"
(cd "$APP_DIR/server"   && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
ok "server bog'liqliklari"
(cd "$APP_DIR/frontend" && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)
WEB_ROOT="/var/www/restopro-$PM2_NAME"
mkdir -p "$WEB_ROOT"
rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
ok "frontend → $WEB_ROOT"

# ── 6. pm2 ─────────────────────────────────────────────────────
log "Backend (pm2: $PM2_NAME)"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env >/dev/null
else
  pm2 start "$APP_DIR/server/server.js" --name "$PM2_NAME" --cwd "$APP_DIR/server" --time >/dev/null
fi
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
HEALTHY=0
for _ in $(seq 1 20); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && { HEALTHY=1; break; }
  sleep 1
done
[ "$HEALTHY" = 1 ] || fail "Backend javob bermayapti. Loglar: pm2 logs $PM2_NAME --lines 50"
ok "backend javob beryapti (http://127.0.0.1:$PORT/health)"

# Admin yaratildi — parolni .env da ochiq qoldirmaymiz
[ -z "$ADMIN_PASSWORD" ] || env_set ADMIN_PASSWORD ""

# ── 7. nginx ───────────────────────────────────────────────────
log "nginx"
SITE="/etc/nginx/sites-available/restopro-$PM2_NAME.conf"
sed -e "s|{{DOMAIN}}|$DOMAIN|g" -e "s|{{WEB_ROOT}}|$WEB_ROOT|g" -e "s|{{PORT}}|$PORT|g" \
  "$SCRIPT_DIR/nginx.conf.template" > "$SITE.new"
# certbot qo'shgan SSL qatorlari qayta o'rnatishda yo'qolmasin
if [ -f "$SITE" ] && grep -q "managed by Certbot" "$SITE"; then
  rm -f "$SITE.new"
  ok "mavjud (SSL'li) konfiguratsiya saqlandi"
else
  mv "$SITE.new" "$SITE"
fi
ln -sf "$SITE" "/etc/nginx/sites-enabled/restopro-$PM2_NAME.conf"
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || { nginx -t; fail "nginx konfiguratsiyasida xato"; }
systemctl enable --now nginx >/dev/null
systemctl reload nginx
ok "http://$DOMAIN"

# ── 8. Firewall ────────────────────────────────────────────────
if [ "$WITH_FIREWALL" = 1 ]; then
  log "Firewall (ufw)"
  SSH_PORTS="$(sshd -T 2>/dev/null | awk '/^port /{print $2}' || true)"
  if [ -z "$SSH_PORTS" ]; then
    warn "SSH porti aniqlanmadi — ufw yoqilmadi (o'zingizni bloklamaslik uchun)"
  else
    for p in $SSH_PORTS; do ufw allow "$p/tcp" >/dev/null; done
    ufw allow 'Nginx Full' >/dev/null
    ufw --force enable >/dev/null
    ok "ochiq: SSH ($SSH_PORTS), 80, 443. MongoDB va backend porti tashqaridan yopiq"
  fi
fi

# ── 9. SSL ─────────────────────────────────────────────────────
if [ "$WITH_SSL" = 1 ]; then
  log "SSL (Let's Encrypt)"
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect >/dev/null 2>&1; then
    ok "https://$DOMAIN (avtomatik yangilanadi)"
  else
    warn "SSL olinmadi. DNS A yozuvi shu serverga qaraganini tekshiring, so'ng:"
    warn "  certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos --redirect"
  fi
fi

# ── 10. Kunlik backup ──────────────────────────────────────────
log "Kunlik backup (03:30)"
chmod +x "$SCRIPT_DIR/backup.sh" "$SCRIPT_DIR/restore.sh" "$SCRIPT_DIR/update.sh" 2>/dev/null || true
CRON_LINE="30 3 * * * $SCRIPT_DIR/backup.sh >> /var/log/restopro-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "$SCRIPT_DIR/backup.sh" || true; echo "$CRON_LINE" ) | crontab -
if "$SCRIPT_DIR/backup.sh" >/dev/null 2>&1; then ok "birinchi backup olindi"; else warn "birinchi backup muvaffaqiyatsiz: $SCRIPT_DIR/backup.sh"; fi
[ -n "$(env_get BACKUP_TELEGRAM_BOT_TOKEN)" ] || warn "Telegram sozlanmagan — backup faqat shu serverda saqlanadi (--tg-token / --tg-chat)"

# ── Yakun ──────────────────────────────────────────────────────
SCHEME="http"; [ "$WITH_SSL" = 1 ] && grep -q "managed by Certbot" "$SITE" 2>/dev/null && SCHEME="https"
echo
echo "════════════════════════════════════════════════════════"
echo "  ✅ RestoPro o'rnatildi:  $SCHEME://$DOMAIN"
if [ -n "$ADMIN_PASSWORD" ]; then
  echo "  👤 Login: admin    Parol: $ADMIN_PASSWORD"
  echo "     (birinchi kirishda parolni almashtirish so'raladi)"
fi
[ -z "$(env_get LICENSE_KEY)" ] || echo "  🔑 Litsenziya: $(env_get LICENSE_KEY)   (holat: pm2 logs $PM2_NAME | grep Litsenziya)"
echo "  🔁 Kassa ulash: SYNC_URL=$SCHEME://$DOMAIN  SYNC_KEY=$(env_get SYNC_KEY)"
echo "  📋 Loglar:    pm2 logs $PM2_NAME"
echo "  🔄 Yangilash: $SCRIPT_DIR/update.sh"
echo "  🗄  Backup:    $SCRIPT_DIR/backup.sh   (tiklash: restore.sh)"
echo "════════════════════════════════════════════════════════"
