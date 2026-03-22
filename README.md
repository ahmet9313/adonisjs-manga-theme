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

Before you begin, make sure the following software is installed on your system:

| Software | Minimum Version | Download |
|----------|----------------|----------|
| **Node.js** | v20.0 or higher | [nodejs.org](https://nodejs.org) |
| **MySQL** | v8.0 or higher | [mysql.com](https://dev.mysql.com/downloads/) |
| **npm** | v9.0 or higher | Comes with Node.js |
| **Git** | Any recent version | [git-scm.com](https://git-scm.com) |

> You can verify your installed versions with: `node -v`, `npm -v`, `mysql --version`, `git --version`

#### Step 1: Clone the Repository

```bash
git clone https://github.com/ahmet9313/adonisjs-manga-theme.git
cd adonisjs-manga-theme
```

#### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages listed in `package.json` (AdonisJS, TailwindCSS, Alpine.js, MySQL driver, etc.)

#### Step 3: Configure Environment Variables

Copy the example environment file:

```bash
# Linux / macOS
cp .env.example .env

# Windows (Command Prompt)
copy .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Now open `.env` in your text editor and update the database settings:

```env
DB_HOST=127.0.0.1       # Your MySQL host (127.0.0.1 for local)
DB_PORT=3306             # MySQL port (default: 3306)
DB_USER=root             # Your MySQL username
DB_PASSWORD=yourpassword # Your MySQL password
DB_DATABASE=manga_theme  # Database name (will be created in Step 4)
```

#### Step 4: Generate Application Key

AdonisJS requires a unique application key for encryption. Generate one with:

```bash
node ace generate:key
```

This will automatically update the `APP_KEY` value in your `.env` file.

#### Step 5: Create the Database

Open your MySQL client (MySQL Workbench, phpMyAdmin, or terminal) and run:

```sql
CREATE DATABASE manga_theme CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Or via terminal:

```bash
mysql -u root -p -e "CREATE DATABASE manga_theme CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

#### Step 6: Run Database Migrations

This creates all required tables (series, chapters, genres, authors, artists, content_types, users, etc.):

```bash
npm run migrate
```

#### Step 7: Seed the Database (Optional)

Load sample data including an admin user and example series:

```bash
npm run seed
```

> Default admin credentials after seeding: check `database/seeders/admin_seeder.ts`

#### Step 8: Start the Development Server

```bash
npm run dev
```

The server will start with Hot Module Replacement (HMR) enabled.

#### Step 9: Open in Browser

- **Homepage:** [http://localhost:3333](http://localhost:3333)
- **Admin Panel:** [http://localhost:3333/admin/giris](http://localhost:3333/admin/giris)

#### Production Build

To build and run for production:

```bash
# Build the project
npm run build

# Start the production server
npm start
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run migrate` | Run database migrations |
| `npm run migrate:rollback` | Rollback last migration batch |
| `npm run migrate:fresh` | Drop all tables and re-run migrations |
| `npm run seed` | Seed database with sample data |
| `npm run db:reset` | Fresh migration + seed (full reset) |
| `npm run lint` | Run ESLint code checks |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run test suite |

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

### Kurulum Adimlari

#### Gereksinimler

Baslamadan once asagidaki yazilimlarin sisteminizde kurulu oldugundan emin olun:

| Yazilim | Minimum Surum | Indirme Linki |
|---------|---------------|---------------|
| **Node.js** | v20.0 veya uzeri | [nodejs.org](https://nodejs.org) |
| **MySQL** | v8.0 veya uzeri | [mysql.com](https://dev.mysql.com/downloads/) |
| **npm** | v9.0 veya uzeri | Node.js ile birlikte gelir |
| **Git** | Guncel herhangi bir surum | [git-scm.com](https://git-scm.com) |

> Kurulu surumleri kontrol etmek icin: `node -v`, `npm -v`, `mysql --version`, `git --version`

#### Adim 1: Repoyu Klonlayin

```bash
git clone https://github.com/ahmet9313/adonisjs-manga-theme.git
cd adonisjs-manga-theme
```

#### Adim 2: Bagimliliklari Yukleyin

```bash
npm install
```

Bu komut `package.json` dosyasindaki tum gerekli paketleri yukler (AdonisJS, TailwindCSS, Alpine.js, MySQL surucusu vb.)

#### Adim 3: Ortam Degiskenlerini Yapilandirin

Ornek ortam dosyasini kopyalayin:

```bash
# Linux / macOS
cp .env.example .env

# Windows (Command Prompt)
copy .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Simdi `.env` dosyasini metin editoru ile acin ve veritabani ayarlarini guncelleyin:

```env
DB_HOST=127.0.0.1       # MySQL sunucu adresi (yerel icin 127.0.0.1)
DB_PORT=3306             # MySQL portu (varsayilan: 3306)
DB_USER=root             # MySQL kullanici adiniz
DB_PASSWORD=sifreniz     # MySQL sifreniz
DB_DATABASE=manga_theme  # Veritabani adi (Adim 5'te olusturulacak)
```

#### Adim 4: Uygulama Anahtari Olusturun

AdonisJS sifreleme icin benzersiz bir uygulama anahtari gerektirir:

```bash
node ace generate:key
```

Bu komut `.env` dosyanızdaki `APP_KEY` degerini otomatik olarak gunceller.

#### Adim 5: Veritabanini Olusturun

MySQL istemcinizi acin (MySQL Workbench, phpMyAdmin veya terminal) ve calistirin:

```sql
CREATE DATABASE manga_theme CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Veya terminal uzerinden:

```bash
mysql -u root -p -e "CREATE DATABASE manga_theme CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

#### Adim 6: Veritabani Migration'larini Calistirin

Bu komut gerekli tum tablolari olusturur (series, chapters, genres, authors, artists, content_types, users vb.):

```bash
npm run migrate
```

#### Adim 7: Ornek Verileri Yukleyin (Istege Bagli)

Admin kullanicisi ve ornek seriler dahil ornek verileri yukleyin:

```bash
npm run seed
```

> Varsayilan admin bilgileri icin: `database/seeders/admin_seeder.ts` dosyasina bakin

#### Adim 8: Gelistirme Sunucusunu Baslatin

```bash
npm run dev
```

Sunucu Hot Module Replacement (HMR) etkin olarak baslar.

#### Adim 9: Tarayicida Acin

- **Ana Sayfa:** [http://localhost:3333](http://localhost:3333)
- **Admin Paneli:** [http://localhost:3333/admin/giris](http://localhost:3333/admin/giris)

#### Uretim Icin Derleme

Uretim ortaminda derlemek ve calistirmak icin:

```bash
# Projeyi derle
npm run build

# Uretim sunucusunu baslat
npm start
```

### Kullanilabilir Komutlar

| Komut | Aciklama |
|-------|----------|
| `npm run dev` | Gelistirme sunucusunu baslatir (HMR) |
| `npm run build` | Uretim icin derler |
| `npm start` | Uretim sunucusunu baslatir |
| `npm run migrate` | Veritabani migration'larini calistirir |
| `npm run migrate:rollback` | Son migration grubunu geri alir |
| `npm run migrate:fresh` | Tum tablolari silip migration'lari yeniden calistirir |
| `npm run seed` | Veritabanina ornek verileri yukler |
| `npm run db:reset` | Tum tablolari sifirla + ornek veri yukle |
| `npm run lint` | ESLint ile kod kontrolu |
| `npm run format` | Prettier ile kod formatlama |
| `npm run typecheck` | TypeScript tip kontrolu |
| `npm test` | Test paketini calistir |

---

## License

This project is for educational and personal use.

Bu proje egitim ve kisisel kullanim amaciyla gelistirilmistir.
