# RestoPro — foydalanish qo'llanmasi

Qo'llanma uch qismdan iborat: **egasi / administrator**, **ofitsant** va **kassa kompyuteri**.

---

## Tizimga kirish

1. Brauzerda restoran manzilini oching (masalan, `https://cafe.example.uz`). Kassa kompyuterida esa ish stolidagi **RestoPro Kassa** belgisini bosing.
2. Login va parolni kiriting.
3. Birinchi kirishda tizim **parolni almashtirishni** so'raydi. Yangi parol kamida 6 belgidan iborat bo'lsin.

Parolni keyinroq ham o'zgartirish mumkin: chap menyu pastidagi doira (ismingiz bosh harflari) → **Parolni o'zgartirish**.

**Yorug' / qorong'u rejim:** o'sha menyuda yoki ofitsant ekranining tepasidagi oy/quyosh belgisi orqali almashtiriladi.

---

## 1. Egasi va administrator

Chap menyudagi bo'limlar:

### Bosh
Tanlangan davr bo'yicha umumiy ko'rinish:
- tushum, buyurtmalar soni, o'rtacha chek, sof foyda;
- tushum va chiqim grafigi;
- eng ko'p sotilgan taomlar;
- hozir ochiq stollar;
- omborda kam qolgan mahsulotlar.

Davrni yuqoridagi **Bugun / 7 kun / 30 kun / Bu oy** tugmalari yoki **Davr** (kalendar) orqali tanlang.

### Buyurtma (faol buyurtmalar)
Ochiq buyurtmalarning hammasi shu yerda turadi. Ofitsant yangi buyurtma yuborsa, u darhol paydo bo'ladi. Ovoz yoqilgan bo'lsa, signal ham chalinadi.

- **Chek belgisi** — mijozga chek chiqaradi.
- **To'landi — yopish** — mijoz to'lagach bosiladi. Buyurtma yopiladi, stol bo'shaydi, taomlar retsepti bo'yicha mahsulotlar ombordan ayiriladi.
- **Bekor** — buyurtmani bekor qiladi (tasdiqlash so'raladi).

Buyurtmani faqat administrator yopishi yoki bekor qilishi mumkin.

Ekran tepasidagi sariq **«Mijozlar buyurtmasi»** bloki — mijozlar stoldagi QR kod orqali yuborgan buyurtmalar (pastdagi «QR menyu» bo'limiga qarang).

### Kassa
Administrator ham shu yerdan buyurtma qabul qiladi: stolni tanlaydi, taomlarni qo'shadi, **Oshxonaga yuborish** ni bosadi. Chap menyu doim ko'rinib turadi, shuning uchun istalgan bo'limga bir bosishda qaytish mumkin.

### Bron
Mijoz telefon qilib stol yoki xona bron qilganda:
1. **+ Yangi bron** — mijoz ismi, telefoni, stol/xona, sana, vaqt, necha soatga, mehmonlar soni, oldindan to'lov va izoh.
2. Bir stolga bir vaqtda ikki bron qo'yib bo'lmaydi — tizim ogohlantiradi.
3. Mijoz kelganda **Keldi**, kelmasa **Kelmadi** tugmasini bosing.

Bron qilingan stol **Stollar** ekranida sariq rangda «BRON · 19:00» deb ko'rinadi — ofitsant uni boshqa mijozga bermaydi.

### QR menyu
Mijoz stoldagi QR kodni telefoni bilan skanerlaydi, menyu va narxlarni ko'radi va buyurtma beradi. Stol raqami QR koddan avtomatik aniqlanadi.
1. **Stollar → QR kodlar** — QR menyuni yoqing va **Chop etish** tugmasi bilan har stol uchun QR kodlarni chop eting.
2. Buyurtma **faqat restoran Wi-Fi'iga ulangan** telefondan qabul qilinadi.
3. Mijoz buyurtmasi darhol oshxonaga bormaydi: ofitsant yoki admin ekranida sariq blokda chiqadi (ovozli signal bilan). **Qabul qilish** bosilsa — stol buyurtmasiga qo'shiladi, **✕** — rad etiladi. Mijoz telefonida natija ko'rinadi.
4. Kassa kompyuteriga routerda **doimiy IP** biriktiring — aks holda manzil o'zgarib, QR kodlar ishlamay qolishi mumkin.
5. Cloud server orqali ishlatilsa: **Sozlama → QR menyu** bo'limida restoran Wi-Fi'ining tashqi IP manzilini qo'shing.

### Tarix
Yopilgan va bekor qilingan buyurtmalar.
- Sana bo'yicha filtr va qidiruv (stol yoki ofitsant) bor.
- Buyurtmani ochib tarkibini ko'rish mumkin.
- **Chekni qayta chiqarish** — o'sha buyurtma chekini yana chop etadi.

### Taomlar (menyu)
1. **+ Yangi taom** tugmasini bosing. Nom, narx va kategoriyani kiriting, masalan «Milliy taomlar».
2. **Rasm** yuklang. Rasmli kartalar ofitsantga taomni tezroq topishga yordam beradi.
3. **Retsept** (ixtiyoriy) — bir porsiyaga ketadigan mahsulotlar, masalan guruch 150 g, go'sht 100 g. Buyurtma yopilganda shu miqdorlar ombordan avtomatik ayiriladi.
4. Taomni vaqtincha sotuvdan olish uchun uni **nofaol** qiling. U ofitsant menyusida ko'rinmay qoladi.

### Ombor
Mahsulotlar qoldig'i ro'yxati.
- **Minimum chegara** — qoldiq shundan kamaysa, mahsulot «Kam» deb belgilanadi va Bosh sahifada ko'rinadi.
- Yangi mahsulot kelganda miqdorni tahrirlash orqali qoldiqni yangilang.

### Stollar
Zal, xona va ko'cha bo'yicha stollar.
- **Yangi stol** kartasi keyingi raqamli stolni bir bosishda qo'shadi.
- Band stolni o'chirib bo'lmaydi.

### Xodimlar
Ofitsant yoki administrator qo'shish: ism, login, parol, rol, oylik maosh va **PIN** (monoblokda kirish uchun 4 raqam).
- **Umumiy kalit** (sahifa tepasida) — barcha ofitsantlar kirishini bitta tugma bilan o'chiradi. Ular darhol tizimdan chiqariladi va qayta kira olmaydi; adminlar ishlayveradi. Masalan, ish tugagach yoki tushunmovchilik bo'lganda.
- **Kirish** ustunidagi kalit — bitta xodimni alohida o'chirish/yoqish.
- Xodim ishdan ketsa — uning kirishini darhol o'chiring. Shundan keyin u hech qanday qurilmadan buyurtma bera olmaydi.

### Ish haqi
Oy tanlanadi va har bir xodim bo'yicha qancha to'langani va qancha qolgani ko'rinadi.
- **To'lov qo'shish** — avans yoki oylik berilganini yozib qo'yadi.
- Ish haqi to'lovlari Bosh sahifadagi **chiqim** ga qo'shiladi.

### Sozlama
- **Brend** — restoran nomi va logotipi. Logo kirish sahifasida, menyuda va chekda chiqadi.
- **Ko'rinish** — yorug' yoki qorong'u rejim va asosiy rang.
- **Tovush** — tugma ovozlari va yangi buyurtma signali (o'z MP3 faylingizni yuklash mumkin).
- **Xizmat haqi** — foizni yoqish/o'chirish. Zal, xona va ko'cha buyurtmalariga qo'shiladi, soboyga qo'shilmaydi.
- **Chek** — yuqori va pastki matn, logo, ofitsant ismi, sana, qog'oz eni (58 yoki 80 mm) va shrift o'lchami. O'ng tomonda namuna ko'rinadi.

### Obuna haqida ogohlantirish
- Oylik to'lov muddati yaqinlashsa, ekran pastida sariq ogohlantirish chiqadi.
- Muddat o'tsa, ogohlantirish qizil rangga o'tadi.
- To'lov qilinmasa, tizim to'xtaydi, lekin ma'lumotlar saqlanib qoladi. To'lovdan keyin **Qayta tekshirish** tugmasini bosing.

---

## 2. Ofitsant

### Monoblokda PIN bilan kirish
Restorandagi umumiy monoblokda (**RestoPro Ofitsant** ilovasi) har bir ofitsant o'zining **4 raqamli PIN kodi** bilan kiradi.
- Buyurtma yuborilgach tizim avtomatik chiqadi va keyingi ofitsant o'z PIN'i bilan kiradi.
- 2 daqiqa hech narsa bosilmasa ham avtomatik chiqadi.
- PIN faqat restoran tarmog'ida ishlaydi. 5 marta noto'g'ri kiritilsa, 5 daqiqaga bloklanadi.

### Telefondan kirish
1. Telefonni restoran **Wi-Fi**'iga ulang.
2. Brauzerda administrator bergan manzilni oching (masalan, `http://192.168.1.10:5050` yoki `https://cafe.example.uz`).
3. Login va parolni kiriting.

Maslahat: brauzer menyusidan **«Bosh ekranga qo'shish»** ni tanlang, shunda RestoPro oddiy ilova kabi ochiladi.

### Buyurtma qabul qilish
1. **Stollar** ekranida bo'lim (Zal, Xona, Ko'cha) va stolni tanlang.
   - Oq karta — bo'sh stol.
   - Qora karta — band stol: summa, qancha vaqtdan beri ochiqligi va ofitsant ko'rinadi.
2. Taom kartasini bosing — u buyurtmaga qo'shiladi. Har bosishda soni bittaga oshadi. Kartadagi **−** tugmasi sonini kamaytiradi.
3. Yuqoridagi kategoriyalar orqali menyuni almashtiring yoki **Qidirish** dan foydalaning.
4. **Izoh** — oshpaz uchun eslatma, masalan «achchiq bo'lmasin».
5. **Oshxonaga yuborish** tugmasini bosing.

Telefonda chek pastdagi **«Chekni ko'rish»** paneli orqali ochiladi.

### Band stolga qo'shimcha
Band stolni tanlang. Chekda avval yuborilgan taomlar **«Oshxonada»** bo'limida ko'rinadi. Yangi taomlarni tanlab yana **Oshxonaga yuborish** ni bosing — ular o'sha buyurtmaga qo'shiladi.

### Soboy (olib ketish)
Stollar ekranidagi qizil **Soboy buyurtma** tugmasini bosing. Har bir soboy buyurtmaga raqam avtomatik beriladi.

### Mening buyurtmalarim
Bugungi buyurtmalaringiz: faol va yopilganlar. Administrator buyurtmani yopganda telefoningizda signal chalinadi.

---

## 3. Kassa kompyuteri (Windows)

### Birinchi o'rnatish
1. `RestoPro-Kassa-Setup.exe` ni ishga tushiring. Windows ogohlantirsa: **Batafsil → Baribir ishga tushirish**.
2. Sozlash oynasida rejimni tanlang:
   - **Cloud bilan** — server manzili va sync kalitini kiriting (o'rnatuvchi beradi).
   - **Faqat lokal** — litsenziya kalitini kiriting.
3. **Saqlash va boshlash** tugmasini bosing. Oynada ofitsantlar telefonda ochadigan manzil ko'rsatiladi.

### Internet o'chsa
- Kassa **internetsiz ham to'liq ishlaydi**: buyurtma, yopish, chek.
- Ofitsantlar telefonlari restoran Wi-Fi'i orqali kassaga ulanishda davom etadi.
- Yuqori panelda **OFFLINE** yozuvi va hali yuborilmagan o'zgarishlar soni ko'rinadi.
- Internet qaytgach, hammasi serverga avtomatik yuboriladi va yozuv **ONLINE** ga o'zgaradi.

### Chek chiqarish
Kassa ilovasida chek **to'g'ridan-to'g'ri standart printerga** chiqadi (oyna ochilmaydi). Printer Windows'da «standart» (Default) qilib belgilangan bo'lishi kerak.

### Ofitsant monobloki (RestoPro Ofitsant)
1. `RestoPro-Ofitsant-Setup.exe` ni o'rnating.
2. Server manzilini kiriting — kassa kompyuterining manzili (masalan, `http://192.168.1.10:5050`) yoki cloud manzil. **Tekshirish** tugmasi ulanishni sinaydi.
3. Ilova to'liq ekranda ochiladi va PIN klaviaturasini ko'rsatadi. Kompyuter yoqilganda avtomatik ishga tushadi.
4. Chiqish: soat yonidagi belgi → **Chiqish**, yoki `Ctrl+Shift+Q`.

### Yangilanishlar (avtomatik)
Kassa va Ofitsant ilovalari yangi versiyani **o'zi tekshiradi** (har 3 soatda), internet bo'lsa fonda yuklab oladi:
- Kassada adminga xabar chiqadi: «Yangi versiya tayyor» → **Hozir yangilash** (dastur ~1 daqiqaga yopilib qayta ochiladi) yoki **✕** — dastur keyingi safar yopilganda o'zi o'rnatiladi.
- Ofitsant monoblokida hech kim kirmagan (PIN ekrani) paytda 30 soniyadan keyin o'zi yangilanadi.
- Qo'lda tekshirish: **Sozlama → Ko'rinish → Yangilanishni tekshirish** yoki tray menyusi.
- Ma'lumotlar yangilanishda o'chmaydi. Qayta `.exe` yuklab o'rnatish shart emas.

### Tray menyusi (soat yonidagi RestoPro belgisi)
- **Sozlamalar** — server, kalit yoki rejimni o'zgartirish.
- **Loglar papkasi** — muammo bo'lsa, shu fayllarni texnik yordamga yuboring.
- **Backup papkasi** — kuniga bir marta olinadigan zaxira nusxalar (oxirgi 14 kun saqlanadi).
- **Chiqish** — kassani to'liq yopish.

---

## Tez-tez uchraydigan muammolar

| Muammo | Yechim |
|---|---|
| Telefonda sahifa ochilmayapti | Telefon restoran Wi-Fi'iga ulanganini tekshiring. Kassa kompyuteri yoqiq bo'lishi kerak. |
| «Birinchi sinxronlash kutilmoqda» | Kassa kompyuterini internetga ulang. Bu faqat birinchi ishga tushirishda kerak. |
| Chek chiqmayapti | Printer yoqiq va qog'oz borligini tekshiring. Windows'da printer «standart» (Default) qilib belgilangan bo'lsin. |
| Mijoz QR kodni skanerlaganda «Wi-Fi'ga ulaning» chiqadi | Mijoz telefoni restoran Wi-Fi'iga ulangan bo'lishi kerak (mobil internet orqali ishlamaydi). |
| QR kod ochilmayapti | Kassa kompyuterining IP manzili o'zgargan bo'lishi mumkin. Routerda doimiy IP biriktiring va QR kodlarni qayta chop eting. |
| Ofitsant kira olmayapti | **Xodimlar** sahifasida umumiy kalit va uning shaxsiy «Kirish» kaliti yoqilganini tekshiring. |
| Parol esdan chiqdi | Administrator **Xodimlar** bo'limida yangi parol o'rnatadi. Administrator parolini o'zgartirish uchun texnik yordamga murojaat qiling. |
| «Obuna muddati tugagan» | To'lovni amalga oshiring va **Qayta tekshirish** tugmasini bosing. Ma'lumotlar saqlangan. |
| «Litsenziyani tekshirib bo'lmadi» | Kompyuter uzoq vaqt internetsiz ishlagan. Internetga ulang va **Qayta tekshirish** ni bosing. |

**Texnik yordam:** [telefon], Telegram [@____], har kuni 10:00–23:00.
