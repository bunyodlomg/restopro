# RestoPro — Oshxona Boshqaruv Tizimi

## O'rnatish

```bash
npm install
cp .env.example .env
# .env faylda VITE_API_URL ni server manziliga o'rnating
npm run dev
```

## Sozlash — Brend nomi va ranglar

`src/brand.js` faylini oching va quyidagilarni o'zgartiring:

```js
export const BRAND = {
  name: "Sizning Oshxona Nomi",
  logo: "🍽",               // yoki SVG
  primary: "#D4831F",        // asosiy rang
  apiUrl: "http://...",      // server manzili
}
```

## Arxitektura

```
src/
├── brand.js          ← Brend sozlamalari
├── config.js         ← API URL
├── App.jsx           ← Role-based routing
├── layouts/
│   ├── AdminLayout   ← Sidebar bilan
│   └── WaiterLayout  ← Mobile bottom-nav
├── pages/
│   ├── Login.jsx     ← Yagona login (admin/waiter)
│   ├── admin/        ← Faqat admin ko'radi
│   └── waiter/       ← Faqat ofitsant ko'radi
└── components/
    └── shared/       ← Umumiy komponentlar
```

## Rollar

| Role    | Login | Ko'rish                                |
|---------|-------|----------------------------------------|
| admin   | ✅    | Dashboard, Buyurtmalar, Xodimlar, ...  |
| waiter  | ✅    | Stollar, Buyurtma berish, Mening buyurtmalarim |
