# Litsenziya va oylik obuna (sotuvchi uchun)

Bu hujjat **siz uchun**, ya'ni RestoPro'ni sotuvchi uchun. Undan restoranlar oylik obunani qanday to'lashi va to'lamasa tizim qanday to'xtatilishi tushuniladi.

## Qanday ishlaydi

```
 Sizning litsenziya serveringiz            Restoran serveri (cloud)           Kassa kompyuteri
 ┌──────────────────────────┐   soatiga    ┌──────────────────────┐   sync     ┌──────────────┐
 │ mijozlar, to'lovlar,     │ ◄──1 marta── │ LICENSE_KEY=RP-...   │ ◄───────── │ kalit kerak  │
 │ to'xtatish/faollashtirish│ ──imzoli──►  │ holatni saqlaydi     │ ──imzoli─► │ emas         │
 └──────────────────────────┘    javob     └──────────────────────┘    javob   └──────────────┘
```

- Har bir restoranga alohida **litsenziya kaliti** beriladi (`RP-XXXX-XXXX-XXXX`).
- Restoran serveri soatiga bir marta sizning serveringizdan holatni so'raydi. Javob **raqamli imzolangan** (Ed25519): maxfiy kalit faqat sizda turadi, shuning uchun restoran javobni soxtalashtira olmaydi.
- Kassa holatni cloud orqali oladi. "Faqat lokal" rejimdagi kassa esa to'g'ridan-to'g'ri sizning serveringizdan oladi va bunda kalit kassaning o'zida kiritiladi.

### To'lov kechiksa nima bo'ladi

| Holat | Restoranda nima ko'rinadi | Tizim |
|---|---|---|
| To'langan muddat ichida | — | ishlaydi |
| Muddat tugashiga 5 kun yoki kamroq qoldi | Adminga sariq ogohlantirish: «Obuna N kundan keyin tugaydi. To'lov uchun: telefon» | ishlaydi |
| Muddat o'tdi, muhlat davom etmoqda (standart: 3 kun) | Qizil ogohlantirish: «N kundan keyin tizim to'xtaydi» | ishlaydi |
| Muhlat ham o'tdi | «Obuna muddati tugagan» ekrani | **to'xtaydi** |
| Siz **To'xtatish** tugmasini bosdingiz | «Obuna to'xtatilgan» ekrani | **1 soat ichida to'xtaydi** |
| 14 kundan beri internet yo'q (tekshira olmadi) | «Litsenziyani tekshirib bo'lmadi» ekrani | to'xtaydi, internet ulanishi bilan ochiladi |

- Tizim to'xtaganda **ma'lumotlar o'chirilmaydi**: buyurtmalar, menyu va hisobotlar saqlanib qoladi.
- Siz panelda **To'lov** tugmasini bosgach, restoran ekranidagi «Qayta tekshirish» tugmasi bilan tizim darhol ochiladi. Tugma bosilmasa, 1 soat ichida o'zi ochiladi.

## 1. Litsenziya serverini ishga tushirish (bir marta)

Sizga kichik VPS kerak (1 GB RAM yetadi, oyiga taxminan $5) va domen, masalan `license.sizning-domen.uz`.

```bash
# Ubuntu 22.04/24.04, root
apt update && apt install -y nginx certbot python3-certbot-nginx git
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
npm install -g pm2

git clone https://github.com/bunyodlomg/restopro.git /opt/restopro
cd /opt/restopro/license-server
npm ci --omit=dev
cp .env.example .env
nano .env        # ADMIN_PASSWORD (kamida 10 belgi) va VENDOR_CONTACT (telefoningiz)
pm2 start server.js --name restopro-license && pm2 save && pm2 startup
```

Nginx va HTTPS:

```bash
cat > /etc/nginx/sites-available/license <<'EOF'
server {
    server_name license.sizning-domen.uz;
    location / { proxy_pass http://127.0.0.1:7070; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
}
EOF
ln -s /etc/nginx/sites-available/license /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
certbot --nginx -d license.sizning-domen.uz
```

Endi `https://license.sizning-domen.uz/admin` ni oching. Login: `admin`, parol: `.env` dagi `ADMIN_PASSWORD`.

> **MUHIM: `data/` papkasini zaxiralang.** `data/keys.json` imzo kalitini saqlaydi. U yo'qolsa, barcha restoranlarni yangi kalit bilan qayta sozlashga to'g'ri keladi. `data/db.json` esa mijozlar va to'lovlar ro'yxati. Ikkala faylni ham xavfsiz joyga (Telegram, Google Drive) nusxalab qo'ying.

## 2. Ochiq kalitni loyihaga yozish (bir marta)

1. Admin panel pastidagi **«Ulash ma'lumotlari»** bo'limini oching.
2. U yerdagi matnni `server/license/vendor.json` fayliga yozing:

```json
{
  "licenseUrl": "https://license.sizning-domen.uz",
  "publicKey": "MCowBQYDK2VwAyEA....",
  "contact": "+998 90 123 45 67"
}
```

3. Commit qilib push qiling.
4. Yangi kassa `.exe` GitHub Actions'da avtomatik yig'iladi.

Shundan keyin o'rnatilgan har bir restoran serveri va kassa sizning serveringiz orqali tekshiriladi. `vendor.json` bo'sh bo'lsa, litsenziya tekshiruvi o'chiq turadi; bu ishlab chiqish uchun qulay.

## 3. Yangi restoran ulash

1. Admin panelda **+ Yangi mijoz** tugmasini bosing. Restoran nomi, egasi, telefoni, oylik summa va bepul sinov kunlarini kiriting. Kalit avtomatik yaratiladi va nusxasi olinadi.
2. Restoran serverini o'rnatishda kalitni bering:
   ```bash
   sudo ./deploy/install.sh --domain cafe.example.uz --email siz@example.uz --license-key RP-XXXX-XXXX-XXXX
   ```
   Allaqachon o'rnatilgan serverda `server/.env` ga `LICENSE_KEY=RP-...` qatorini qo'shing va `pm2 restart restopro` qiling.
3. Kassa:
   - **Cloud rejimida** kalit kerak emas, kassa uni serverdan oladi.
   - **Faqat lokal** rejimida sozlash oynasidagi «Litsenziya kaliti» maydoniga kalitni kiriting.

## 4. Har oy: to'lov qabul qilish

Restoran pul to'laganda panelda **To'lov** tugmasini bosing, necha oy ekanini (1, 2, 3, 6, 12) va summani kiriting.

- Muddat hali tugamagan bo'lsa, oylar joriy muddat ustiga qo'shiladi.
- Muddat tugagan bo'lsa, bugundan boshlab hisoblanadi.
- To'xtatilgan mijoz to'lovdan keyin avtomatik faollashadi.

Panel tepasida quyidagilar ko'rinadi:
- oylik daromad;
- 5 kun ichida muddati tugaydiganlar;
- to'lamaganlar;
- to'xtatilganlar.

Ro'yxat to'lov muddati bo'yicha saralangan: eng yaqini tepada turadi.

## 5. To'xtatish

**To'xtatish** tugmasini bosing. Restoran tizimi 1 soat ichida bloklanadi.

- Qayta yoqish uchun **Faollashtirish** yoki **To'lov** tugmasini bosing.
- Mijozni o'chirishdan ko'ra to'xtatgan ma'qul. O'chirilgan kalit imzolangan javob olmaydi, lekin restoran oxirgi saqlangan javob bilan uning muddati (14 kungacha) tugaguncha ishlashda davom etadi.

## Cheklovlar (bilib qo'ying)

- **Server egasi:** model A'da har restoranning o'z serveri bor. Server kodini o'zgartira oladigan dasturchi tekshiruvni olib tashlashi mumkin. Shuning uchun restoran serverlarini o'zingizning VPS hisobingizda saqlash va restoranga faqat ilovaga kirishni berish tavsiya etiladi. Bunda server ham, `.env` ham sizning nazoratingizda bo'ladi.
- **Litsenziya serveringiz ishlamay qolsa:** restoranlar oxirgi javob bilan 14 kungacha ishlayveradi (to'langan muddat doirasida). Serveringizni shu muddatda tiklash kifoya.
- **Kompyuter soati:** soatni orqaga surish yordam bermaydi, chunki tizim ko'rilgan eng katta vaqtni eslab qoladi.
