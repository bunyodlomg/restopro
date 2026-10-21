#!/usr/bin/env bash
# ============================================================
#  RestoPro — restoran serverini (cloud) o'rnatish
#
#  Ubuntu 22.04 / 24.04 yoki Debian 11 / 12, root huquqi bilan:
#    git clone https://github.com/bunyodlomg/restopro.git /opt/restopro   (bir marta)
#    cd /opt/restopro
#    sudo ./deploy/install.sh --license-key RP-XXXX-XXXX-XXXX
#
#  Litsenziya kaliti berilsa — domen va sync kaliti sotuvchi panelidan olinadi
#  (panelda mijozning «Cloud domeni» to'ldirilgan bo'lishi kerak).
#
#  Bir VPS'da bir nechta restoran: har yangi kalit bilan qayta ishga tushiring —
#  har biri alohida jarayon, port, baza, rasmlar, backup va nginx sayti bo'ladi
#  (sozlamalari /etc/restopro/<nom>.env). Kod bitta: update.sh hammasini yangilaydi.
#
#  Parametrlar:
#    --domain D          sayt domeni (DNS shu serverga qaragan bo'lishi kerak)  [panelda bo'lmasa majburiy]
#    --email E           Let's Encrypt (SSL) uchun email (ixtiyoriy)
#    --port P            backend porti (standart: birinchi bo'sh port, 5050 dan)
#    --name N            restoran nomi / pm2 jarayoni (standart: domenning birinchi qismi)
#    --tg-token T        backup'larni Telegram'ga yuborish uchun bot token
#    --tg-chat C         backup'lar boradigan Telegram chat ID
#    --license-key K     sotuvchi bergan litsenziya kaliti (RP-XXXX-XXXX-XXXX)
#    --sync-key S        kassalar ulanish kaliti (odatda paneldan o'zi olinadi)
#    --no-ssl            SSL o'rnatmaslik (faqat test uchun)
#    --no-firewall       ufw'ni sozlamaslik
#
#  Qayta ishga tushirish xavfsiz: mavjud .env qiymatlari saqlanadi.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"
ENV_FILE=""   # quyida aniqlanadi: mavjud restoranniki yoki yangi /etc/restopro/<nom>.env

DOMAIN="" EMAIL="" PORT="" PM2_NAME="" TG_TOKEN="" TG_CHAT="" LICENSE_KEY_ARG="" SYNC_KEY_ARG=""
WITH_SSL=1 WITH_FIREWALL=1
NODE_MAJOR=22
MONGO_SERIES=8.0

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
ok()   { echo -e "    \033[32m✓\033[0m $*"; }
warn() { echo -e "    \033[33m⚠\033[0m $*"; }
fail() { echo -e "\n\033[31m❌ $*\033[0m" >&2; exit 1; }

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)      DOMAIN="${2:-}";   shift 2 ;;
    --email)       EMAIL="${2:-}";    shift 2 ;;
    --port)        PORT="${2:-}";     shift 2 ;;
    --name)        PM2_NAME="${2:-}"; shift 2 ;;
    --tg-token)    TG_TOKEN="${2:-}"; shift 2 ;;
    --tg-chat)     TG_CHAT="${2:-}";  shift 2 ;;
    --license-key) LICENSE_KEY_ARG="$(echo "${2:-}" | tr '[:lower:]' '[:upper:]')"; shift 2 ;;
    --sync-key)    SYNC_KEY_ARG="${2:-}";    shift 2 ;;
    --no-ssl)      WITH_SSL=0;        shift ;;
    --no-firewall) WITH_FIREWALL=0;   shift ;;
    -h|--help)     usage 0 ;;
    *)             echo "Noma'lum parametr: $1"; usage 1 ;;
  esac
done

# ── .env yordamchilari ─────────────────────────────────────────
env_get() { env_val "$ENV_FILE" "$1"; }
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

# Shu VPS'dagi restoran: litsenziya kaliti yoki domeni bo'yicha
find_by_license() {
  local f
  for f in $(instance_envs); do [ "$(env_val "$f" LICENSE_KEY | tr '[:lower:]' '[:upper:]')" = "$1" ] && { echo "$f"; return 0; }; done
  return 0
}
find_by_domain() {
  local f
  for f in $(instance_envs); do [ "$(instance_domain "$f")" = "$1" ] && { echo "$f"; return 0; }; done
  return 0
}
# Port band: boshqa restoran ishlatadi yoki kimdir tinglayapti
port_taken() {
  local f
  for f in $(instance_envs); do [ "$f" != "$ENV_FILE" ] && [ "$(instance_port "$f")" = "$1" ] && return 0; done
  ss -ltnH "sport = :$1" 2>/dev/null | grep -q .
}

# ── 0. Tekshiruvlar ────────────────────────────────────────────
log "Tekshiruvlar"
[ "$(id -u)" -eq 0 ] || fail "Root huquqi kerak: sudo $0 ..."
[ -f "$APP_DIR/server/server.js" ] || fail "Skript RestoPro repozitoriysi ichidan ishga tushirilishi kerak"

# Shu restoran bu VPS'da allaqachon o'rnatilganmi (qayta ishga tushirish — sozlamalari saqlanadi)
[ -z "$LICENSE_KEY_ARG" ] || ENV_FILE="$(find_by_license "$LICENSE_KEY_ARG")"
[ -n "$ENV_FILE" ] || [ -z "$DOMAIN" ] || ENV_FILE="$(find_by_domain "$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')")"
if [ -n "$ENV_FILE" ]; then
  [ -n "$DOMAIN" ] || DOMAIN="$(instance_domain "$ENV_FILE")"
  ok "Mavjud restoran qayta o'rnatiladi: $(instance_name "$ENV_FILE") ($ENV_FILE)"
fi

# Yangi restoran, litsenziya kaliti bilan: domen va sync kaliti sotuvchi panelidan (license-server /api/v1/provision)
if [ -z "$ENV_FILE" ] && [ -n "$LICENSE_KEY_ARG" ] && { [ -z "$DOMAIN" ] || [ -z "$SYNC_KEY_ARG" ]; }; then
  LICENSE_URL="$(sed -n 's/.*"licenseUrl": *"\([^"]*\)".*/\1/p' "$APP_DIR/server/license/vendor.json" 2>/dev/null | sed 's|/*$||')"
  [ -n "$LICENSE_URL" ] || fail "server/license/vendor.json da licenseUrl yo'q — --domain va --sync-key bilan bering"
  PROV_FILE="$(mktemp)"
  PROV_CODE="$(curl -sS -m 20 -o "$PROV_FILE" -w '%{http_code}' -X POST -H 'content-type: application/json' \
    -d "{\"key\":\"$LICENSE_KEY_ARG\"}" "$LICENSE_URL/api/v1/provision")" \
    || fail "Litsenziya serveriga ulanib bo'lmadi: $LICENSE_URL"
  prov_get() { python3 -c "import sys,json; print(json.load(open(sys.argv[1])).get(sys.argv[2]) or '')" "$PROV_FILE" "$1" 2>/dev/null; }
  [ "$PROV_CODE" = 200 ] || fail "Panel javobi ($PROV_CODE): $(prov_get message)"
  [ -n "$DOMAIN" ]       || DOMAIN="$(prov_get domain)"
  [ -n "$SYNC_KEY_ARG" ] || SYNC_KEY_ARG="$(prov_get syncKey)"
  ok "Paneldan olindi: $(prov_get name)${DOMAIN:+ — $DOMAIN}"
  rm -f "$PROV_FILE"
fi
[ -n "$DOMAIN" ] || fail "Domen yo'q: panelda mijozning «Cloud domeni»ni to'ldiring yoki --domain bering"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "Domen noto'g'ri: $DOMAIN"
DOMAIN="$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')"

FRESH_INSTALL=0
if [ -n "$ENV_FILE" ]; then
  PM2_NAME="$(instance_name "$ENV_FILE")"
else
  # Boshqa restoranning domeni bilan yangi restoran o'rnatilmasin (kassalari aralashib ketadi)
  [ -z "$(find_by_domain "$DOMAIN")" ] || fail "$DOMAIN shu VPS'da boshqa restoranga tegishli — panelda boshqa subdomen kiriting"
  # Yangi restoran: nomi domenning birinchi qismidan (itop.example.uz → itop)
  [ -n "$PM2_NAME" ] || PM2_NAME="$(echo "${DOMAIN%%.*}" | tr -c 'a-z0-9_\n-' '-')"
  [[ "$PM2_NAME" =~ ^[A-Za-z0-9_-]+$ ]] || fail "--name faqat harf, raqam, - va _ dan iborat bo'lsin"
  for f in $(instance_envs); do
    [ "$(instance_name "$f")" != "$PM2_NAME" ] || fail "«$PM2_NAME» nomi shu VPS'da band ($(instance_domain "$f")) — --name bilan boshqa nom bering"
  done
  ENV_FILE="$INST_DIR/$PM2_NAME.env"
  FRESH_INSTALL=1
fi
# Port: mavjud restoranniki saqlanadi, yangisiga — birinchi bo'sh port
[ -n "$PORT" ] || [ "$FRESH_INSTALL" = 1 ] || PORT="$(instance_port "$ENV_FILE")"
if [ -z "$PORT" ]; then PORT=5050; while port_taken "$PORT"; do PORT=$((PORT + 1)); done; fi
[[ "$PORT" =~ ^[0-9]+$ ]] || fail "Port son bo'lishi kerak: $PORT"
[ "$FRESH_INSTALL" = 0 ] || ! port_taken "$PORT" || fail "$PORT porti band — --port bilan boshqasini bering"
# shellcheck disable=SC1091
. /etc/os-release
# MongoDB apt manzili: Ubuntu — multiverse, Debian — main (8.0 Debian 12 uchun chiqarilgan)
case "${ID:-}:${VERSION_CODENAME:-}" in
  ubuntu:jammy|ubuntu:noble) MONGO_APT="ubuntu ${VERSION_CODENAME}/mongodb-org/${MONGO_SERIES} multiverse" ;;
  debian:bookworm|debian:trixie) MONGO_APT="debian bookworm/mongodb-org/${MONGO_SERIES} main" ;;
  debian:bullseye) MONGO_SERIES=7.0; MONGO_APT="debian bullseye/mongodb-org/7.0 main" ;;   # 8.0 Debian 11 uchun yo'q
  *) fail "Ubuntu 22.04/24.04 yoki Debian 11/12/13 kerak (topildi: ${PRETTY_NAME:-${ID:-?}})" ;;
esac
ok "${PRETTY_NAME:-$ID $VERSION_ID}, restoran: $PM2_NAME, domen: $DOMAIN, port: $PORT"

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
log "Sozlamalar ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  mkdir -p "$(dirname "$ENV_FILE")"; chmod 700 "$INST_DIR" 2>/dev/null || true
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
if is_legacy "$ENV_FILE"; then
  env_default MONGO_URI "mongodb://127.0.0.1:27017/restopro"
  env_default BACKUP_DIR "/var/backups/restopro"
elif [ "$FRESH_INSTALL" = 1 ]; then
  # Har restoranga o'z bazasi, rasmlari va backup'i (.env.example dagi umumiy qiymatlar EMAS)
  env_set MONGO_URI  "mongodb://127.0.0.1:27017/restopro_$PM2_NAME"
  env_set UPLOAD_DIR "/var/lib/restopro/$PM2_NAME/uploads"
  env_set BACKUP_DIR "/var/backups/restopro-$PM2_NAME"
fi
env_set     PM2_NAME "$PM2_NAME"
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
# VPS'da baza allaqachon ishlayapti (boshqa restoran / loyiha) — unga tegmaymiz: versiyasi
# boshqacha bo'lishi mumkin, ustidan o'rnatish uni buzadi. Faqat backup uchun mongodump kerak.
MONGO_RUNNING=0
ss -ltnH "sport = :27017" 2>/dev/null | grep -q . && MONGO_RUNNING=1
mongo_repo() {
  local keyring="/usr/share/keyrings/mongodb-server-${MONGO_SERIES}.gpg"
  [ -f "$keyring" ] && return 0
  curl -fsSL "https://www.mongodb.org/static/pgp/server-${MONGO_SERIES}.asc" | gpg --dearmor -o "$keyring"
  echo "deb [ arch=amd64,arm64 signed-by=$keyring ] https://repo.mongodb.org/apt/$MONGO_APT" \
    > "/etc/apt/sources.list.d/mongodb-org-${MONGO_SERIES}.list"
  apt-get update -qq
}
if [ "$LOCAL_MONGO" = 1 ] && [ "$MONGO_RUNNING" = 0 ]; then
  # MongoDB 5+ AVX'siz protsessorlarda ishlamaydi (ba'zi arzon VPS'lar)
  grep -qw avx /proc/cpuinfo || fail "Protsessor AVX'ni qo'llab-quvvatlamaydi — MongoDB ishlamaydi. Boshqa VPS tanlang yoki MONGO_URI ga MongoDB Atlas manzilini yozing."
  mongo_repo
  apt-get install -y -qq mongodb-org >/dev/null
  systemctl enable --now mongod >/dev/null
  for _ in $(seq 1 30); do mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break; sleep 1; done
  mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 || fail "mongod ishga tushmadi: journalctl -u mongod"
  ok "mongod ishlayapti (faqat 127.0.0.1 da)"
else
  # Faqat backup asboblari — o'rnatilmasa ham o'rnatish davom etadi (backup ogohlantiradi)
  if ! command -v mongodump >/dev/null; then
    { mongo_repo && apt-get install -y -qq mongodb-database-tools >/dev/null; } \
      || { warn "mongodb-database-tools o'rnatilmadi"; rm -f "/etc/apt/sources.list.d/mongodb-org-${MONGO_SERIES}.list"; }
  fi
  if [ "$LOCAL_MONGO" = 1 ]; then ok "mavjud MongoDB ishlatiladi (o'zgartirilmadi), baza: ${MONGO_URI##*/}"
  else ok "tashqi baza ishlatiladi"; fi
  command -v mongodump >/dev/null && ok "backup uchun mongodump bor" || warn "mongodump o'rnatilmadi — backup ishlamaydi"
fi

# ── 5. Ilovani yig'ish ─────────────────────────────────────────
log "Ilovani yig'ish"
(cd "$APP_DIR/server"   && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
ok "server bog'liqliklari"
(cd "$APP_DIR/frontend" && npm ci --no-audit --no-fund --loglevel=error && RESTOPRO_SAME_ORIGIN=1 npm run build --silent)
WEB_ROOT="$(instance_web "$ENV_FILE")"
mkdir -p "$WEB_ROOT"
rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
ok "frontend → $WEB_ROOT"

# ── 6. pm2 ─────────────────────────────────────────────────────
log "Backend (pm2: $PM2_NAME)"
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env >/dev/null
else
  # Yangi usuldagi restoran o'z .env faylini argument orqali oladi (server/.env o'qilmaydi)
  # shellcheck disable=SC2046
  pm2 start "$APP_DIR/server/server.js" --name "$PM2_NAME" --cwd "$APP_DIR/server" --time -- $(instance_args "$ENV_FILE") >/dev/null
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
# VPS'da boshqa saytlar bor va ufw o'chiq — yoqmaymiz: ularning portlari yopilib qolishi mumkin
if [ "$WITH_FIREWALL" = 1 ] && ! ufw status 2>/dev/null | grep -q "Status: active" \
   && ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -qv "^restopro-"; then
  warn "Firewall o'zgartirilmadi: VPS'da boshqa saytlar bor (ufw o'chiq turibdi)"
  WITH_FIREWALL=0
fi
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
  if [ -n "$EMAIL" ]; then CERT_MAIL=(-m "$EMAIL"); else CERT_MAIL=(--register-unsafely-without-email); fi
  if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos "${CERT_MAIL[@]}" --redirect >/dev/null 2>&1; then
    ok "https://$DOMAIN (avtomatik yangilanadi)"
  else
    warn "SSL olinmadi. DNS A yozuvi shu serverga qaraganini tekshiring, so'ng:"
    warn "  certbot --nginx -d $DOMAIN ${EMAIL:+-m $EMAIL} --agree-tos --redirect"
  fi
fi

# ── 10. Kunlik backup ──────────────────────────────────────────
log "Kunlik backup (03:30)"
chmod +x "$SCRIPT_DIR/backup.sh" "$SCRIPT_DIR/restore.sh" "$SCRIPT_DIR/update.sh" 2>/dev/null || true
# Bitta cron qatori — backup.sh shu VPS'dagi hamma restoranlarni navbat bilan zaxiralaydi
CRON_LINE="30 3 * * * $SCRIPT_DIR/backup.sh >> /var/log/restopro-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "$SCRIPT_DIR/backup.sh" || true; echo "$CRON_LINE" ) | crontab -
if ENV_FILE="$ENV_FILE" "$SCRIPT_DIR/backup.sh" >/dev/null 2>&1; then ok "birinchi backup olindi ($(env_get BACKUP_DIR))"
else warn "birinchi backup muvaffaqiyatsiz: ENV_FILE=$ENV_FILE $SCRIPT_DIR/backup.sh"; fi
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
echo "  🔁 Kassa ulash: litsenziya panelida → restoran → «Kassani ulash» → Ulanish kodi"
echo "  ⚙️  Sozlamalar: $ENV_FILE"
echo "  📋 Loglar:    pm2 logs $PM2_NAME"
echo "  🔄 Yangilash: $SCRIPT_DIR/update.sh   (shu VPS'dagi hamma restoranlar)"
echo "  🗄  Backup:    $SCRIPT_DIR/backup.sh   (tiklash: ENV_FILE=$ENV_FILE $SCRIPT_DIR/restore.sh)"
echo "  ➕ Yana restoran: sudo $SCRIPT_DIR/install.sh --license-key RP-…"
echo "════════════════════════════════════════════════════════"
