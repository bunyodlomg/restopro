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
| Muhlat ham o'tdi | Yumshoq blokda — qizil banner; to'liq blokda — «Obuna muddati tugagan» ekrani | **to'xtaydi** (bloklash turiga qarab) |
| Siz **To'xtatish** tugmasini bosdingiz | Yumshoq blokda — qizil banner; to'liq blokda — «Obuna to'xtatilgan» ekrani | **bir necha soniyada** |
| N kundan beri internet yo'q (standart: 3 kun, mijozga alohida sozlanadi) | «Litsenziyani tekshirib bo'lmadi» ekrani | to'xtaydi, internet ulanishi bilan ochiladi |

**Bloklash turi** (to'xtatishda tanlanadi, mijoz oynasida o'zgartiriladi):
- **Yumshoq** (standart) — yangi buyurtma ochilmaydi, sozlamalarni o'zgartirib bo'lmaydi. Lekin ochiq hisoblarni yopish, chek chiqarish, hisobotlarni ko'rish ishlaydi: mehmonlar xizmatining o'rtasida to'xtatsangiz ham ochiq stollar yopiladi.
- **To'liq** — tizim butunlay yopiladi, faqat to'lov ekrani ko'rinadi.

- Tizim to'xtaganda **ma'lumotlar o'chirilmaydi**: buyurtmalar, menyu va hisobotlar saqlanib qoladi.
- Siz panelda **To'lov** yoki **Faollashtirish** tugmasini bosgach, restoran bir necha soniyada o'zi ochiladi.
- Kassa holatni cloud orqali oladi. Restoranning cloud serveri ishlamay qolsa, kassa litsenziya serveringizga to'g'ridan-to'g'ri murojaat qiladi. Shunda to'lagan restoran cloud nosozligi tufayli bloklanmaydi, to'xtatish ham kassaga baribir yetib boradi.

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
nano .env        # ADMIN_PASSWORD (kamida 10 belgi), VENDOR_CONTACT (telefoningiz),
                 # UPDATE_UPLOAD_TOKEN (openssl rand -hex 32 — ilova yangilanishlari uchun)
pm2 start server.js --name restopro-license && pm2 save && pm2 startup
```

Nginx va HTTPS:

```bash
cat > /etc/nginx/sites-available/license <<'EOF'
server {
    server_name license.sizning-domen.uz;
    client_max_body_size 400M;      # ilova yangilanishlari (.exe) yuklanadi
    location / { proxy_pass http://127.0.0.1:7070; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_request_buffering off; }
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

**To'xtatish** tugmasini bosing, bloklash turini (yumshoq / to'liq) tanlang va sababini yozing. Restoran bir necha soniyada bloklanadi; internetsiz bo'lsa, internetga ulanishi bilan bloklanadi.

- Qayta yoqish uchun **Faollashtirish** yoki **To'lov** tugmasini bosing.
- Mijozni o'chirishdan ko'ra to'xtatgan ma'qul: o'chirilgan mijozning tarixi ham yo'qoladi.
- Barcha amallar (to'lov, to'xtatish, faollashtirish, server biriktirish/ajratish) mijoz oynasidagi **Amallar tarixi**da qoladi.

### Kassalarni boshqarish va kuzatish

Mijoz oynasidagi **Qurilmalar** ro'yxatida har bir kassa uchun quyidagilar ko'rinadi:
- sync holati: oxirgi sinxronlash vaqti, cloud'ga yetmagan o'zgarishlar, ikki tomonda o'zgarib birlashtirilgan yozuvlar;
- muammolar (sariq ⚠): o'zgarishlar 10 daqiqadan beri cloud'ga yetmayapti, sinxronlanmagan yozuvlar bor yoki kompyuter soati noto'g'ri. Muammo bo'lsa, mijozlar ro'yxatida ham «⚠ N ta muammo» chiqadi.

Kassa ostidagi amallar:
- **bloklash / ochish** — faqat shu kompyuter bloklanadi, restoranning qolgan qurilmalari ishlayveradi;
- **qayta sinxronlash** — kassa cloud'dagi hamma ma'lumotni qaytadan oladi (kassada nimadir mos kelmasa ishlating);
- **qayta ishga tushirish** — kassa serveri qayta ochiladi (~10 soniya). Cloud server uchun ham shu amal bor.

Buyruq restoran online bo'lsa bir necha soniyada, offline bo'lsa internetga ulanishi bilan bajariladi (7 kun ichida).

### Telefon va ofitsant terminallarini boshqarish

Mijoz oynasidagi **Ekranlar** ro'yxatida restoranga oxirgi 30 kunda ulangan barcha qurilmalar ko'rinadi: telefonlar, ofitsant terminallari va kassa oynalari. Har birida ilova turi, kim kirgani, brauzer yoki tizim, qaysi serverga ulangani va qachon ko'ringani bor.
- **bloklash** — shu qurilma kira olmaydi, ochiq ekrani esa darhol yopiladi. Ekranda «Bu qurilma bloklangan» yozuvi va Qurilma ID chiqadi. Restoranning boshqa qurilmalari ishlayveradi.
- **ochish** — qurilma qaytadan ishlaydi (ekrandagi «Qayta tekshirish» tugmasi bilan).

Qurilma ID brauzerga bog'langan. Telefon brauzer ma'lumotlari tozalansa, yangi ID oladi va ro'yxatda yangi qurilma bo'lib chiqadi.

### Sinxronlash ziddiyatlari

Ba'zan kassa va cloud bir-biridan bexabar bir xil login yoki bir xil raqamli stol yaratadi. Bunday holatda tizim ziddiyatni o'zi hal qiladi:
- avval yaratilgani o'zgarishsiz qoladi;
- kassadagisi qayta nomlanadi: login `ali` bo'lsa `ali-2`, stol raqami bo'lsa shu bo'limdagi keyingi bo'sh raqam beriladi.

Restoran adminining ekranida nima o'zgargani haqida xabar chiqadi. Bunda hech qanday yozuv yo'qolmaydi. Kassa yozib ololmagan yozuvlar saqlab qo'yiladi va keyingi sinxronlashda qayta uriniladi. Ularning soni kassa holatida «N ta yozuv sinxronlanmadi» deb ko'rinadi.

### Restoranga xabar

Mijoz oynasidagi **Restoranga xabar** bo'limiga matn yozib, **Yuborish** tugmasini bosing. Xabar restoran adminlari ekranida banner bo'lib chiqadi. Masalan: «25-oktabr 02:00 da yangilanish», «To'lov eslatmasi». Xabarni olib tashlash uchun matnni o'chirib, yana yuboring.

### Bitta serverni ajratish

Restoran yangi kompyuterga ko'chdi yoki ruxsatsiz nusxa paydo bo'ldi. Bunday holatda mijoz oynasidagi **Qurilmalar** ro'yxatida o'sha server yonidagi **ajratish** havolasini bosing. Natija:
- server shu zahoti bloklanadi va «Ulanmagan serverlar» ro'yxatiga tushadi (kerak bo'lsa qayta biriktirasiz);
- restoranning boshqa serverlari ishlashda davom etadi.

## Litsenziya serverining o'zini yangilash (avtomatik)

`license-server/` o'zgargan commit `main`ga push qilinsa, GitHub Actions («Litsenziya serveri» workflow) serverga «yangilan» buyrug'ini beradi. Shundan keyin server o'zi quyidagilarni bajaradi:
1. `data/` zaxirasini oladi (`~/restopro-license-backups/`, oxirgi 30 tasi saqlanadi);
2. `git pull` qiladi;
3. kerak bo'lsa `npm ci` qiladi;
4. qayta ishga tushadi va ishlayotganini tekshiradi.

Yangi versiya ishga tushmasa, oldingi versiyaga **o'zi qaytadi**. Natija GitHub Actions'da va admin paneldagi «Litsenziya serveri» kartasida ko'rinadi. O'sha kartadagi **Yangilash** tugmasi bilan qo'lda ham yangilash mumkin.

Yangi sir kerak emas: kassa yangilanishlari uchun qo'shilgan `LICENSE_SERVER_URL` va `UPDATE_UPLOAD_TOKEN` ishlatiladi.

Server bu imkoniyat qo'shilgan versiyadan eskiroq bo'lsa, **bir marta** qo'lda yangilang. Keyin hammasi avtomatik bo'ladi:
```bash
cd /opt/restopro && git pull && pm2 restart restopro-license
```
Qo'lda yangilashning to'liq varianti (zaxira va ortga qaytarish bilan): `/opt/restopro/deploy/update-license.sh`.

## 6. Ilovalarni yangilash (avtomatik)

Kassa va Ofitsant ilovalari yangi versiyani **sizning litsenziya serveringizdan** oladi.
Repozitoriy yopiq (private) bo'lsa ham ishlaydi. Yuklab olish faqat amaldagi litsenziyasi bor
restoranlarga ruxsat etiladi.

```
 main'ga push → GitHub Actions .exe yig'adi → litsenziya serveriga yuklaydi (/api/v1/updates)
                                                         │
 Kassa / Ofitsant ilovasi ← 30 daqiqada tekshiradi ← restoran serveri beradigan imzoli ruxsatnoma
```

**Bir martalik sozlash:**
1. Litsenziya serverining `.env` fayliga `UPDATE_UPLOAD_TOKEN=` qo'shing (`openssl rand -hex 32`), `pm2 restart restopro-license`.
2. GitHub → repozitoriy → **Settings → Secrets and variables → Actions → New repository secret**:
   - `LICENSE_SERVER_URL` = `https://license.sizning-domen.uz`
   - `UPDATE_UPLOAD_TOKEN` = 1-qadamdagi qiymat
3. Nginx'da `client_max_body_size 400M;` bo'lsin (yuqoridagi namunada bor).

Shundan keyin `main` ga har push'da yangi versiya (`1.0.N`) avtomatik yuklanadi. Admin panel pastidagi
**«Ilovalar yangilanishi»** blokida hozirgi versiyalar ko'rinadi. Eski versiyalar fayllari avtomatik o'chiriladi.

Restoranda: kassada adminga «Yangi versiya tayyor — Hozir yangilash» chiqadi (yoki dastur yopilganda o'zi
o'rnatiladi); ofitsant monobloki PIN ekranida o'zi yangilanadi.

**Darhol yangilash:** mijoz oynasidagi «Ekranlar» yonida **ilovalarni hozir yangilash** tugmasi bor (bitta restoran uchun). «Ilovalar yangilanishi» blokida esa **Hamma restoranlarda hozir tekshirish** tugmasi bor. Har bir ekranning versiyasi «Ekranlar» ro'yxatida ko'rinadi: eskirgan versiya ⚠ bilan belgilanadi, yangilanishda xato bo'lsa, sababi ham yoziladi.

**Windows ruxsati so'ralmaydi.** Ilovalar foydalanuvchi papkasiga (`%LOCALAPPDATA%\Programs`) o'rnatiladi, shuning uchun yangilanishga administrator ruxsati kerak emas. Avval `Program Files`ga o'rnatilgan kompyuterlarda jarayon bunday:
1. shu versiyaga yangilanish oxirgi marta ruxsat so'raydi;
2. so'ng dastur «Yangilanishlarni ruxsatsiz qilish»ni taklif qiladi. **Hozir** bosilsa, dastur o'zi yangi papkaga ko'chadi. Eski nusxani o'chirish uchun bir marta ruxsat so'raydi; rad etilsa ham dastur ishlashda davom etadi. Ma'lumotlar o'chmaydi.

Muammo bo'lsa, logga qarang: `%APPDATA%\RestoPro Kassa\migrate.log` (ofitsant ilovasida `RestoPro Ofitsant`).

Kassa yangi kompyuterga o'rnatilganda telefonlar ulanishi uchun Firewall bir marta ruxsat so'raydi (5050-port).

### Repozitoriyni yopiq (private) qilish
GitHub → repozitoriy → **Settings → General → Danger Zone → Change repository visibility → Make private**.

- Yopiq repozitoriyda GitHub Actions bepul tarifda oyiga 2000 daqiqa beradi; Windows yig'ishlari 2 baravar
  hisoblanadi (bir push ≈ 15–20 daqiqa), ya'ni oyiga ~100 ta yangi versiya bemalol sig'adi.
- Serverga `git clone` qilish uchun endi kirish kerak bo'ladi: GitHub → Settings → Developer settings →
  **Fine-grained token** (faqat shu repo, Contents: Read-only) yarating va
  `git clone https://<TOKEN>@github.com/bunyodlomg/restopro.git /opt/restopro` qiling.

## Cheklovlar (bilib qo'ying)

- **Dastur kodi:** `.exe` ichida JavaScript kod bor — tajribali dasturchi uni ochib ko'rishi mumkin.
  Repozitoriyni yopiq qilish kodni ochiq internetdan olib tashlaydi, lekin to'liq himoya emas.
- **Server egasi:** model A'da har restoranning o'z serveri bor. Server kodini o'zgartira oladigan dasturchi tekshiruvni olib tashlashi mumkin. Shuning uchun restoran serverlarini o'zingizning VPS hisobingizda saqlash va restoranga faqat ilovaga kirishni berish tavsiya etiladi. Bunda server ham, `.env` ham sizning nazoratingizda bo'ladi.
- **Litsenziya serveringiz ishlamay qolsa:** restoranlar oxirgi javob bilan 14 kungacha ishlayveradi (to'langan muddat doirasida). Serveringizni shu muddatda tiklash kifoya.
- **Kompyuter soati:** soatni orqaga surish yordam bermaydi, chunki tizim ko'rilgan eng katta vaqtni eslab qoladi.
