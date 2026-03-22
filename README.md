<p align="center">
  <h1 align="center">AdonisJS Manga Theme</h1>
  <p align="center">
    <strong>v0.8.0 Beta</strong>
    <br />
    A modern, full-featured manga reading platform theme built with AdonisJS 6
    <br />
    <em>Manga, Manhwa, Manhua & Novel okuma platformu temasi</em>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.8.0--beta-orange?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/AdonisJS-6-5A45FF?style=for-the-badge&logo=adonisjs&logoColor=white" alt="AdonisJS" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/MySQL-Database-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Alpine.js-3-8BC0D0?style=for-the-badge&logo=alpinedotjs&logoColor=white" alt="Alpine.js" />
</p>

---

## English

### About

**AdonisJS Manga Theme** is a full-stack manga reading platform that supports multiple content types including Manga, Manhwa, Manhua, and Novels. It features a beautifully designed reader interface, advanced search and filtering, a complete admin panel for content management, and a responsive design that works perfectly on all devices.

### Features

**Reader & Content**
- Image-based manga/manhwa/manhua chapter reader with page-by-page navigation
- Text-based novel reader for written content
- Chapter navigation with previous/next controls
- Bookmarks system using localStorage

**Discovery & Search**
- Advanced search with real-time autocomplete suggestions
- Filter series by genre, status, content type, and publication year
- Sort by title, newest, or recently updated
- Featured series showcase with auto-rotating hero slider
- Similar series recommendations based on shared genres

**Admin Panel**
- Full CRUD management for Series, Chapters, Genres, Authors, Artists, and Content Types
- Cover and banner image upload support
- Featured series management with custom descriptions
- Chapter content editor (image gallery or text)
- Paginated admin lists with configurable page sizes

**Technical Highlights**
- SEO-friendly slug-based URL structure
- Server-side rendered pages with Edge.js templates
- Age rating system with visual badges
- Alternative title support for better searchability
- Responsive mobile-first design with TailwindCSS
- Session-based authentication with CSRF protection
- Form validation with VineJS

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | AdonisJS 6, TypeScript, Node.js |
| **Database** | MySQL with Lucid ORM |
| **Frontend** | Edge.js (SSR), TailwindCSS 4, Alpine.js 3 |
| **Build Tool** | Vite 6 |
| **Authentication** | AdonisJS Auth (Session-based) |
| **Validation** | VineJS |

### Getting Started

#### Prerequisites

- **Node.js** >= 20.x
- **MySQL** >= 8.0
- **npm** or **yarn**

#### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ahmet9313/adonisjs-manga-theme.git
   cd adonisjs-manga-theme
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your database credentials, then generate an app key:
   ```bash
   node ace generate:key
   ```

4. **Create the database**
   ```sql
   CREATE DATABASE manga_theme CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

5. **Run migrations and seed**
   ```bash
   npm run migrate
   npm run seed
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

7. Open your browser and navigate to `http://localhost:3333`

### Project Structure

```
adonisjs-manga-theme/
├── app/
│   ├── controllers/        # Route controllers
│   │   ├── admin/          # Admin panel controllers
│   │   ├── home_controller.ts
│   │   ├── series_controller.ts
│   │   └── chapter_controller.ts
│   ├── models/             # Lucid ORM models
│   ├── services/           # Business logic
│   ├── middleware/          # Auth & other middleware
│   └── exceptions/         # Error handlers
├── database/
│   ├── migrations/         # Database schema
│   └── seeders/            # Sample data
├── resources/
│   ├── views/              # Edge.js templates
│   │   ├── pages/          # Page templates
│   │   ├── components/     # Layout components
│   │   └── partials/       # Reusable partials
│   ├── css/                # TailwindCSS styles
│   └── js/                 # Client-side scripts
├── public/
│   └── content/            # Uploaded manga content
├── config/                 # App configuration
└── start/
    ├── routes.ts           # Route definitions
    └── kernel.ts           # Middleware kernel
```

---

## Turkce

### Hakkinda

**AdonisJS Manga Theme**, Manga, Manhwa, Manhua ve Novel icin tam ozellikli bir okuma platformudur. Modern ve sik bir okuyucu arayuzu, gelismis arama ve filtreleme, kapsamli bir admin paneli ve tum cihazlarda mukemmel calisan responsive bir tasarima sahiptir.

### Ozellikler

**Okuyucu ve Icerik**
- Sayfa sayfa manga/manhwa/manhua okuyucu (resim tabanli)
- Novel/metin tabanli bolum okuyucu
- Onceki/sonraki bolum navigasyonu
- Yer isaretleri sistemi (localStorage)

**Kesfet ve Arama**
- Gercek zamanli otomatik tamamlamali gelismis arama
- Tur, durum, icerik tipi ve yayin yilina gore filtreleme
- Baslik, en yeni veya son guncellenen siralamalari
- Otomatik donen hero slider ile one cikan seriler
- Ortak turlere dayali benzer seri onerileri

**Admin Paneli**
- Seri, Bolum, Tur, Yazar, Cizer ve Icerik Turu icin tam CRUD yonetimi
- Kapak ve banner resim yukleme
- Ozel aciklamali one cikan seri yonetimi
- Bolum icerik editoru (resim galerisi veya metin)
- Sayfalandirilmis admin listeleri

**Teknik Ozellikler**
- SEO dostu slug tabanli URL yapisi
- Edge.js ile sunucu tarafinda render (SSR)
- Yas derecelendirmesi sistemi
- Alternatif baslik destegi
- TailwindCSS ile mobil oncelikli responsive tasarim
- CSRF korumali oturum tabanli kimlik dogrulama
- VineJS ile form dogrulama

### Kurulum

1. **Repoyu klonlayin**
   ```bash
   git clone https://github.com/ahmet9313/adonisjs-manga-theme.git
   cd adonisjs-manga-theme
   ```

2. **Bagimliliklari yukleyin**
   ```bash
   npm install
   ```

3. **Ortam degiskenlerini yapilandirin**
   ```bash
   cp .env.example .env
   ```
   `.env` dosyasini duzenleyip veritabani bilgilerinizi girin, ardindan uygulama anahtari olusturun:
   ```bash
   node ace generate:key
   ```

4. **Veritabanini olusturun**
   ```sql
   CREATE DATABASE manga_theme CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

5. **Migration ve seed calistirin**
   ```bash
   npm run migrate
   npm run seed
   ```

6. **Gelistirme sunucusunu baslatin**
   ```bash
   npm run dev
   ```

7. Tarayicinizda `http://localhost:3333` adresine gidin

### Kullanilabilir Komutlar

| Komut | Aciklama |
|-------|----------|
| `npm run dev` | Gelistirme sunucusunu baslatir (HMR) |
| `npm run build` | Uretim icin derler |
| `npm start` | Uretim sunucusunu baslatir |
| `npm run migrate` | Veritabani migration'larini calistirir |
| `npm run seed` | Ornek verileri yukler |
| `npm run db:reset` | Veritabanini sifirlar ve yeniden seed'ler |
| `npm run lint` | ESLint ile kod kontrolu |
| `npm run format` | Prettier ile kod formatlama |
| `npm run typecheck` | TypeScript tip kontrolu |

---

## License

This project is for educational and personal use.

Bu proje egitim ve kisisel kullanim amaciyla gelistirilmistir.
