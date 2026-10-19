# RestoPro — Restoran Boshqaruv Tizimi

## Tarkib
```
restopro/
├── server/          ← Backend (Node.js + Express + MongoDB)
├── frontend/        ← Frontend (React + Vite)
├── desktop/         ← Kassa dasturi (Electron, Windows .exe)
├── terminal/        ← Ofitsant monobloki uchun ilova (PIN bilan kirish, Windows .exe)
├── deploy/          ← O'rnatish, yangilash, backup skriptlari
├── license-server/  ← Litsenziya serveri (sotuvchi uchun: oylik obuna, to'xtatish)
└── docs/            ← Qo'llanma, narxlar, shartnoma namunasi
```

## Hujjatlar
- [Foydalanish qo'llanmasi](docs/QOLLANMA.md) — egasi, ofitsant va kassa uchun
- [Litsenziya va oylik obuna](docs/LITSENZIYA.md) — litsenziya serveri, mijoz ulash, to'lov, to'xtatish
- [Narxlar va xizmat shartlari](docs/NARX.md)
- [Shartnoma namunasi](docs/SHARTNOMA.md)

## Yangi mijoz serveriga o'rnatish (Ubuntu 22.04 / 24.04)
1. VPS oling, domenning DNS **A** yozuvini server IP manziliga yo'naltiring.
2. Serverda (root):
```bash
git clone https://github.com/bunyodlomg/restopro.git /opt/restopro
cd /opt/restopro
./deploy/install.sh --domain cafe.example.uz --email siz@example.uz \
                    --license-key RP-XXXX-XXXX-XXXX \
                    --tg-token <BOT_TOKEN> --tg-chat <CHAT_ID>
```
Litsenziya kaliti litsenziya serveringiz admin panelida yaratiladi ([batafsil](docs/LITSENZIYA.md)).
Skript Node.js 22, MongoDB 8, pm2, nginx, SSL (Let's Encrypt), firewall va kunlik backup'ni
o'rnatadi, `.env` ni xavfsiz kalitlar bilan yaratadi va oxirida admin parolini ko'rsatadi.
Qayta ishga tushirish xavfsiz — mavjud sozlamalar saqlanadi. Barcha parametrlar: `./deploy/install.sh --help`.

> MongoDB 5+ AVX'li protsessor talab qiladi. Ba'zi arzon VPS'larda AVX yo'q — skript buni aniqlab, ogohlantiradi.

Yangilash (backup → pull → build → restart; ishlamasa avtomatik orqaga qaytadi):
```bash
cd /opt/restopro && ./deploy/update.sh
```

## Lokal ishlab chiqish

### 1. Server (Backend)
```bash
cd server
cp .env.example .env
# .env faylda MONGO_URI va JWT_SECRET ni to'ldiring
npm install
npm run dev
```

### 2. Frontend
```bash
cd frontend
cp .env.example .env
# .env faylda VITE_API_URL=http://localhost:5000 bo'lishi kerak
npm install
npm run dev
```

### Birinchi kirish
`server/.env` faylida `JWT_SECRET` majburiy (kamida 32 belgi). U bo'lmasa server ishga tushmaydi:
```bash
openssl rand -hex 32   # natijani JWT_SECRET= ga yozing
```

Birinchi ishga tushishda `admin` foydalanuvchisi yaratiladi:
- `ADMIN_PASSWORD` berilgan bo'lsa, parol shu bo'ladi;
- aks holda tasodifiy parol yaratilib, server konsoliga (`pm2 logs`) bir marta chiqariladi.

Birinchi kirishda parolni almashtirish majburiy.

## Kassa dasturi (Windows, internetsiz ishlaydi)
`desktop/` — Electron ilova. Kassa kompyuterida MongoDB va serverni o'zi ishga tushiradi:
- internet bo'lmasa ham to'liq ishlaydi (buyurtma, yopish, chek, ombor);
- ofitsantlar telefonda restoran Wi-Fi'si orqali `http://<kassa-IP>:5050` ni ochadi
  (manzil tray belgisi menyusida);
- internet bo'lganda cloud server bilan avtomatik sinxronlanadi (ikki tomonlama,
  ziddiyatda oxirgi o'zgarish yutadi). Ekranda **Online / Offline** belgisi ko'rinadi;
- oyna yopilsa trayda ishlashda davom etadi, Windows bilan birga ishga tushadi,
  kuniga bir marta lokal backup oladi.

**Installer yig'ish:** GitHub → Actions → *Kassa (Windows)* → *Run workflow*.
Tayyor `RestoPro Kassa Setup.exe` artifact sifatida yuklab olinadi
(yoki `git tag kassa-v1.0.0 && git push origin kassa-v1.0.0` — Release'ga qo'shiladi).

**Kassani ulash:** cloud serverda `install.sh` oxirida `SYNC_URL` va `SYNC_KEY` ko'rsatiladi.
Kassa birinchi ochilganda shu ikkisi so'raladi. Birinchi ishga tushirishda internet kerak
(menyu, xodimlar, sozlamalar cloud'dan yuklanadi), keyin internetsiz ishlayveradi.

> ⚠️ Ombor qoldig'i: kassa offline paytida taom sotib, xuddi shu vaqtda cloud'dan o'sha
> mahsulot qoldig'i qo'lda o'zgartirilsa, oxirgi o'zgarish yutadi. Ombor kirimini
> kassadan kiritish tavsiya etiladi.

Lokal ishlab chiqish (Linux): `cd desktop && npm install &&
node scripts/prepare.js --platform linux --mongo-dir <mongod papkasi> && npm start`

## Ilovalarni yangilash (avtomatik)
`main` branch'ga har push'da GitHub Actions yangi versiya (`1.0.<run>`) yig'ib, uni **litsenziya serveriga**
yuklaydi (`.github/workflows/desktop.yml`). O'rnatilgan Kassa va Ofitsant ilovalari uni 3 soat ichida o'zi
topadi, fonda yuklaydi va o'rnatadi — faqat amaldagi litsenziyasi bo'lsa. Sozlash: [docs/LITSENZIYA.md](docs/LITSENZIYA.md#6-ilovalarni-yangilash-avtomatik).
Boshqa branch'lar faqat sinov artefakti yig'adi.
Cloud server: `./deploy/update.sh`.

## Zaxira nusxa (backup)
`deploy/backup.sh` MongoDB bazasi va `server/uploads` papkasini bitta arxivga yig'adi:
`restopro-YYYYMMDD-HHMMSS.tar.gz`. Oxirgi `BACKUP_KEEP` ta arxiv saqlanadi, eskilari o'chiriladi.
`BACKUP_TELEGRAM_*` to'ldirilgan bo'lsa, har bir arxiv Telegram'ga yuboriladi (49 MB gacha).
Xato bo'lsa, Telegram'ga ogohlantirish keladi.

`install.sh` buni avtomatik sozlaydi. Qo'lda sozlash:
```bash
sudo apt install mongodb-database-tools    # mongodump / mongorestore
chmod +x deploy/backup.sh deploy/restore.sh
./deploy/backup.sh                         # sinov
# Har kuni 03:30 da avtomatik:
(crontab -l 2>/dev/null; echo "30 3 * * * $PWD/deploy/backup.sh >> /var/log/restopro-backup.log 2>&1") | crontab -
```
`apt` paket topmasa, MongoDB rasmiy repozitoriysini qo'shing yoki
[Database Tools](https://www.mongodb.com/try/download/database-tools) `.deb` faylini o'rnating.

Tiklash:
```bash
./deploy/restore.sh                                  # arxivlar ro'yxati
./deploy/restore.sh /var/backups/restopro/restopro-20260101-033000.tar.gz
```
Tiklashdan oldin joriy holat avtomatik zaxiralanadi. pm2 jarayoni (`PM2_NAME`, standart `restopro`)
tiklash vaqtida to'xtatilib, keyin qayta ishga tushiriladi.

> Telegram'ga kelgan arxivni ham shu buyruq bilan tiklash mumkin: faylni serverga yuklab, yo'lini bering.

## Brend sozlamalari
Restoran nomi, logotipi, asosiy rangi va chek ko'rinishi ilovaning o'zida o'zgartiriladi:
**Sozlama → Brend / Ko'rinish / Chek**. Kodni o'zgartirish shart emas.

## Litsenziya (ishlab chiqishda)
`server/license/vendor.json` bo'sh bo'lsa, litsenziya tekshiruvi o'chiq.
To'ldirilgandan keyin lokal ishlab chiqishda `server/.env` ga `LICENSE_DEV=1` yozing
(`NODE_ENV=production` da bu ishlamaydi).

## Portlar
- Server:   `http://localhost:5000`
- Frontend: `http://localhost:5173`

## Texnologiyalar
- **Backend:**  Node.js, Express, MongoDB, Socket.io, JWT
- **Frontend:** React, Vite, React Router, Socket.io-client
