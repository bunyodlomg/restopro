// ============================================================
//  BRAND KONFIGURATSIYA — Har bir oshxona uchun o'zgartiring
//  Brand Configuration — Customize per restaurant
// ============================================================

export const BRAND = {
  // Oshxona nomi / Restaurant name
  name: "RestoPro",

  // Qisqa nom (sidebar collapsed holat uchun)
  shortName: "RP",

  // Tavsif / Tagline
  tagline: "Boshqaruv Tizimi",

  // Emoji yoki matn logo / Emoji or text logo
  logo: "🍽",

  // ---- RANGLAR / COLORS  —  "Plov" palette: teal + saffron ----
  // Asosiy rang (deep teal — fresh, modern, distinct from typical POS)
  primary: "#0D9488",
  primaryDark: "#0F766E",
  primaryLight: "#14B8A6",

  // Ikkilamchi rang (saffron amber — appetizing accent)
  secondary: "#F59E0B",

  // ---- ADMIN TEMA / ADMIN THEME ----
  adminBg: "#0A1413",
  adminSurface: "#0F1A18",
  adminElevated: "#14221F",
  adminBorder: "rgba(255,255,255,0.07)",

  // ---- OFITSANT TEMA / WAITER THEME ----
  waiterBg: "#F5F2EB",
  waiterSurface: "#FFFFFF",
  waiterBorder: "rgba(20,40,38,0.09)",

  // ---- SERVER / API ----
  // Same-origin uchun bo'sh qoldiring (Vite proxy yoki birgalikda hosting).
  // Alohida backend uchun .env faylda VITE_API_URL ni belgilang.
  apiUrl: "",
};

// CSS variables sifatida ishlatish uchun
export function applyBrand() {
  const r = document.documentElement.style;
  r.setProperty("--brand-primary",    BRAND.primary);
  r.setProperty("--brand-primary-dk", BRAND.primaryDark);
  r.setProperty("--brand-primary-lt", BRAND.primaryLight);
  r.setProperty("--brand-secondary",  BRAND.secondary);
}
