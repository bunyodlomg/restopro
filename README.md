# 🍽 RestoPro — Oshxona Boshqaruv Tizimi

## Tarkib
```
restopro-full/
├── server/      ← Backend (Node.js + Express + MongoDB)
└── frontend/    ← Frontend (React + Vite)
```

## Tezkor ishga tushirish

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

## Zaxira nusxa (backup)
`deploy/backup.sh` MongoDB bazasi va `server/uploads` papkasini bitta arxivga yig'adi:
`restopro-YYYYMMDD-HHMMSS.tar.gz`. Oxirgi `BACKUP_KEEP` ta arxiv saqlanadi, eskilari o'chiriladi.
`BACKUP_TELEGRAM_*` to'ldirilgan bo'lsa, har bir arxiv Telegram'ga yuboriladi (49 MB gacha).
Xato bo'lsa, Telegram'ga ogohlantirish keladi.

Serverda bir marta sozlash:
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
`frontend/src/brand.js` faylida:
```js
export const BRAND = {
  name: "Sizning Oshxona Nomi",  // ← o'zgartiring
  logo: "🍽",                     // ← yoki SVG
  primary: "#D4831F",             // ← rang
  apiUrl: "http://localhost:5000",// ← server manzili
}
```

## Portlar
- Server:   `http://localhost:5000`
- Frontend: `http://localhost:5173`

## Texnologiyalar
- **Backend:**  Node.js, Express, MongoDB, Socket.io, JWT
- **Frontend:** React, Vite, React Router, Socket.io-client
