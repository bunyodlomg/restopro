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
# .env faylda MONGO_URI ni o'zgartiring
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

### Default kirish ma'lumotlari
| Login    | Parol     | Role    |
|----------|-----------|---------|
| `admin`  | `admin123`| Admin   |

⚠️ **Muhim:** Ishga tushgandan keyin parolni o'zgartiring!

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
