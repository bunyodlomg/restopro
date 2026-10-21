# ============================================================
#  RestoPro — bir VPS'dagi restoranlar ro'yxati (install.sh, update.sh, backup.sh uchun)
#
#  Har restoran — alohida pm2 jarayoni, port, baza, uploads va nginx sayti; kod bitta (APP_DIR).
#  Sozlamalari: /etc/restopro/<nom>.env. Eski usulda o'rnatilgan birinchi restoran —
#  $APP_DIR/server/.env (pm2 nomi: restopro).
#  Talab: APP_DIR o'rnatilgan bo'lishi kerak.
# ============================================================

INST_DIR="/etc/restopro"

# .env dan bitta qiymat (source qilmasdan — maxsus belgilar xavfsiz):  env_val FAYL KALIT
env_val() {
  [ -f "$1" ] || return 0
  grep -E "^[[:space:]]*$2=" "$1" | tail -n1 | cut -d= -f2- \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Shu VPS'dagi hamma restoranlarning .env fayllari
instance_envs() {
  [ -f "$APP_DIR/server/.env" ] && echo "$APP_DIR/server/.env"
  local f
  for f in "$INST_DIR"/*.env; do [ -f "$f" ] && echo "$f"; done
  return 0
}

is_legacy()       { [ "$1" = "$APP_DIR/server/.env" ]; }
instance_name()   { local n; n="$(env_val "$1" PM2_NAME)"; echo "${n:-restopro}"; }
instance_domain() { env_val "$1" CLIENT_URL | cut -d, -f1 | sed 's|^https\?://||'; }
instance_port()   { local p; p="$(env_val "$1" PORT)"; echo "${p:-5050}"; }
# Frontend papkasi (.env dagi WEB_ROOT — qo'lda o'rnatilgan server uchun)
instance_web()    { local w; w="$(env_val "$1" WEB_ROOT)"; echo "${w:-/var/www/restopro-$(instance_name "$1")}"; }
# pm2 ga beriladigan argument: yangi usuldagi restoran o'z .env faylini o'qisin
instance_args()   { is_legacy "$1" || echo "--env=$1"; }
