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

### Kassa
Administrator ham ofitsant ekrani orqali buyurtma qabul qilishi mumkin (pastdagi «Ofitsant» bo'limiga qarang).

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
Ofitsant yoki administrator qo'shish: ism, login, parol, rol, oylik maosh.
- Xodim ishdan ketsa, uning hisobini o'chiring yoki parolini almashtiring.

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
| Chek chiqmayapti | Printer yoqiq va qog'oz borligini tekshiring. Windows'da printer «standart» qilib belgilangan bo'lsin. Brauzer qalqib chiquvchi oynani bloklamasligi kerak. |
| Parol esdan chiqdi | Administrator **Xodimlar** bo'limida yangi parol o'rnatadi. Administrator parolini o'zgartirish uchun texnik yordamga murojaat qiling. |
| «Obuna muddati tugagan» | To'lovni amalga oshiring va **Qayta tekshirish** tugmasini bosing. Ma'lumotlar saqlangan. |
| «Litsenziyani tekshirib bo'lmadi» | Kompyuter uzoq vaqt internetsiz ishlagan. Internetga ulang va **Qayta tekshirish** ni bosing. |

**Texnik yordam:** [telefon], Telegram [@____], har kuni 10:00–23:00.
