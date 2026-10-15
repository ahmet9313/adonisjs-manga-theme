# MangaHub — Kapsamlı Optimizasyon ve Yeniden Tasarım Planı (OPTIMIZATION_PLAN)

> Durum: 2026-10-15'te onaylandı. Faz ilerlemesi AGENTS.md güncelleme günlüğüne yazılır; yapılmamış işler `GELISTIRME_ONERILERI.md` üzerinden bu belgeye bağlanır (AGENTS.md kural 8: yapılmamış işler orada izlenir; tamamlanan her adım AGENTS.md günlüğüne yazılır).

## Bağlam

Site; üyelik, yorumlar, kütüphane ve kazanılan (satın almasız) topluluk sistemiyle hızla büyüdü. Bu büyüme şu sorunları getirdi:

- **Tutarsız arayüz:** Yalnız topluluk sayfaları yeni tasarım dilinde. Ana sayfa, katalog, detay, okuyucu, giriş ve ayarlar yarı geçişte; admin paneli tamamen eski stilde.
- **Kalite açıkları:** Ölçülmemiş performans, güvenlik ve veri bütünlüğü sorunları.
- **Eksik altyapı:** Kuyruk ve zamanlayıcı yok.

Hedef: mevcut işlevleri koruyarak tüm sitenin (admin dahil) **merlintoon.com benzeri** tek bir tasarım sistemine taşınması; frontend, backend, veritabanı ve arka plan işlerinin ölçülerek iyileştirilmesi.

Bulgular üç bağımsız incelemeden geldi:

- **İnceleme 1:** 64 şablon, UI/UX ve erişilebilirlik.
- **İnceleme 2:** Backend, veritabanı ve güvenlik.
- **İnceleme 3:** Performans ve varlıklar.

Bu bulgular, onları çürütmeye çalışan doğrulayıcılarla tek tek kontrol edildi. Plan yalnızca doğrulanmış bulgulara dayanır; kanıtlar `dosya:satır` biçimindedir.

### Kullanıcının verdiği kararlar

| Konu | Karar |
| --- | --- |
| Tema | merlintoon.com tarzı koyu cam tema; **admin paneli de aynı dile** taşınacak |
| Görsel işleme | `sharp` eklenecek (npm, Windows/Linux hazır ikili) |
| Arka plan işleri | Veritabanı tabanlı kuyruk + uygulama içi işçi (Redis yok) |
| Editör yetkisi | Kozmetik ve kart yönetimi **yalnız yönetici** |
| Görsel ayarlar | Renkler, logo, favicon, zemin/desen/arka plan görseli, köşe ve efekt ayarları, rozet renkleri, duyuru çubuğu ve ana sayfa bölümleri **admin → Ayarlar → Tema Ayarları** sayfasından değiştirilebilecek; kodda yalnız varsayılanlar kalacak (bkz. 4.6) |

### Referans tasarım: merlintoon.com

Değerler, sitenin ana sayfasından ve `init-manga/skin-glass.css` dosyasından headless tarayıcıyla okundu.

- **Zemin:** `html #050b16`, `body #000022`. Üzerinde lacivert çapraz çizgi deseni var (opaklık .15, dikey tekrar).
- **Cam yüzey:** `--glass-bg rgba(85,85,85,.25)`. Açılır menü ve modal yüzeyi: `--glass-z-bg rgba(12,12,12,.85)`.
- **Köşe ve kenarlık:** `--glass-radius 22px`. Kenarlık `rgba(255,255,255,.06)`; katmanlarda `.10`.
- **Gölge ve blur:** `--glass-shadow 0 12px 28px rgba(0,0,0,.35)`. Mobilde gölge `0 4px 10px rgba(0,0,0,.25)` olarak hafifliyor. Blur yalnız katmanlarda ve sadece `4px`.
- **Renkler:** Ana renk `#0fa942`, hover `#3fba67`, ikincil vurgu `#48e4ef`. Rozetlerde `rgba(15,169,66,.8)`.
- **Butonlar:** Hap (`border-radius: 500px`) cam butonlar, hover'da `white/12` dolgu ve `white/25` kenarlık. Birincil gönder butonu: %45 yeşil `color-mix` geçişi, iç parıltı ve yeşil gölge.
- **Tipografi:** Sistem font yığını, 16px, metin `rgba(255,255,255,.7)`. Bölüm başlıkları küçük, kalın, soluk ve BÜYÜK HARF.
- **Düzen:** İçerik genişliği 1110px.
- **Ana sayfa sırası:**
  - Slider (kapak + başlık + #tür etiketleri)
  - Yeni Bölümler
  - Hızlı Filtrele
  - En Popüler Seriler
  - Türlere Göre Keşfet
  - Yorumlar & İncelemeler
  - Bu Ayın En İyi Okuyucuları
  - Tamamlanan Seriler

  Mağaza, VIP ve sohbet kutusu kapsam dışı (satın alma yok).
- **Erişilemeyenler:** Seri ve okuyucu sayfaları Cloudflare bot doğrulamasının arkasında; aşılmaya çalışılmadı. Bu sayfalar için kullanıcının paylaştığı ekran görüntüleri referans alındı.

---

## 1. Mevcut proje mimarisi

**Teknoloji yığını**

- **Sunucu:** AdonisJS 7.3 (TypeScript, ESM), Lucid 22.
  - Veritabanı: varsayılan SQLite (better-sqlite3); isteğe bağlı MySQL (mysql2).
- **Görünüm:** Edge 6 sunucu tarafında render; tarayıcıda Alpine 3.15; Tailwind 4.3 (`@tailwindcss/vite`) ve Vite 7.
- **Kimlik ve güvenlik:** Oturum korumalı giriş + remember-me, scrypt.
- **Shield:** CSRF, HSTS ve frame deny açık; CSP kapalı.
- **Doğrulama ve test:** Doğrulama VineJS; testler Japa (unit + functional, bellek içi SQLite, 3334 portuna gerçek `fetch`).

**İstek akışı**

1. Sunucu middleware'i: `container_bindings` → `static` (public/) → `vite`.
2. Router middleware'i: `bodyparser` → `session` → `shield` → `initialize_auth` → `silent_auth`. Sonuncusu kullanıcıyı yükler, `last_seen` yazar (dakikada bir), HTML GET'lerde menü özetini hesaplar (3 sayım sorgusu) ve kozmetik önbelleğini ısıtır.
3. İsimli middleware'ler (`auth`, `role`) → controller → servis → Lucid → Edge.

**Katmanlar**

| Katman | Mevcut durum |
| --- | --- |
| Controller'lar | 11 public, 10 admin |
| Servisler | series, presenter, input, upload, library, comment, account, throttle, level, progress, cosmetic, card, notification, recommendation |
| Modeller | 16 |
| `config/` | site, content, roles, rewards, cosmetics + framework ayarları |
| Görünümler | 64 Edge şablonu: 2 layout, partial'lar, components, pages, admin, errors |
| Tarayıcı JS | 13 dosya; ~20 Alpine bileşeni `resources/js/app.js` içinde hepsi baştan yükleniyor (yalnız `chapter_form` lazy) |
| CSS | Tek dosya `resources/css/app.css` |

**Veri**

- 16 migration.
- Sayaçlar denormalize: `like_count`, `dislike_count`, `reply_count`, `profile_like_count`, `exp`.
- Topluluk tabloları: cosmetics, notifications, cards, user_* tabloları.
- Medya `CONTENT_ROOT` altında. Ayarlı değilse `public/content` static middleware ile, ayarlıysa `MediaController` ile sunuluyor.

**Başlatma**

- `start.ps1`, `start.sh` ve `start.cmd` → `scripts/setup-and-start.mjs`.
- Akış: Node 24 kontrolü/kurulumu → `npm ci` → `.env` + `APP_KEY` → migration → isteğe bağlı seed → geliştirme ya da üretim (build + `node bin/server.js`).

**Arka plan**

- Kuyruk, zamanlayıcı, cron ya da event listener yok. Tüm işler istek içinde çalışıyor.
- Hız sınırı (`throttle.ts`) ve kozmetik önbelleği süreç belleğinde.

**Testler**

- 28 Japa testi: catalog, accounts, library, comments, community, unit/input.
- `scripts/check-mobile-nav.mjs` bu Linux ortamında root olarak çalışmıyor (`--no-sandbox` yok; tarayıcı yolu sınırlı).

---

## 2. Tespit edilen sorunlar

Etiketler: **[D]** iddia doğrulandı · **[K]** kısmen doğrulandı (düzeltilmiş hali yazıldı) · **[E]** doğrulayıcıların ek bulgusu. Önem derecesi doğrulayıcının değerlendirmesidir.

### 2.1 Arayüz, şablon doğruluğu ve erişilebilirlik

| ID | Önem | Sorun | Kanıt |
| --- | --- | --- | --- |
| A8+E | **Yüksek** [K+E] | **Üretimde bilinmeyen her adres 404 yerine 500 döndürüyor ve hata metnini sızdırıyor.** Eşleşmeyen rotada router middleware'leri (session/shield/auth) çalışmadığından `flashMessages`/`csrfField` yok; 404 sayfası `main` layout'unu (flash_toast, auth modal) kullandığı için çöküyor ve framework yedeği ham hata mesajını basıyor. Hata sayfaları ayrıca `title`'ı layout'a iletmiyor. | `start/kernel.ts:35-41`, `app/exceptions/handler.ts:17,23-30`, `partials/flash_toast.edge:1`, `node_modules/@adonisjs/http-server/.../define_config-*.js:5043-5061, 5146-5151`; bellekte render ile yeniden üretildi: "Cannot read properties of undefined (reading 'has')" |
| E-cookie | Orta [E] | Oturum yalnız cookie deposunda. Doğrulama hatasında tüm girdiler flash'lanıyor; uzun roman metni ya da `page_order` ~4 KB cookie sınırını aşınca tarayıcı cookie'yi düşürüyor ve **hata özeti + girilen veri tamamen kayboluyor**. Akıl yürütmeyle bulundu, tarayıcıda tekrarlanmadı. | `config/session.ts:37-45`, `start/env.ts:26`, `app/validators/admin.ts:10,31,32` |
| E-kontrast | Orta [E] | Dolgulu butonlarda beyaz yazı AA'yı geçmiyor: emerald-600 3.65, gradient 2.47–3.67, `#16a34a` 3.30, rozetlerde green-600 3.22, orange-600 3.60, `.lv-badge` tier1 4.42. | `account_menu.edge:187`, `composer.edge:89`, `login_form.edge:21`, `app.css:81,120,136-141` |
| B5 | Orta [D] | Soluk metin kontrastı: `text-gray-500` (#6a7282) zeminde 3.97, camda 3.78 → küçük metinde AA'yı geçmiyor (100 kullanım / 38 dosya). `text-gray-600` 2.54 (12 kullanım; hata sayfası numaraları dahil). | `node_modules/tailwindcss/theme.css:230-232`, `series_detail.edge:185-207`, `footer.edge:10` |
| B1 | Orta [D] | 7 modalın hiçbirinde odak tuzağı yok (`@alpinejs/focus` kurulu değil, `x-trap` 0). 6/7 modal açılınca odağı içeri almıyor; hiçbiri kapanınca odağı geri vermiyor, arka plan kaydırmasını kilitlemiyor. Kart açılış penceresinde `role=dialog` yok. | `package.json`, `resources/js/app.js`, `cards/index.edge:52-54` |
| A6 | Orta [D] | Kaydedilenler'de "Hepsini Kaldır" onay almadan tüm kayıtları siliyor; ara hatalar da sonraki istekte siliniyor. | `bookmarks.edge:11-17`, `bookmarks.js:73,82-86` |
| A4 | Orta [K] | Admin seri ve bölüm formlarında alan altı hata yok (yalnız üstte ham alan adlı özet var: "publication_year sayı olmalıdır"). Başarısız kayıtta çoğu alan geri yüklenmiyor; bölüm formunda yapıştırılan roman metni dahil hiçbir alan geri gelmiyor. | `admin/series/form.edge` (yalnız :19, :27, :47 geri yükleniyor), `admin/chapters/form.edge`, `start/validator.ts` |
| A1 | Düşük [D] | `series_detail.edge`'de fazladan bir `</div>` (:209/:210), "Seri Bilgileri" kartını ve yan sütunu erken kapatıyor. "Anahtar Kelimeler" kartı her seri sayfasında yorumların altına, tam genişlikte düşüyor. | `series_detail.edge:19,176-220`, `series_presenter.ts:83-86` |
| A2/A5 | Düşük [K] | Sunucu verisi satır içi JS dizgilerine yerleştiriliyor (AGENTS kural 9 ihlali): `series_detail.edge:10` (onerror içinde kapak yolu), `admin/series/form.edge:212,260`, `admin/cosmetics/form.edge:13` (flash'lanmış POST girdisi), `cosmetics/index.edge:28`, `account_menu.edge:133,151`. Değerler üretilmiş yol, slug ya da sabit olduğu için **bugün istismar edilemez**. | aynı satırlar |
| A7 | Düşük [D] | Sessiz hatalar: kaydet butonu `failed` durumunu göstermiyor; arama ağ hatasını "Sonuç bulunamadı" olarak gösteriyor. | `bookmarks.js:94,122,136`, `nav_search.js:21-25` |
| A3 | Düşük [K] | Sözlük formları hatayı `field_error` yerine ham basıyor: çıktı aynı, ama `role=alert` yok ve yinelenen ad hatasında girdi geri gelmiyor. | `admin/{genres,authors,artists,content_types}/form.edge:20-22` |
| B2 | Düşük [K] | 10 adet pencere seviyesi Esc dinleyicisi var. Örneğin bildirim zili mobil menüyü kapatmadan gelen kutusunu açıyor; modal içindeki `…` menüsünde Esc tüm modalı kapatıyor. | `navbar.edge:5,77`, `inbox.edge:42`, `cosmetics/index.edge:37` |
| B3 | Düşük [D] | 7 tablist var, 0 tabpanel. Filtre ve sıralama düğmeleri `aria-pressed` olmalı; öneriler sekmeleri aslında bağlantı. Hesap menüsünde `role=menu` yanlış kullanılmış. | `inbox.edge:10`, `comments/section.edge:14`, `recommendations.edge:14-16`, `account_menu.edge:29` |
| B4 | Düşük [K] | Admin bölüm formunda "sayfayı kaldır" düğmesinin adı yok ve klavyeyle görünmüyor (yalnız hover). × düğmelerinin adı işe yaramaz ("×"). | `admin/chapters/form.edge:119-121`, `flash_messages.edge:15,22,29` |
| B6 | Düşük [K] | Tür rengi 5 kopya, durum rengi 7 kopya / 5 farklı şema. Kapak üstündeki sol üst rozet katalogda **durum**, diğer sayfalarda **tür** anlamına geliyor. Yönetimden eklenen yeni türün rengi sayfaya göre değişiyor. | `home.edge:75-86,88`, `series_detail.edge:237-246`, `bookmarks.edge:46-52`, `series_list.edge:154`, `series_row.edge:3` |
| B7 | Düşük [D] | İki ayrı bildirim sistemi var: sunucu flash'ı üstte, yeşil, ekran okuyucuya duyurulmuyor; istemci toast'u altta, emerald. Hata toast'ları 3.5 sn'de kendiliğinden kapanıyor. | `flash_toast.edge:2-4`, `flash_messages.edge:12`, `community/toast.edge`, `community.js:333` |
| B8 | Düşük [K] | Navbar'da bulunulan sayfa gösterilmiyor (ne görsel ne `aria-current`). Admin kenar çubuğunda görsel durum var ama `aria-current` yok. | `navbar.edge:22-28,112-118`, `layout/admin.edge:27-66` |
| B9 | Düşük [K] | Camgöbeği kalıntıları: kırpma çerçevesi `rgba(34,211,238,.7)`; üye rol rozeti camgöbeği. Tailwind `config/`'u da tarıyor. | `settings.edge:139`, `config/roles.ts:5` |
| B10 | Düşük [D] | 139 buton / 93 farklı sınıf dizisi; birincil buton 5 farklı görünümde. Input'lar 4+ stilde (32 eski `bg-[#0d1117] border-gray-600`). `.btn-green` ve `.pill-active` emerald değil `#16a34a`. | grep sayımları |
| E | Düşük [E] | "İçeriğe atla" bağlantısı yok. Kırpma penceresi yalnız işaretçiyle (klavye yok). Admin çoklu seçim tetikleyicileri klavyeyle açılmıyor; sayfa sıralama yalnız sürükle-bırak. Mobil admin kenar çubuğu gizliyken de sekme sırasında. Okuma geçmişinde adı boş kapak bağlantısı. Seri detayda banner yoksa yedek görsel aynı hatalı URL'yi deniyor. | `layout/main.edge:14-31`, `settings.edge:133-135`, `admin/series/form.edge:317,360,403`, `admin/chapters/form.edge:104-108`, `layout/admin.edge:16-17`, `history.edge:19-21`, `series_detail.edge:7,10` |

### 2.2 Performans

| ID | Önem | Sorun | Kanıt |
| --- | --- | --- | --- |
| P1 | **Yüksek** [D] | Görsel ve statik dosyalarda önbellek süresi yok. `static` yalnız ETag/Last-Modified kullanıyor, `maxAge` yok. `MediaController` dosyayı `response.download` ile hiçbir `Cache-Control` başlığı olmadan veriyor. Her sayfa görüntülemesinde her kapak ve bölüm sayfası için koşullu istek (304 gidiş-dönüşü) yapılıyor. | `config/static.ts`, `app/controllers/media_controller.ts:22` |
| P2 | **Yüksek** [D] | Görseller orijinal boyutunda sunuluyor: küçük resim, WebP ya da `srcset` yok. Katalogdaki 180 px'lik kart, tam boy kapağı indiriyor. Okuyucu görsellerinde `width`/`height` yok (CLS). İlk sayfa dahil tüm sayfalar `loading="lazy"` (LCP gecikir). | `chapter_reader.edge:26-31`, `upload_service.ts` |
| P3 | Orta [D] | `.site-bg` dört ayrı radial-gradient ve `background-attachment: fixed` kullanıyor; kaydırmada tam ekran yeniden boyama yapılıyor. `glass` yardımcısı (`blur(14px) saturate(140%)`) tekrarlanan kartlarda da kullanılıyor. | `resources/css/app.css:17-36` |
| P4 | Orta [D] | `resources/js/app.js` bütün Alpine bileşenlerini (yorumlar, topluluk, profil kırpma, kütüphane…) her sayfada baştan yüklüyor. Yalnız `chapter_form` geç yükleniyor. | `resources/js/app.js:1-20` |
| P5 | Orta [D] | `silent_auth` her istekte kozmetik önbelleğini bekliyor. Girişli kullanıcıda her HTML GET'te menü özetini hesaplıyor (birkaç sayım sorgusu) ve dakikada bir `users` satırına yazıyor. | `app/middleware/silent_auth_middleware.ts:14-28` |
| P6 | Orta [D] | Öneriler her seri için iki ilişkili alt sorgu çalıştırıyor (`count(distinct user_id)` ve `count(*)`). `chapter_reads.series_id` ve `bookmarks.series_id` ile başlayan bir indeks yok (mevcut indeksler `user_id` ile başlıyor). Okur sayısı arttıkça tam tarama yapılıyor. | `recommendation_service.ts:5-8`, `0014_create_library_tables.ts:23,50-51` |
| P7 | Düşük [D] | Okuma geçmişi 2000 satır çekip seri bazında JavaScript'te grupluyor. | `library_service.ts:68-77` |
| P8 | Düşük [Ö] | Ad efektleri (`fx-*`) sonsuz `background-position` animasyonu kullanıyor. Yorum listesinde onlarca öğe sürekli yeniden boyanıyor. | `resources/css/app.css` (fx-flow) |
| P9 | Düşük [Ö] | Admin panosu son serileri ilişkileriyle birlikte tam yüklüyor. Ölçüm yapılmadı; büyük katalogda yavaşlayabilir. | `admin/dashboard_controller.ts:11-39` |
| P10 | **Yüksek** [D] | `/content/*` görsel istekleri router middleware'lerinden (oturum, shield, auth, `silent_auth`) geçiyordu: **her görsel yanıtı iki oturum çerezi yazıyor**, kozmetik önbelleğini bekliyor ve girişli kullanıcıyı yüklüyordu. Bölüm başına onlarca görselde gereksiz iş yapılıyor ve `Set-Cookie` paylaşılan önbellekleri engelliyordu (Faz 1'de giderildi). | `start/routes.ts:16`, `curl -I /content/...` çıktısı |

### 2.3 Backend

| ID | Önem | Sorun | Kanıt |
| --- | --- | --- | --- |
| S1 | **Yüksek** [D] | Üretimde JSON isteklerindeki 500 hatalarında framework'ün varsayılan işleyicisi `error.message`'ı yanıtlıyor (ör. SQL ya da dosya yolu). HTML 500 sayfasına da `error` nesnesi geçiliyor. | `app/exceptions/handler.ts:23-30` |
| S2 | **Yüksek** [D] | Gövde ayrıştırıcı, CSRF ve oturum kontrolünden **önce** çalışıyor. Çok parçalı istekler 200 MB'a kadar otomatik olarak geçici klasöre yazılıyor. Girişsiz biri herhangi bir POST adresine büyük dosya gönderip disk ve G/Ç tüketebilir. | `start/kernel.ts:35-41`, `config/bodyparser.ts:43-55` |
| S3 | Orta [D] | Kart parçalama, satırı okuyup `count = 1` yazıyor. Aynı anda gelen iki istek (özellikle MySQL'de) aynı kopyalardan iki kez parça kazandırır. | `card_service.ts:104-121` |
| S4 | Orta [Ö] | Yeni bölüm bildirimi, kaydeden herkese istek içinde ve tek tek yazılıyor. Çok takipçili seride admin kaydı yavaşlar ve yarıda kalabilir. | `admin/chapter_controller.ts`, `notification_service.ts` |
| S5 | Orta [D] | Hız sınırı (`throttle.ts`) ve kozmetik önbelleği süreç belleğinde tutuluyor. Yeniden başlatmada sıfırlanıyor, çok süreçli kurulumda paylaşılmıyor. | `app/services/throttle.ts`, `cosmetic_service.ts` |
| S6 | Düşük [D] | `MediaController` `.svg` uzantısını da sunuyor. Yükleme SVG'yi reddediyor ama elle kopyalanan bir SVG aynı kökenden betik çalıştırabilir. Demo içeriğin tamamı SVG olduğundan (11.923 dosya) SVG kaldırılamaz; yanıtlara `Content-Security-Policy: sandbox` eklenir. | `media_controller.ts:12` |

### 2.4 Veritabanı

| ID | Önem | Sorun | Kanıt |
| --- | --- | --- | --- |
| D1 | Orta [Ö] | MySQL bağlantısında `dateStrings` ayarı yok. `mysql2`, DATETIME sütunlarını ham sorgularda (`db.from(...)`) `Date` nesnesi olarak döndürür. SQLite'ta ise bunlar dizgi olarak gelir. Ham sorgu sonuçlarını dizgi kabul eden yerler (geçmiş, okundu zamanları, sıralama ve biçimlendirme) MySQL'de farklı davranabilir. `last_checkin_on` VARCHAR olduğu için etkilenmez. MySQL sunucusu olmadığından bu çalıştırılarak doğrulanmadı. | `config/database.ts` (mysql), `library_service.ts`, `comment_service.ts` |
| D2 | Orta [D] | P6 ile aynı: `chapter_reads(series_id)` ve `bookmarks(series_id)` indeksleri eksik. | `0014_create_library_tables.ts` |
| D3 | Orta [D] | SQLite'ta WAL ve `busy_timeout` ayarlı değil. Okuma ile yazma birbirini kilitler; aynı anda yazmada `SQLITE_BUSY` hatası alınabilir. | `config/database.ts` |
| D4 | Düşük [D] | 0016 migration'ı `users.frame_id/effect_id/wallpaper_id` ve `comments.sticker_id` için yabancı anahtar ekleyemedi (SQLite kısıtı). Silinen bir kozmetik, kullanıcıda geçersiz kimlik bırakabiliyor; kod bunu yumuşak biçimde yok sayıyor. | `0016_create_community_tables.ts:10-25` |
| D5 | Düşük [Ö] | Denormalize sayaçlar (`like_count`, `reply_count`, `profile_like_count`) için düzeltme ya da yeniden hesaplama aracı yok. | `comment_service.ts` |

### 2.5 Güvenlik, eşzamanlılık ve arka plan

| ID | Önem | Sorun | Kanıt |
| --- | --- | --- | --- |
| G1 | **Yüksek** [D] | `start.sh --production --seed` (ya da `start.ps1 -Production -Seed`) seed işlemini `.env`'deki `NODE_ENV=development` ile çalıştırıyor. Seeder'lardaki üretim koruması devreye girmiyor ve **`admin@admin.com` / `admin` demo yöneticisi üretimde oluşuyor**. | `scripts/setup-and-start.mjs:163-170,193`, `admin_seeder.ts:7`, `.env.example:6` |
| G2 | Yüksek [D] | Editör rolü kozmetik ve kart yönetimine erişebiliyor (kullanıcılara hediye etme dahil). Karar: yalnız yönetici. | `start/routes.ts:150-175,246` |
| G3 | Orta [D] | CSP kapalı. Satır içi `onerror`/`onsubmit` kullanımı CSP'nin açılmasını engelliyor. | `config/shield.ts:8-12` |
| G4 | Orta [D] | Oturum cookie deposunda. Bkz. E-cookie (uzun form girdisi kayboluyor). Ayrıca sunucu tarafında oturum iptali yapılamıyor. | `config/session.ts:37-45` |
| G5 | Orta [D] | Kuyruk ve zamanlayıcı yok. Eski dosya temizliği, bildirim dağıtımı ve görsel işleme istek içinde çalışıyor ya da hiç yapılmıyor. | `app/` (queue/scheduler yok) |

### 2.6 Eksik alanlar

- **Parola:** Parola sıfırlama ve e-posta doğrulama yok (öneri belgesinde).
- **İzlenebilirlik:** Sağlık kontrolü uç noktası (`/saglik`) ve yapılandırılmış istek günlüğü yok.
- **Test kapsamı:** Hata sayfaları, üretim modu, admin seri/bölüm formlarının hata yolları ve medya önbellek başlıkları için test yok.
- **Görsel test:** `npm run test:ui` bu Linux ortamında root kullanıcıyla çalışmıyor (`--no-sandbox` yok).

### 2.7 Bu ortamda doğrulanamayanlar

- **Windows:** `start.ps1` ve `start.cmd` yalnız kaynak üzerinden incelendi.
- **MySQL:** Sunucu yok. D1 kod incelemesine dayanıyor.
- **Üretim:** Gerçek alan adı, HTTPS, ters vekil ve çok süreçli kurulum yok. Ölçümler yerel yapılacak.
- **merlintoon.com:** Seri ve okuyucu sayfaları Cloudflare doğrulaması arkasında. Bu sayfalar için kullanıcının ekran görüntüleri referans alındı.
- **İşaretler:** [Ö] ile işaretlenen bulgular ön incelemeden geliyor. İlgili faza başlarken yeniden ölçülüp doğrulanacak; doğrulanmazsa plandan çıkarılacak.


### 2.8 Bağımsız doğrulamanın sonradan getirdiği ek bulgular (2026-10-15)

| ID | Önem | Sorun | Kanıt | Faz |
| --- | --- | --- | --- | --- |
| X1 | **Yüksek** | Bodyparser'ın geçici klasöre yazdığı yükleme dosyaları, `move()` edilmedikçe hiç silinmiyor (reddedilen ya da geçersiz yüklemeler dahil); disk sürekli büyüyor. Faz 1'deki yükleme kapısı misafirleri engelledi; üye ve yönetici tarafı açık. | `bodyparser_middleware-*.js:1095-1105`, `account_controller.ts` uploadImage, `comment_controller.ts` | 1b |
| X2 | **Yüksek** | MySQL'de ham sorgulardaki tarih alanları `Date` nesnesi olarak geliyor; `.replace` çağrıları TypeError fırlatıyor, `Date.parse` NaN veriyor (D1 kod incelemesiyle Yüksek'e yükseldi). | `comment_service.ts:25`, `notification_service.ts`, `series_presenter.ts:101-108` | 1b (DB-07) |
| X3 | Orta | Kozmetik önbelleği reddedilen promise'i sonsuza kadar tutuyor: tek bir geçici DB hatası, yeniden başlatılana kadar **her sayfayı** bozar (`silent_auth` bunu bekliyor). | `cosmetic_service.ts:51-61` | 1b |
| X4 | Orta | Parola değişince remember-me belirteçleri silinmiyor ve oturum yenilenmiyor; çalınmış bir "beni hatırla" çerezi geçerli kalıyor. | `account_controller.ts:149-159` (karşılaştırma: `admin/user_controller.ts:60`) | 1b |
| X5 | Orta | Giriş deneme sınırı, aynı IP'den yapılan herhangi bir başarılı girişte sıfırlanıyor; saldırgan kendi hesabıyla araya giriş yaparak sınırı aşabilir. | `auth_controller.ts:51-71` | 1b |
| X6 | Orta | Yanıt sıkıştırma (gzip/br) yok; HTML/JS/CSS sıkıştırılmadan gönderiliyor (ters vekil yoksa). | `start/kernel.ts` | 7 |
| X7 | Orta | Üretim CSS'inde `glass` yardımcılarında yalnız `-webkit-backdrop-filter` kalıyor; Chromium bunu desteklemediği için üretimde cam bulanıklığı çalışmıyor. | derlenmiş `app-*.css` | 2 (FE-01) |
| X8 | Orta | Sözlük (tür/yazar/çizer) silme, bağlı serilerdeki ilişkileri sessizce siliyor; "bağlı seri var" mesajı hiç tetiklenmiyor. | `admin/genre_controller.ts:84-87` | 5 |
| X9 | Düşük | Yorum hız sınırı eşzamanlı isteklerle aşılabiliyor (deneme kaydı işlemin sonunda yazılıyor). | `comment_controller.ts:56,105` | 1b |
| X10 | Düşük | Seri kapak/banner değiştirme ve bölüm sayfa düzenleme eski dosyaları silmiyor (JOB-02 `cleanup-files` kapsamında). | `admin/series_controller.ts:89-93` | 7 |
| X11 | Düşük | Geliştirmede seed edilmiş bir veritabanı üretime taşınırsa `admin@admin.com` demo hesabı orada kalır; üretim başlangıcında uyarı yok. | `scripts/setup-and-start.mjs` | 1b |
| X12 | Düşük | SEO/kimlik eksikleri: `og:`/canonical/robots yok, favicon/manifest yok, admin sayfalarında `noindex` yok. | `layout/main.edge:3-12`, `layout/admin.edge` | 3–4 |

Not: Güvenlik doğrulayıcısı Faz 1 sonrası kodu inceledi. Hata ayrıntısı sızıntısı (F2) ve üretim seed'i (F6) "artık geçerli değil" olarak işaretlendi, yani Faz 1 düzeltmeleri bağımsız olarak doğrulandı.

---

## 3. Sayfa bazlı UI/UX değerlendirmesi

Durum: **Yeni** = yeni tasarım dilinde · **Yarı** = cam panel var ama input/buton/renk eski · **Eski** = hiç geçmemiş.

| Sayfa / ekran | Durum | Başlıca sorunlar | Hedef |
| --- | --- | --- | --- |
| Navbar, hesap menüsü, footer | Yeni / Yarı | Aktif sayfa yok (B8); logo geçişi admin'den farklı; menüde `role=menu` hatalı (B3); mobilde giriş butonları gizli; footer çok sade | merlintoon navbar'ı: logo + BÜYÜK HARF bağlantılar (Seriler ▾ açılır menü: A-Z, Trend/Popüler, Tamamlanan, En çok takip edilen), canlı arama, zil, avatar; aktif durum + `aria-current`; cam footer (bağlantılar, sosyal) |
| Ana sayfa | Yarı | h1 yok; hero eski hex renkler; 3. bir gradyan (sayfalama); durum rengi tutarsız (Bırakıldı mavi); hero kapağı mobilde gereksiz iniyor; LCP görselinde `fetchpriority` yok | merlintoon akışı (bölümler Tema Ayarları'ndan aç/kapa): slider (#tür etiketleri), Yeni Bölümler, Hızlı Filtrele, En Popüler, Türlere Göre Keşfet, Son Yorumlar, Ayın Okuyucuları, Tamamlananlar |
| Katalog `/seriler` | Yarı | Filtre input'u eski; 9 checkbox eski stil; 4 kopya chevron SVG; sol üst rozet "durum" (diğer sayfalarda "tür"); boş sonuçta "filtreleri temizle" yok; kartlarda kart başına blur | `ui/field` + filtre hapları; tek kart bileşeni; boş durum + sıfırlama; blur'suz kartlar |
| Seri detay | Yarı | **A1 bozuk HTML**; satır içi onerror/JS dizgisi (A2/A5); butonlar `rounded`; `dt` kontrastı (B5); benzer seriler tür rengi yanlış (B6); kaydet hatası sessiz (A7); banner yedeği bozuk | merlintoon seri sayfası düzeni: banner + kapak + bilgi paneli, Okumaya Devam Et (yeşil cam CTA), bölüm listesi kartı, yan panelde bilgiler; tüm yazılar token'larla |
| Okuyucu | Yarı | Görsellerde boyut yok (CLS); `prose` sınıfları ölü; gezinme `rounded` eski; yorumlar her açılışta hemen yükleniyor | Sabit üst/alt okuma çubuğu (önceki/sonraki/bölüm seçici), sayfa boyutları kayıtlı, yorumlar görünür olunca yüklenir |
| Kaydedilenler | Yarı | h1 farklı stil; "Hepsini Kaldır" onaysız (A6); tür rozet eşlemesi ayrı | `ui/page-header`, `ui/confirm`, ortak kart |
| Öneriler, Geçmiş, Kozmetik, Kartlar, Ödüller, Rozetler | Yeni | Aktif hap rengi farklı (kartlarda beyaz, diğerlerinde yeşil); `bg-[#111722]` menüler; tablist anlamsal hatası; kart penceresinde `role=dialog` yok; günlük giriş şeridi 7 sütunda 40 px (mobil) | Ortak `ui/tabs` / hap grubu, `ui/modal`; mobilde 7 günlük şerit kaydırılabilir |
| Profil (herkese açık) | Yeni | Pembe beğeni butonu sistem dışı; beğeni hatası sessiz | Rozet ve beğeni düğmesi token'larla |
| Ayarlar | Yarı | 4 gradyan buton; siyah input'lar; sekme çizgisi farklı renk; kırpma penceresinde camgöbeği ve yalnız işaretçi | `ui/field` + `ui/button`; klavyeyle kırpma (ok tuşları) |
| Giriş / Kayıt (+ modal) | Yarı | Input ve buton eski; `password_confirmation` hatası yok; modal ve sayfa başlık boyutları farklı | Tek `auth` formu bileşeni, cam kart, yeşil cam CTA |
| Hata sayfaları 403/404/500 | Eski | **A8 üretimde çöküş**; numaralar gray-600 (2.54:1); başlık iletilmiyor | Session'a bağlı olmayan sade layout; cam kart, ikon, ana sayfa / geri dön eylemleri |
| Yorumlar, gelen kutusu, envanter, toast | Yeni | Odak tuzağı yok (B1); Esc katmanları (B2); iki toast sistemi (B7); `/envanter` iki kez çekiliyor | `ui/modal` + tek `ui/toast` + ortak envanter store |
| Admin: kabuk ve kenar çubuğu | Eski | `#161b22`/gray-700; 14 satır içi SVG; h1 yok; mobil kenar çubuğu gizliyken de odaklanabiliyor; logo geçişi farklı | 4.5'teki merlintoon admin kabuğu |
| Admin: Panel (dashboard) | Eski | 6 kopya istatistik kartı; tam `content` JSON'u yükleniyor | `ui/panel` istatistikleri + son işler / kuyruk durumu |
| Admin: Seriler / Bölümler formları | Eski | Alan hatası yok, girdi geri gelmiyor (A4); çoklu seçim ve sürükle-bırak klavyeyle kullanılamıyor; yükleme sırasında ilerleme/çift gönderim koruması yok; satır içi JS blokları | `ui/field`, klavye erişimli çoklu seçim, yükleme ilerlemesi, `resources/js/components`'e taşınmış mantık |
| Admin: Türler / Yazarlar / Çizerler / İçerik türleri | Eski | 4 neredeyse aynı controller ve görünüm; silme mesajı yanlış (cascade) | Tek ortak sözlük CRUD bileşeni; içerik türüne renk alanı |
| Admin: Kullanıcılar, Kozmetikler, Kartlar | Eski / Yarı | İki farklı birincil buton stili; editör erişimi (karar: yalnız admin) | `ui/table`, `ui/button`, `ui/confirm` |
| Admin: **Ayarlar → Tema Ayarları** (yeni) | — | — | Bölüm 4.6 |
| Admin: **Arka plan işleri** (yeni) | — | — | Bölüm 8: iş listesi, durum, yeniden deneme |

---

## 4. Önerilen tasarım sistemi ve renk paleti (merlintoon tarzı)

> **Yön değişti (2026-10-15):** Kullanıcı bu bölümdeki merlintoon tarzı koyu cam tema yerine "Mürekkep & Kâğıt" tasarım dilini seçti (nötr koyu zemin + kâğıt beyazı açık şema, menekşe vurgu, Manrope, blur yok). Uygulanan sistem README.md → "Tasarım sistemi: Mürekkep & Kâğıt" bölümünde ve AGENTS.md günlüğündedir. Bu bölümün renk/görsel dil kısmı (merlintoon, #0fa942 yeşil, cam paneller) geçersizdir; bileşen envanteri, kontrast kuralları, z-index/hareket ölçekleri ve erişilebilirlik bulguları hâlâ geçerlidir ve yeni sistemde kullanıldı.

**İlkeler**

- Tek koyu tema.
- Renkler Tailwind v4 `@theme` token'ları olarak tanımlanır; ileride `data-theme` ile açık tema eklenebilir.
- **Token değerleri çalışma zamanında değiştirilebilir.**
  - `app.css` içindeki `@theme` değerleri yalnız **varsayılandır**.
  - Yöneticinin Tema Ayarları'nda kaydettiği değerler `/tema.css?v=<sürüm>` dosyasında `:root { --color-brand: … }` olarak üretilir ve `app.css`'ten sonra yüklenir.
  - Tailwind v4 yardımcıları `var(--color-…)` kullandığı için değişiklik derleme gerektirmeden **tüm siteye ve admin paneline** yansır; `/50` gibi opaklık değiştiricileri de çalışır (`color-mix`).
  - Bu yüzden şablonlarda **sabit hex renk yasaktır**; yalnız token yardımcıları (`bg-brand`, `text-muted`, `bg-surface` …) kullanılır.
- Cam (blur) yalnız **gezinme çubuğu, açılır menü, modal ve toast** gibi katmanlarda kullanılır.
- Tekrarlanan kartlarda blur'suz yarı saydam yüzey kullanılır (performans; referans da bloklarda blur kullanmıyor).
- Kozmetikler (`fx-*`, `frame-*`, `wall-*`, `tcg`, `lv-badge`) içerik sayılır; renkleri token sistemine zorlanmaz.

### 4.1 Renk token'ları ve kontrast oranları

Oranlar WCAG formülüyle hesaplandı.

- Zemin `#000022`.
- Yüzey: `rgba(85,85,85,.25)` zeminle birleşince `#15152f`.
- Katman yüzeyi: `rgba(12,12,12,.85)` → `#0a0a0f`.

| Token | Değer | Kullanım | Kontrast |
| --- | --- | --- | --- |
| `--color-bg` | `#000022` (+ desen katmanı) | Sayfa zemini | — |
| `--color-surface` | `rgb(85 85 85 / .25)` | Kart, panel, blok (blur yok) | — |
| `--color-surface-raised` | `rgb(255 255 255 / .06)` | Kart içi kutu, input zemini | — |
| `--color-overlay` | `rgb(12 12 12 / .85)` + `blur(4px)` | Navbar, dropdown, modal, toast | — |
| `--color-border` / `-strong` | `rgb(255 255 255 / .06)` / `.10`; hover `.25` | Kenarlıklar | — |
| `--color-text` | `#ffffff` | Başlık, vurgulu metin | yüzeyde **17.79** |
| `--color-text-secondary` | `rgb(255 255 255 / .70)` | Gövde metni (referansla aynı) | yüzeyde **8.56** |
| `--color-text-muted` | `rgb(255 255 255 / .55)` | Tarih, açıklama, `dt` | yüzeyde **5.38** (AA ✓) |
| `--color-text-disabled` | `rgb(255 255 255 / .40)` | Yalnız devre dışı öğeler | 3.17 (muaf) |
| `--color-brand` | `#0fa942` | İkon, kenarlık, odak halkası, ilerleme, link vurgusu | metin olarak yüzeyde **5.74** |
| `--color-brand-hover` | `#3fba67` | Link/hover metni | yüzeyde **7.14** |
| `--color-brand-strong` | `#0b8533` | **Beyaz yazılı düz dolgu** (aktif hap, rozet) | beyaz **4.75** ✓ |
| `--color-brand-glass` | `color-mix(#0fa942 45%, overlay)` → `#0c5226` | Birincil CTA (referanstaki gibi yeşil cam) | beyaz **9.33** ✓ |
| `--color-accent` | `#48e4ef` | Geçiş vurgusu, seviye/özel öğeler (metin olarak 11.54) | beyazla kullanılmaz (1.54) |
| `--color-success` / `warning` / `danger` / `info` (metin) | `#4ade80` / `#fbbf24` / `#f87171` / `#38bdf8` | Durum metinleri ve ikonları | 10.21 / 10.66 / 6.43 / 8.31 |
| `--color-danger-strong` | `#dc2626` | Beyaz yazılı tehlike butonu | beyaz **4.83** |

Mevcut sorunların düzeltmesi:

- `gray-500` (yüzeyde 3.68) ve `gray-600` (2.35) metin için **yasaklanır**.
- Beyaz yazılı `emerald-600` (3.65), `#16a34a` (3.30) ve `#0fa942` (3.10) dolgular `--color-brand-strong` ya da `--color-brand-glass` ile değiştirilir.

### 4.2 Tek kaynaktan rozet renkleri

Renk eşlemesi `config/site.ts` içinde tek yerde tutulur. Rozetler beyaz yazılı, 10–11px kalın metinle kullanılır; her eşlemede bir varsayılan bulunur.

| Grup | Eşleme (beyaz yazı kontrastı) |
| --- | --- |
| İçerik türü | manga `#2563eb` (5.17) · manhwa `#0b8533` (4.75) · manhua `#b91c1c` (6.47) · novel `#7c3aed` (5.70) · webtoon `#c2410c` (5.18) · bilinmeyen `#4b5563` (7.56) |
| Durum | Devam Ediyor `#0b8533` · Tamamlandı `#0369a1` (5.93) · Bırakıldı `#4b5563` |
| Yaş | 18+ `#b91c1c` · 16+ `#c2410c` · 13+ `#b45309` (~5.0) · 7+ `#0369a1` |
| Rol | admin kırmızı · editör amber · üye `brand` (camgöbeği kalıntısı kalkar) |

Konum karışıklığı da giderilir: katalogda sol üst köşe **durum**, detay ve kaydedilenlerde **tür** gösteriyor. Yeni kural: kapak üstünde sol üstte tür, sağ üstte yaş; durum başlığın altında metin rozeti olarak.

### 4.3 Diğer ölçekler

- **Tipografi:** Sistem font yığını (referansla aynı; web fontu yok, performans nötr).

  | Seviye | Boyut | Ağırlık |
  | --- | --- | --- |
  | display | 2.25rem | 800 |
  | h1 | 1.75rem | 800 |
  | h2 / section-title | 0.8125rem | 700, büyük harf, `tracking .06em`, `white/60` (referanstaki "uk-h5 bold muted uppercase") |
  | h3 | 1rem | 700 |
  | body | 0.9375–1rem / 1.6 | — |
  | small | 0.8125rem | — |
  | caption | 0.75rem | — |

  Her sayfada tek `<h1>` olur; admin dahil.
- **Boşluk:** Tailwind 4px tabanı. Kart iç boşluğu 20px (`p-5`), bölüm arası 32px.
  - Konteyner: `max-w-[75rem]` (1200px; mevcut 1280 ile referans 1110 arası).
  - Kenar boşluğu: mobilde 16px, ≥md'de 24px.
- **Köşe:** `--radius-panel 22px` (blok ve panel) · `--radius-card 16px` · `--radius-control 12px` (input) · `--radius-pill 9999px` (tüm butonlar ve haplar, referans gibi) · `--radius-badge 6px` · `--radius-bubble 5px` (yorum içi kutu).
- **Gölge:**
  - `--shadow-panel 0 12px 28px rgb(0 0 0/.35)`; mobilde `0 4px 10px rgb(0 0 0/.25)`.
  - `--shadow-bubble 0 3px 15px rgb(0 0 0/.15), inset 0 1px 10px rgb(255 255 255/.06)`.
  - Birincil CTA parıltısı: `0 4px 18px color-mix(#0fa942 25%, transparent)`.
- **z-index:**

  | Katman | Değer |
  | --- | --- |
  | sticky | 30 |
  | nav | 40 |
  | dropdown | 50 |
  | modal | 80 |
  | modal içi popover | 85 |
  | toast | 90 |
  | lightbox | 95 |

  Mevcut 70/80/85/90/95 dağınıklığı token'a bağlanır.
- **Hareket:**
  - Süreler: 150ms (hover), 250ms (panel); kolaylaştırma `ease`.
  - `prefers-reduced-motion` tüm sonsuz animasyonları durdurur.
  - Ad efektleri `background-position` yerine `transform` ile çalışan sahte öğeye taşınır ve ekran dışındayken durdurulur.
- **Kırılım noktaları:** Tailwind varsayılanları (640/768/1024/1280; referansın 640/960/1200 ızgarasıyla uyumlu).
- **Zemin deseni:**
  - Referanstaki büyük SVG kopyalanmaz. Kendi `repeating-linear-gradient` çapraz çizgi desenimiz `body::before { position: fixed }` katmanında kullanılır.
  - Böylece `background-attachment: fixed` maliyeti ve kaydırmada sürekli boyama ortadan kalkar.
  - İsteğe bağlı site arka plan görseli `config/site.ts` → `background` ile tanımlanabilir.

### 4.4 Bileşen envanteri (Edge `components/ui/*` + Alpine)

| Bileşen | Sözleşme | Yerine geçtiği |
| --- | --- | --- |
| `ui/button` | `variant: primary(yeşil cam) \| secondary(cam hap) \| ghost \| danger \| link`, `size: sm\|md\|lg`, `icon`, `loading`; yalnız ikonluysa `label` zorunlu (aria-label) | 93 farklı buton sınıf dizisi, 5 farklı birincil görünüm |
| `ui/field` | `label`, `name`, `type` (text/email/password/number/textarea/select/checkbox/file), `hint`, hata otomatik (`field_error` mantığı), eski değer (`flashMessages`) otomatik | `auth/field`, admin `@let(field)` kopyaları, 32 eski stil input |
| `ui/panel`, `ui/card` | `padding`, `as`, başlık slot'u | 30× `#161b22`, 57× `#0d1117` yüzeyleri |
| `ui/badge` | `kind: type\|status\|age\|role\|level\|count`; renk `config/site.ts` eşlemesinden | 5 tür ve 7 durum eşleme kopyası |
| `ui/modal` | Tek kabuk; `@alpinejs/focus` `x-trap.inert.noscroll`; açılışta odak içeri, kapanışta geri; Esc yalnız en üstteki katmanı kapatır (küçük Alpine `layers` store); `role=dialog` + `aria-labelledby` | 7 kopya modal kabuğu |
| `ui/dropdown` | Açılır menü (menu rolü yerine disclosure deseni), içte Esc ile yalnız kendisi kapanır | hesap menüsü, `…` menüleri, sıralama menüleri |
| `ui/tabs` | Gerçek panel geçişi için WAI-ARIA tabs (tabpanel + ok tuşları); filtre/sıralama için `aria-pressed` hap grubu | 7 tablist (0 tabpanel) |
| `ui/pagination` | Public ve admin ortak | `home` ↔ `series_list` kopyası + admin pagination |
| `ui/empty-state`, `ui/skeleton` | İkon, başlık, açıklama, eylem; yükleme iskeleti | ~15 farklı boş durum paragrafı |
| `ui/toast` | Tek sistem; sunucu flash'ları `data-flash` ile aynı store'a akar; `role=status` / hata için `role=alert` ve otomatik kapanmaz | `flash_toast` (admin uyarısı) + topluluk toast'u |
| `ui/progress` | `role=progressbar`, `aria-valuenow` | 4 kopya ilerleme çubuğu |
| `ui/breadcrumb`, `ui/page-header` | Başlık + açıklama + eylemler; her sayfada tek h1 | sayfa başına farklı başlık stilleri |
| `ui/table` (admin) | Başlık satırı, satır hover, mobilde kart görünümü, boş satır, eylem sütunu | 9 admin index kopyası |
| `ui/confirm` | Alpine onay modalı | 9 satır içi `onsubmit="return confirm()"` |
| Seri kartları | `series/card-grid`, `series/card-row`, `series/card-compact`, `series/hero-slide` | `home`, `series_list`, `series_detail`, `bookmarks` ve `series_row` kopyaları |
| İkon | Tümü `components/icon` (Heroicons v2, 1.6 çizgi, `aria-hidden`) | 73 satır içi `<svg>` (v1, 2 çizgi) |

### 4.5 Admin paneli (merlintoon diliyle)

- **Kabuk:** Aynı zemin ve desen.
  - Kenar çubuğu `--color-overlay` cam ve 22px köşe (masaüstünde içe gömülü panel).
  - Mobilde kenar çubuğu off-canvas; kapalıyken `inert`.
  - Aktif bağlantı `brand` göstergesi + `aria-current`.
- **İçerik:** Üst bar sayfa başlığını `<h1>` olarak gösterir. Gösterge kartları `ui/panel`, tablolar `ui/table`, formlar `ui/field` ile yapılır.
- **Davranış:**
  - Birincil eylemler `ui/button primary`.
  - Silme işlemleri `ui/confirm` ile onaylanır.
  - Gönderimlerde yükleme durumu ve çift gönderim koruması bulunur.
- **Bilgi mimarisi:** Admin menüsü gruplanır: İçerik (Seriler, Bölümler, Türler, Yazarlar, Çizerler, İçerik Türleri) · Topluluk (Kozmetikler, Kartlar — yalnız admin) · Sistem (Kullanıcılar, Arka plan işleri).

### 4.6 Yönetimden düzenlenebilir tema ve site ayarları (Admin → Ayarlar → Tema Ayarları)

**Amaç:** Logo, renkler ve diğer tüm görsel ayarlar kod değişikliği, derleme ya da yeniden başlatma gerekmeden admin panelinden değiştirilebilsin; hatalı bir seçim siteyi okunmaz hale getirmesin.

**Veri modeli** (yalnız ekleme yapan migration; `down()` ile geri alınabilir)

- `site_settings`
  - Alanlar: `key` (benzersiz), `value` (JSON metin), `updated_by`, `updated_at`.
  - Gruplar: `branding`, `theme`, `badges`, `home`, `announcement`.
  - Kaydedilmemiş anahtarlar için `config/site.ts` varsayılanları kullanılır.
  - Yani sıfır kayıtla site bugünkü gibi çalışır.
- `site_setting_revisions`
  - Her kayıtta önceki değerin bir kopyasını tutar (son 20 sürüm).
  - Panelde "önceki sürüme dön" bu tablodan çalışır.
- `content_types.color` (nullable): Yönetimden eklenen yeni içerik türlerinin rozet rengi.
  - Bugün renk sabit kodlu ve bilinmeyen türler sayfaya göre turuncu, mor ya da renksiz çıkıyor.

**Servis: `app/services/settings_service.ts`**

- Ayarlar Vine şemasıyla doğrulanır.
- Değerler süreç belleğinde önbelleğe alınır. Kayıtta sürüm numarası artar.
  - Tek süreçte anında geçersiz kılınır.
  - Çok süreçli kurulumda 30 sn'lik TTL + DB'deki sürüm karşılaştırmasıyla güncellenir.
  - Bu yöntem kozmetik önbelleğine de uygulanacak.
- Edge'e `theme` ve `branding` global'leri verilir:
  - `site.name` ve `site.logo` artık bu katmandan okunur.
  - `config/site.ts` yalnız varsayılan kaynağıdır.
  - AGENTS.md kural 9 bu yeni düzene göre güncellenecek.

**Türetilmiş renkler ve kontrast güvenliği** (bağımlılıksız küçük bir renk yardımcısı: `app/services/color.ts`)

- Yönetici yalnız **ana renk**, **vurgu rengi** ve **zemin rengi** seçer. Gerisi otomatik hesaplanır:
  - hover tonu
  - beyaz yazı için ≥4.5:1 olana kadar koyulaştırılan `brand-strong`
  - yeşil cam CTA karışımı
  - odak halkası
  - metin üstü link rengi
- Her rozet rengi ve ana renk için WCAG oranı hesaplanır:
  - 4.5:1 altında panel uyarı gösterir ve "otomatik düzelt" önerir.
  - Kaydetme engellenmez; ama sitede beyaz yazılı dolgu için her zaman düzeltilmiş ton kullanılır.

**`/tema.css` uç noktası**

- `settings.version` ile sürümlenir. `Cache-Control: public, max-age=31536000, immutable`.
- Layout `<link rel="stylesheet" href="/tema.css?v=N">` ile yükler.
- Satır içi `<style>` yoktur; bu, ileride CSP açılmasına da uygundur.
- İçerik:
  - `:root` değişkenleri
  - zemin deseni (aç/kapa, renk, opaklık, açı/sıklık)
  - isteğe bağlı arka plan görseli ve karartma katmanı
  - cam opaklığı ve blur
  - köşe ölçeği (keskin / normal / yuvarlak)
  - gölge yoğunluğu
  - "mobilde efektleri azalt" seçeneği

**Panel sayfası: `/admin/ayarlar/tema`** (yalnız `admin` rolü; `ui/tabs` ile sekmeli)

| Sekme | Ayarlar |
| --- | --- |
| **Marka** | Site adı, kısa açıklama (meta), logo (PNG/WebP/JPG; açık ve koyu yüzey önizlemesi), favicon (PNG/ICO), sosyal bağlantılar, "Ekibe Katıl" bağlantısı, alt bilgi metni |
| **Renkler** | Ana renk, vurgu rengi, zemin rengi, metin yoğunluğu (ikincil/soluk metin opaklığı; AA altına inemez); canlı kontrast tablosu |
| **Zemin ve yüzeyler** | Desen aç/kapa ve rengi/opaklığı, arka plan görseli + karartma, cam yüzey opaklığı, blur gücü, köşe ölçeği, gölge yoğunluğu, mobilde efekt azaltma |
| **Rozetler** | İçerik türü (her tür satırında renk), durum (Devam / Tamamlandı / Bırakıldı), yaş sınırı ve rol rozet renkleri |
| **Ana sayfa** | Bölümleri aç/kapa ve sırala (merlintoon akışı: Slider, Yeni Bölümler, Hızlı Filtrele, En Popüler, Türlere Göre Keşfet, Son Yorumlar, Ayın Okuyucuları, Tamamlananlar); slider adedi |
| **Duyuru çubuğu** | Metin, bağlantı, renk tonu (bilgi / başarı / uyarı), açık/kapalı, kullanıcının kapatabilmesi |
| **Hazır temalar** | "Merlin (varsayılan)" ve birkaç hazır renk seti (ör. Gece Mavisi, Mor, Kızıl) tek tıkla uygulanır; tüm ayarlar JSON olarak dışa/içe aktarılır; "Varsayılanlara dön" ve sürüm geçmişinden geri alma |

**Canlı önizleme ve güvenlik**

- **Önizleme:** Sağda canlı önizleme kartı bulunur: navbar parçası, seri kartı, yorum kartı, butonlar, rozetler. Alpine, CSS değişkenlerini önizleme kapsayıcısına uygular; kaydetmeden sonucu gösterir.
- **Yükleme güvenliği:** Logo ve favicon `sharp` ile yeniden kodlanır (logo en çok 512px yükseklik, WebP; favicon 32/180/192/512 PNG). SVG kabul edilmez (XSS riski). Eski dosya kayıttan sonra kuyruğa atılan temizlik işiyle silinir.
- **Kozmetikler:** Ad efektleri, çerçeveler, duvar kağıtları ve kartlar içerik sayıldığı için tema renklerinden bağımsız kalır.

**Testler**

- Varsayılanlarla render.
- Ayar kaydı ve doğrulama hataları.
- Kontrast otomatik düzeltmesinin hesapları.
- `/tema.css` çıktısı ve önbellek başlıkları; sürüm artışı.
- Editörün 403 alması.
- Logo yükleme, yeniden kodlama ve eski dosya temizliği.
- Sürüme geri dönme.
- Önbellek geçersiz kılma.

### 4.7 Regresyon koruması

- `scripts/check-design-tokens.mjs` adlı bir script eklenir. Görünümlerde şu durumlarda hata verir:
  - Yasaklı eski sınıflar: `bg-[#161b22]`, `bg-[#0d1117]`, `text-gray-500/600` (metin), `from-emerald-500 to-teal-600`.
  - `aria-hidden`'sız satır içi `<svg>`.
  - Dinamik veri içeren satır içi `onerror`/`onsubmit`.
- Script `npm run lint`'e bağlanır.
- Görsel regresyon: mevcut Playwright Chromium ile 390/768/1440 px ekran görüntüleri (`test:ui` düzeltilerek).

---

## Görev biçimi

Her görevde şu alanlar bulunur:

- **Dosyalar**
- **Sorun → Çözüm**
- **Fayda**
- **Öncelik** (Kritik / Yüksek / Orta / Düşük)
- **Risk**
- **Bağımlılık**
- **Başarı ölçütü**

Görev kimlikleri (FE-, BE-, DB-, JOB-, SEC-, QA-) 12. bölümdeki fazlarda kullanılır.

---

## 5. Frontend planı

**FE-01 · Tasarım token'ları ve zemin** — Öncelik: **Kritik** (tüm sayfa işleri buna bağlı)

- **Dosyalar:** `resources/css/app.css`
- **Sorun → Çözüm:**
  - Sorun: Renkler dağınık; 30× `#161b22`, 57× `#0d1117`, üç farklı yeşil var. Zeminde `fixed` gradyan kullanılıyor (P3).
  - Çözüm: 4.1 ve 4.3'teki token'lar `@theme` içinde tanımlanacak.
    - `.site-bg`, `body::before` sabit katmanında merlintoon çapraz çizgi desenine dönüşecek.
    - `glass` yardımcısı ikiye ayrılacak: blur'lu `layer` ve blur'suz `surface`.
    - `.btn-green` ve `.pill-active` `brand-strong`/`brand-glass` kullanacak.
    - `prefers-reduced-motion` kuralı eklenecek.
- **Fayda:** Tek renk kaynağı; 4.6'daki çalışma zamanı teması mümkün olur; kaydırma boyaması azalır.
- **Risk:** Görsel kayma. Mevcut sınıflar geçiş süresince takma ad olarak tutulur.
- **Bağımlılık:** Yok.
- **Başarı ölçütü:**
  - 390/1440 px ekran görüntülerinde kırık yok.
  - Kontrast tablosundaki değerler hesaplayıcıyla tutuyor.
  - `npm run build` geçiyor.

**FE-02 · Ortak `ui/*` Edge bileşenleri** — Öncelik: **Yüksek**

- **Dosyalar:** `resources/views/components/ui/{button,field,panel,badge,modal,dropdown,tabs,pagination,empty_state,toast,progress,page_header,table,confirm}.edge`, `components/series/*`
- **Sorun → Çözüm:**
  - Sorun: 93 farklı buton sınıfı dizisi, 7 modal kopyası, 5 kart kopyası var.
  - Çözüm: 4.4'teki sözleşmelerle bileşenler yazılacak. Sayfalar faz faz bunlara geçirilecek.
- **Fayda:** Tutarlılık ve tek yerden erişilebilirlik düzeltmesi.
- **Risk:** Edge `@!component` satır başı kuralı (bkz. önceki hata). Her bileşen için render testi yazılacak.
- **Bağımlılık:** FE-01.
- **Başarı ölçütü:**
  - `check-design-tokens` 0 ihlal veriyor.
  - Tüm fonksiyonel testler geçiyor.

**FE-03 · Modal erişilebilirliği** — Öncelik: **Yüksek**

- **Dosyalar:** `package.json` (`@alpinejs/focus`; Alpine'ın resmi eklentisi, yeni UI kütüphanesi değil), `resources/js/app.js`, `components/ui/modal.edge`
- **Sorun → Çözüm:**
  - Sorun (B1, B2): Odak tuzağı yok ve Esc katmanları karışıyor.
  - Çözüm: `x-trap.inert.noscroll`, odağın iade edilmesi ve `layers` store'u ile yalnız en üst katmanın kapanması.
- **Fayda:** Klavye ve ekran okuyucu kullanılabilirliği.
- **Risk:** Mevcut `@keydown.escape.window` dinleyicileri çakışabilir; 10 dinleyici tek tek taşınacak.
- **Bağımlılık:** FE-02.
- **Başarı ölçütü:** Playwright'ta Tab odağı modal dışına çıkmıyor; Esc yalnız üstteki katmanı kapatıyor; odak tetikleyiciye dönüyor.

**FE-04 · Sayfaların yeni dile taşınması** — Öncelik: **Yüksek**

- **Dosyalar:**
  - Bölüm 3'teki tüm "Yarı" ve "Eski" sayfalar.
  - `resources/views/pages/{home,series_list,series_detail,chapter_reader,bookmarks,auth/*,profile/settings,errors/*}.edge`, `partials/{navbar,footer}.edge`
- **Sorun → Çözüm:** Bölüm 3'teki sayfa tablosu uygulanacak. Ana sayfa merlintoon akışına göre düzenlenecek; bölümler Tema Ayarları'ndan açılıp kapatılabilecek. Navbar'a "Seriler ▾" açılır menüsü ve `aria-current` eklenecek. A1 (fazla `</div>`), A6 (onay), A7 (sessiz hatalar) ve B3 (rol hataları) düzeltilecek.
- **Fayda:** Bütünlüklü tasarım; mevcut hatalar giderilir.
- **Risk:** Ana sayfadaki yeni bölümler ek sorgu getirir. Her bölüm sınırlı (`limit`) olacak ve ayrı ölçülecek.
- **Bağımlılık:** FE-01, FE-02, BE-05 (ayarlar).
- **Başarı ölçütü:**
  - Her sayfada tek `<h1>` var.
  - 390 px'te yatay taşma yok.
  - Mevcut 28 test geçiyor ve yeni sayfa testleri ekleniyor.
  - Ana sayfanın sunucu süresi taban ölçümden en çok %20 fazla.

**FE-05 · Admin kabuğu ve formları** — Öncelik: **Yüksek**

- **Dosyalar:** `components/layout/admin.edge`, `pages/admin/**`, `resources/js/components/{multi_select,chapter_form}.js`
- **Sorun → Çözüm:**
  - 4.5'teki kabuk uygulanacak.
  - A4: alan altı hatalar ve girdi geri yükleme `ui/field` ile sağlanacak.
  - B4: adsız düğmeler düzeltilecek.
  - Klavyeyle çoklu seçim ve sayfa sıralama (yukarı/aşağı düğmeleri) eklenecek.
  - Gönderimde yükleme durumu ve çift gönderim koruması eklenecek.
  - Satır içi JS blokları `resources/js/components`'e taşınacak (AGENTS kural 9).
- **Fayda:** Admin işleri hızlanır; hata durumunda veri kaybı biter.
- **Risk:** Bölüm formu en karmaşık ekran. Önce mevcut davranış testle sabitlenecek.
- **Bağımlılık:** FE-02, BE-03 (oturum deposu: uzun girdinin geri gelmesi buna bağlı).
- **Başarı ölçütü:** Geçersiz kayıtta tüm alanlar ve alan hataları geri geliyor (test). Klavyeyle sayfa sıralanabiliyor.

**FE-06 · Hata sayfaları** — Öncelik: **Kritik** (A8 ile birlikte)

- **Dosyalar:** `components/layout/error.edge` (yeni), `pages/errors/*`, `app/exceptions/handler.ts`
- **Sorun → Çözüm:**
  - Sorun: 404/500 sayfaları oturuma bağımlı `main` layout'unu kullandığından üretimde çöküyor.
  - Çözüm: Oturum, CSRF ve `auth` gerektirmeyen sade bir layout; `title` iletilecek; hata ayrıntısı üretimde gösterilmeyecek.
- **Fayda:** Bilinmeyen adresler doğru şekilde 404 döndürür; bilgi sızıntısı biter.
- **Risk:** Düşük.
- **Bağımlılık:** Yok.
- **Başarı ölçütü:** Üretim modunda `/yok-boyle-sayfa` → 404 HTML; JSON 500 genel mesaj döndürüyor (test).

**FE-07 · JS bölme ve görsel performansı** — Öncelik: **Orta**

- **Dosyalar:** `resources/js/app.js`, `chapter_reader.edge`, seri kartları
- **Sorun → Çözüm:**
  - P4: yorumlar, topluluk ve profil kırpma bileşenleri sayfada gerçekten kullanılınca `import()` ile yüklenecek.
  - P2: okuyucuda `width`/`height` (JOB-03'ün kaydettiği boyutlar); ilk 2 sayfa `eager` + `fetchpriority=high`; kartlarda `srcset`.
  - Okuyucuda yorumlar görünür olunca yüklenecek.
- **Fayda:** Daha küçük ilk JS; daha iyi LCP ve CLS.
- **Risk:** Alpine bileşeni kayıttan önce başlatılırsa hata verir. `Alpine.start()` öncesinde `await` edilecek.
- **Bağımlılık:** JOB-03 (boyut ve küçük resimler).
- **Başarı ölçütü:**
  - Ana sayfa ilk JS boyutu taban ölçüme göre ≥%30 küçük.
  - Okuyucuda CLS < 0.1 (Lighthouse/Playwright).

**FE-08 · Regresyon koruması** — Öncelik: **Orta**

- **Dosyalar:** `scripts/check-design-tokens.mjs`, `scripts/check-mobile-nav.mjs`, `package.json`
- **Sorun → Çözüm:** 4.7 uygulanacak. `test:ui` root ortamında `--no-sandbox` ile çalışacak hale getirilecek (yalnız `CI`/root tespitinde).
- **Fayda:** Eski stiller geri dönmez.
- **Risk:** Yanlış pozitif. İzin listesi bulunacak.
- **Bağımlılık:** FE-01.
- **Başarı ölçütü:** `npm run lint` kontrolü çalıştırıyor; kasıtlı ihlal yakalanıyor.

---

## 6. Backend planı

**BE-01 · Hata işleyicisi** — Öncelik: **Kritik**

- **Dosyalar:** `app/exceptions/handler.ts`
- **Sorun → Çözüm:** S1 ve A8. Üretimde ≥500 durumlarında JSON ve HTML yanıtları genel mesaj verecek; ayrıntılar yalnız günlüğe yazılacak. Durum sayfaları FE-06 layout'unu kullanacak.
- **Fayda:** Bilgi sızıntısı ve 404→500 çöküşü biter.
- **Risk:** Doğrulama hataları (422) ve `E_` kodlu iş hataları etkilenmemeli; yalnız ≥500 genelleştirilecek.
- **Bağımlılık:** FE-06.
- **Başarı ölçütü:** Testler: üretim bayrağıyla 404 HTML; 500 JSON `{"message":"Sunucu hatası"}`; 422 yanıtları değişmedi.

**BE-02 · Gövde ayrıştırıcının sınırlanması** — Öncelik: **Yüksek**

- **Dosyalar:** `config/bodyparser.ts`, yükleme yapan controller'lar (admin seri/bölüm, ayarlar, yorumlar, kozmetik/kart)
- **Sorun → Çözüm:**
  - S2: Genel çok parçalı sınır, en büyük meşru ihtiyaca indirilecek. Bölüm yükleme rotaları için `autoProcess` yalnız bu rotalara açılacak (`processManually` yerine rota listesi). Diğer rotalarda sınır 10 MB olacak.
  - Alternatif: `autoProcess` yalnız giriş gerektiren rotalarda.
- **Fayda:** Girişsiz büyük yükleme ile disk tüketme engellenir.
- **Risk:** Büyük bölüm yüklemesi kırılabilir. Mevcut yükleme testleri ve 150 sayfalık deneme ile doğrulanacak.
- **Bağımlılık:** Yok.
- **Başarı ölçütü:** Girişsiz 50 MB POST geçici klasöre yazılmadan reddediliyor. Admin bölüm yüklemesi çalışıyor.

**BE-03 · Oturum deposu** — Öncelik: **Orta**

- **Dosyalar:** `config/session.ts`, `start/env.ts`, `.env.example`, yeni migration (`sessions` tablosu, yalnız ekleme)
- **Sorun → Çözüm:**
  - Sorun: E-cookie ve G4.
  - Çözüm: Lucid tabanlı veritabanı oturum deposu (paket gerekirse `@adonisjs/session`'ın `database` store'u; yoksa küçük özel store).
  - Varsayılan `SESSION_DRIVER=cookie` korunur. Yeni kurulumlarda ve `.env.example`'da `database` önerilir.
- **Fayda:** Uzun form girdisi kaybolmaz; oturumlar sunucudan iptal edilebilir (askıya alma).
- **Risk:** Geçişte mevcut oturumlar düşer (bir kez yeniden giriş gerekir; remember-me çalışmaya devam eder).
- **Bağımlılık:** DB-02.
- **Başarı ölçütü:** 20 KB roman metniyle başarısız kayıtta metin geri geliyor (test).

**BE-04 · Rol ve izin düzeni** — Öncelik: **Yüksek**

- **Dosyalar:** `start/routes.ts:149-175`, `layout/admin.edge`, `config/roles.ts`
- **Sorun → Çözüm:** G2. Kozmetik ve kart rotaları `role(['admin'])` alacak; menüde editörden gizlenecek. Üye rozetindeki camgöbeği kalıntısı token'a geçecek.
- **Fayda:** Kullanıcının verdiği karar uygulanmış olur.
- **Risk:** Mevcut editörler erişimi kaybeder (karar gereği).
- **Bağımlılık:** Yok.
- **Başarı ölçütü:** Editör `/admin/kozmetikler` → 403 (test); yönetici erişimi sürüyor.

**BE-05 · Ayar servisi ve tema uç noktası** — Öncelik: **Yüksek**

- **Dosyalar:** `app/services/{settings_service,color}.ts`, `app/controllers/{theme_controller,admin/settings_controller}.ts`, `start/{routes,view}.ts`, `config/site.ts`, `pages/admin/settings/theme.edge`, `resources/js/components/theme_settings.js`
- **Sorun → Çözüm:** 4.6'nın tamamı.
- **Fayda:** Logo, renk ve diğer görsel ayarlar panelden değiştirilebilir.
- **Risk:**
  - Önbellek tutarsızlığı. Sürüm ve TTL ile çözülür.
  - Hatalı renk. Kontrast koruması ve "varsayılana dön" ile çözülür.
- **Bağımlılık:** DB-03, FE-01, JOB-03 (logo yeniden kodlama).
- **Başarı ölçütü:** 4.6'daki test listesinin tamamı geçiyor. Panelden renk değişince başka bir tarayıcıda yeniden yüklemede yeni renk görünüyor (tema dosyası `v` değeri değişiyor).

**BE-06 · Önbellek başlıkları** — Öncelik: **Yüksek**

- **Dosyalar:** `config/static.ts`, `app/controllers/media_controller.ts`, `start/routes.ts`
- **Sorun → Çözüm:**
  - P1: Vite'ın hash'li `/assets/*` dosyaları 1 yıl `immutable` olacak.
  - İçerik görselleri `public, max-age=604800` + ETag olacak. Yükleme UUID adlı olduğundan güvenli; aynı adla üzerine yazılan dosya yok.
  - SVG yanıtları sandbox CSP ile sunulacak (S6).
- **Fayda:** Tekrar ziyarette görsel istekleri biter.
- **Risk:** Eski yolda tutulan bir dosya değişirse (seed içeriği) 7 gün eski kalabilir. Seed adları sabit, kabul edilebilir.
- **Bağımlılık:** Yok.
- **Başarı ölçütü:** Yanıt başlıkları testte doğrulanıyor; ikinci ziyarette ağ isteği yok (Playwright).

**BE-07 · Sorgu iyileştirmeleri** — Öncelik: **Orta**

- **Dosyalar:** `recommendation_service.ts`, `library_service.ts`, `silent_auth_middleware.ts`, `progress_service.ts`
- **Sorun → Çözüm:**
  - P6: alt sorgular gruplanmış `left join` ile yazılacak ve DB-01 indeksleri eklenecek.
  - P7: seri başına son okuma için `group by` + `max(read_at)`.
  - P5: menü özeti 30 sn kullanıcı başına bellek önbelleği.
- **Fayda:** Büyük veride sabit süre.
- **Risk:** Sonuç sırası değişebilir. Mevcut testler ve önce/sonra çıktı karşılaştırması yapılacak.
- **Bağımlılık:** DB-01.
- **Başarı ölçütü:** 10k okuma satırlı sentetik veride öneri sorgusu taban ölçüme göre ≥5× hızlı; çıktılar aynı.

**BE-08 · Yarış durumları** — Öncelik: **Orta**

- **Dosyalar:** `card_service.ts`
- **Sorun → Çözüm:** S3. Koşullu güncelleme: `update count=1 where id=? and count=?`; etkilenen satır 0 ise iptal.
- **Fayda:** Parça çoğaltma açığı kapanır.
- **Risk:** Düşük.
- **Bağımlılık:** Yok.
- **Başarı ölçütü:** Eşzamanlı iki çağrıda toplam parça, tek çağrıdakiyle aynı (test).

---

## 7. Veritabanı planı

Tüm migration'lar **yalnız ekleme** yapar ve `down()` içerir. Uygulamadan önce:

- Yerel SQLite yedeği alınır: `tmp/manga.sqlite3.before-00NN.bak`.
- `PRAGMA integrity_check` çalıştırılır.
- Önce/sonra satır sayıları karşılaştırılır.

`migration:fresh`/`db:reset` kullanılmaz.

**DB-01 · Okuma ve kaydetme indeksleri** — Öncelik: **Yüksek**

- **Migration:** `0017_add_library_series_indexes`
  - `chapter_reads(series_id, user_id)`
  - `bookmarks(series_id)`
  - `comments(user_id)` gerekirse; mevcut `(user_id, created_at)` yeterli olduğundan eklenmeyebilir.
- **Risk:** Büyük tabloda indeks oluşturma kısa süre kilitler. Bugünkü veri küçük.
- **Geri dönüş:** `down()` indeksleri düşürür.
- **Başarı ölçütü:** `EXPLAIN QUERY PLAN` öneri sorgusunda indeks kullanıyor.

**DB-02 · Oturum tablosu** — Öncelik: **Orta**

- **Migration:** `0018_create_sessions_table` (`id`, `data`, `expires_at`; indeks `expires_at`). Süresi dolanlar JOB ile temizlenir.
- **Geri dönüş:** `SESSION_DRIVER=cookie` ile anında eski davranışa dönülür; tablo kalabilir.

**DB-03 · Site ayarları** — Öncelik: **Yüksek**

- **Migration:** `0019_create_site_settings`
  - `site_settings`
  - `site_setting_revisions`
  - `content_types.color` (nullable)
- **Geri dönüş:** `down()` tabloları ve sütunu düşürür. Kod, kayıt olmadığında `config/site.ts` varsayılanlarına düşer; tabloların boşaltılması siteyi bugünkü haline döndürür.

**DB-04 · İş kuyruğu** — Öncelik: **Yüksek**

- **Migration:** `0020_create_jobs_table`
  - Alanlar: `id`, `queue`, `name`, `payload` (JSON), `unique_key` (nullable, benzersiz), `status` (pending / running / done / failed / dead), `attempts`, `max_attempts`, `run_at`, `locked_at`, `locked_by`, `last_error`, `created_at`, `updated_at`, `finished_at`.
  - İndeks: `(status, run_at)`.
- **Geri dönüş:** İşçi `JOBS_ENABLED=false` ile kapatılır. İşler istek içi eski yola düşer (aşağıda).

**DB-05 · Görsel boyutları** — Öncelik: **Orta**

- **Migration:** `0021_add_chapter_page_meta`. `chapters.page_meta` JSON (nullable): her sayfa için `w`, `h` ve küçük resim yolu.
- **Geri dönüş:** Sütun boşsa okuyucu bugünkü gibi çalışır.

**DB-06 · SQLite çalışma ayarları** — Öncelik: **Orta**

- **Dosyalar:** `config/database.ts` (`pool.afterCreate` ile `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON` (zaten açık mı kontrol edilecek), `synchronous=NORMAL`)
- **Risk:** WAL, `-wal`/`-shm` dosyaları oluşturur. `.gitignore` ve yedekleme betiği bunları da kapsamalı. Ağ sürücüsünde WAL çalışmaz (README notu).
- **Başarı ölçütü:** Eşzamanlı okuma/yazma testinde `SQLITE_BUSY` yok.

**DB-07 · MySQL uyumu** — Öncelik: **Orta**

- **Dosyalar:** `config/database.ts` (mysql `dateStrings: true`, `charset: 'utf8mb4'`)
- **Risk:** Bu ortamda MySQL yok. Doğrulama "yapılmadı" olarak raporlanır; kullanıcıdan MySQL ile `npm test` istenir.

**DB-08 · Sayaç tutarlılık aracı** — Öncelik: **Düşük**

- **Dosyalar:** `commands/recount.ts` (ace komutu)
- **Çözüm:** Denormalize sayaçları yeniden hesaplar. Varsayılan `--dry-run` farkları raporlar; yalnız onayla yazar.

---

## 8. Arka plan işleri ve entegrasyon

**JOB-01 · Veritabanı tabanlı kuyruk** — Öncelik: **Yüksek**

- **Dosyalar:** `app/jobs/*` (her iş bir sınıf: `name`, `handle(payload)`), `app/services/queue_service.ts`, `providers/queue_provider.ts` (yalnız `web` ortamında işçi başlatır), `config/queue.ts`, `start/env.ts` (`JOBS_ENABLED`, `JOBS_CONCURRENCY`)
- **Tasarım:**
  - **Kuyruğa ekleme:** `queue.dispatch(name, payload, { uniqueKey, runAt, maxAttempts })`. `uniqueKey` ile tekrar eklenen iş yok sayılır (idempotent).
  - **Sahiplenme:** İşçi 1 sn aralıkla tek satırı atomik olarak sahiplenir: `update ... set status='running', locked_by=?, locked_at=now where id=(select id ... where status='pending' and run_at<=now order by run_at limit 1)`. Etkilenen satır 1 ise işi çalıştırır.
  - **Zaman aşımı:** İş başına (varsayılan 60 sn). `locked_at` 10 dakikadan eski `running` işler `pending`'e döndürülür (çöken süreç kurtarma).
  - **Yeniden deneme:** Üstel geri çekilme (30 sn × 2^n, en çok 1 saat). `max_attempts` sonrası `dead`.
  - **Kapanış:** `SIGTERM`'de yeni iş alınmaz, çalışan iş bitirilir.
  - **Bağımlılık:** Yeni paket yok; Windows ve Linux'ta aynı çalışır.
  - **Geri dönüş:** `JOBS_ENABLED=false` iken `dispatch` işi aynı istekte çalıştırır (bugünkü davranış).
- **Risk:** Tek süreç varsayımı. Çok süreçte atomik sahiplenme sayesinde güvenli.
- **Başarı ölçütü:**
  - Testler: aynı `uniqueKey` tek iş üretiyor; hata → yeniden deneme → `dead`; kilitli işin kurtarılması.
  - Eşzamanlı iki işçi aynı işi almıyor.

**JOB-02 · Taşınacak işler** — Öncelik: **Yüksek**

- `notify-new-chapter`: Toplu bildirim, 500'lük gruplar halinde (S4). `uniqueKey = chapter:<id>`.
- `cleanup-files`: Değiştirilen avatar, banner, logo ve kapak dosyalarının gecikmeli silinmesi; yalnız `CONTENT_ROOT` içinde ve DB'de referansı yoksa.
- `process-chapter-images`: JOB-03.
- `prune`: Süresi dolan oturumlar, 90 günden eski okunmuş bildirimler (ayar), `done` işler (7 gün). Zamanlanmış; işçi her saat kendine ekler (`uniqueKey = prune:<saat>`).
- `settings-assets`: Logo/favicon türevleri.

**JOB-03 · `sharp` görsel hattı** — Öncelik: **Yüksek**

- **Dosyalar:** `package.json` (`sharp`; npm ön derlenmiş ikili, Windows x64 ve Linux x64/arm64), `app/services/image_service.ts`, `upload_service.ts`
- **Tasarım:**
  - Yüklemede boyut okunur ve kaydedilir (`page_meta`).
  - Kapak için 360/720 px WebP küçük resimler, bölüm sayfaları için 1080 px WebP üretilir; kuyrukta çalışır.
  - Orijinal korunur.
  - Mevcut 11.851 görsel için `node ace images:backfill --dry-run` önce sayım yapar; onayla parça parça kuyruğa ekler.
  - `srcset` küçük resim yoksa orijinale düşer.
- **Risk:**
  - `sharp` ikilisi indirilemezse kurulum bozulur. `optionalDependencies` değil, normal bağımlılık olarak eklenir; `setup-and-start.mjs` kurulumdan sonra `sharp` yüklemesini dener ve başarısızsa görsel işlemeyi kapatarak uyarı verir.
  - Disk kullanımı artar (~%30). Rapor edilir.
- **Bağımlılık:** JOB-01, DB-05.
- **Başarı ölçütü:**
  - `npm run setup` Linux'ta geçiyor; Windows'ta kullanıcı doğrulaması isteniyor.
  - Yüklenen kapakta 3 dosya oluşuyor.
  - Okuyucu `width`/`height` veriyor.

**JOB-04 · Admin "Arka plan işleri" sayfası** — Öncelik: **Orta**

- **Dosyalar:** `admin/jobs_controller.ts`, `pages/admin/jobs/index.edge`
- **İçerik:** Duruma göre sayımlar, son 100 iş, hata metni (yalnız admin), "yeniden dene" ve "sil (yalnız done/dead)". Yalnız admin.
- **Başarı ölçütü:** Başarısız iş panelden yeniden denenince `done` oluyor (test).

**JOB-05 · Sağlık kontrolü** — Öncelik: **Düşük**

- **Uç nokta:** `/saglik`. DB bağlantısı ve kuyruk gecikmesi (en eski `pending` yaşı) JSON olarak, ayrıntısız döner.

---

## 9. Güvenlik

| ID | Öncelik | İş | Dosyalar | Başarı ölçütü |
| --- | --- | --- | --- | --- |
| SEC-01 | **Kritik** | G1: Üretimde demo seed engeli. `--production --seed` birlikte verilirse seed atlanır ve uyarı basılır. Seed alt sürecine her durumda `NODE_ENV` iletilir. `start.ps1`/`start.sh` davranışı eşdeğer kalır (ortak `.mjs`). | `scripts/setup-and-start.mjs` | `--production --seed --check` demo yönetici oluşturmuyor (betik testi) |
| SEC-02 | **Kritik** | BE-01: Hata ayrıntısı sızıntısı | `handler.ts` | 6. bölümde |
| SEC-03 | Yüksek | BE-02: Kimlik doğrulama öncesi büyük yükleme | `bodyparser.ts` | 6. bölümde |
| SEC-04 | Yüksek | BE-04: Editör yetkisi | `routes.ts` | 6. bölümde |
| SEC-05 | Orta | Satır içi JS kaldırılır (A2/A5, 9× `onsubmit`, `onerror`) → `ui/confirm` ve `x-on`. Ardından **CSP Report-Only** açılır (`script-src 'self'` + Vite nonce, `img-src 'self' data:`, `style-src 'self' 'unsafe-inline'`; Alpine `x-bind:style` gerektiriyor). Bir hafta sonra zorunlu moda geçilir. | `config/shield.ts`, görünümler | CSP raporunda ihlal yok; Alpine'ın CSP derlemesine gerek kalmadığı doğrulanır (`unsafe-eval` gereksinimi: Alpine standart derleme `new Function` kullanır. Gerekirse `@alpinejs/csp`'ye geçiş ayrıca değerlendirilecek; o zamana kadar CSP yalnız raporlama modunda kalır) |
| SEC-06 | Orta | S6: SVG yanıtlarına `Content-Security-Policy: default-src 'none'; sandbox` ve tüm görsellere `X-Content-Type-Options: nosniff` (demo içerik SVG olduğu için SVG kaldırılmaz) | `config/static.ts`, `media_controller.ts` | Test (Faz 1'de tamamlandı) |
| SEC-07 | Orta | Kullanıcıya ait yüklemelerde `sharp` ile yeniden kodlama (EXIF/konum verisi silinir) | `image_service.ts` | Çıktıda EXIF yok |
| SEC-08 | Düşük | Hız sınırlarının DB/kuyruk tablosuna taşınması (çok süreç) | `throttle.ts` | İsteğe bağlı; tek süreçte değişiklik yok |
| SEC-09 | Düşük | Parola sıfırlama ve e-posta doğrulama. Bu plan kapsamında değil; `GELISTIRME_ONERILERI.md`'de kalır (SMTP yapılandırması gerekiyor). | — | — |

---

## 10. Test ve doğrulama stratejisi

**Her fazda:**

1. `npm run typecheck` → `npm run lint` → `npm run setup` (AGENTS kural 2).
2. `npm test`: mevcut 28 test her zaman geçmeli; her görev en az bir yeni test ekler.
3. `npm run build`.

**Taban ölçüm (Faz 1):** `scripts/measure-baseline.mjs` (yeni; yalnız ölçer, yazmaz):

- 6 adres için (ana sayfa, katalog, seri detay, okuyucu, profil, admin panosu) sunucu yanıt süresi: 20 istek, medyan ve p95.
- HTML boyutu, JS/CSS boyutları (gzip).
- Sayfa başına sorgu sayısı (`DB_DEBUG` sayacı).
- Playwright ile LCP/CLS.
- Sonuç `tmp/baseline.json`'a yazılır (repoya eklenmez). Özet AGENTS günlüğüne yazılır.

**Diğer test türleri:**

- **Görsel:** 390/768/1440 px ekran görüntüleri. Her sayfada yatay taşma, konsol hatası ve kırık görsel kontrolü.
- **Erişilebilirlik:** Playwright ile klavye akışı (Tab sırası, modal tuzağı, Esc). `axe-core` yalnız geliştirme bağımlılığı olarak, varsa kurulu Playwright içinde enjekte edilir. Kontrast tablosu `color.ts` birim testiyle sabitlenir.
- **Veri:** Her migration'da önce/sonra satır sayısı, `integrity_check` ve yabancı anahtar kontrolü.
- **Üretim modu:** `NODE_ENV=production` ile 404/500 testleri (functional test içinde handler'ın üretim bayrağı ile).
- **Raporlama kuralı:** Çalıştırılmayan doğrulama (Windows, MySQL, gerçek tarayıcıda dokunmatik) "yapılmadı" olarak yazılır, geçti sayılmaz.

---

## 11. Riskler ve geri dönüş stratejisi

| Risk | Olasılık | Etki | Önlem / geri dönüş |
| --- | --- | --- | --- |
| Tasarım geçişinde sayfa kırılması | Orta | Orta | Faz başına sayfa grubu, ekran görüntüsü karşılaştırması. Git'te faz başına ayrı commit; `git revert` ile geri alınır. |
| Migration'da veri kaybı | Düşük | **Yüksek** | Yalnız ekleme migration'ları, öncesinde `.bak` yedeği, `down()`. Geri dönüş: `migration:rollback --batch` (veri silmeyen tablolar için) ya da yedeğin geri kopyalanması. |
| `sharp` kurulumu başarısız (Windows/ARM) | Düşük | Orta | Kurulumda deneme ve uyarı; görsel işleme kapalıyken site orijinallerle çalışır. |
| Kuyruk işçisi takılır | Düşük | Orta | Kilit zaman aşımı, admin sayfası, `JOBS_ENABLED=false` ile istek içi yola dönüş. |
| Tema ayarı siteyi okunmaz yapar | Orta | Orta | Kontrast koruması, önizleme, "varsayılana dön", sürüm geçmişi. Son çare: `site_settings` satırlarının silinmesi (yalnız ayarlar; içerik etkilenmez). |
| Oturum deposu geçişinde oturumların düşmesi | Yüksek | Düşük | Duyuru; remember-me korunur; `cookie`'ye anında dönüş. |
| CSP'nin Alpine'ı bozması | Orta | Yüksek | Yalnız Report-Only; zorunlu moda kullanıcı onayıyla geçilir. |
| Editörlerin erişim kaybı | Kesin | Düşük | Kullanıcı kararı; günlükte belirtilir. |
| Windows/MySQL doğrulanamaması | Kesin | Orta | Rapor "yapılmadı" der; kullanıcıdan `start.ps1 -Check` ve MySQL `npm test` istenir. |

---

## 12. Önceliklendirilmiş adımlar (fazlar)

Sıra gerekçesi:

- Önce **üretimi etkileyen kritik ve küçük düzeltmeler** gelir (az kod, yüksek risk azaltımı).
- Sonra **token ve ayar altyapısı** gelir; tüm sayfa işleri buna bağlı.
- **Kuyruk ve `sharp`**, görsel ve performans işlerinden önce gelir.
- Her faz kendi başına yayınlanabilir; günlüğe yazılır.

| Faz | Kapsam | Görevler | Çıkış ölçütü |
| --- | --- | --- | --- |
| **1 — Taban ve kritik düzeltmeler** ✅ 2026-10-15 | Ölçüm + üretim güvenliği | `measure-baseline`, SEC-01, BE-01 + FE-06, BE-02, BE-04, BE-08, BE-06 (önbellek başlıkları) | Taban ölçüm kaydedildi; 404/500, seed, editör ve parçalama testleri geçiyor |
| **2 — Tasarım temeli** | Token, zemin, `ui/*` | FE-01, FE-02, FE-03, FE-08 | Token'lar ve bileşenler hazır; kontrol betiği çalışıyor |
| **3 — Tema Ayarları** | Panelden görsel yönetim | DB-03, BE-05 (kuyruk gelmeden logo istek içinde yeniden kodlanır) | 4.6 testleri geçiyor; renk, logo ve bölümler panelden değişiyor |
| **4 — Ortak sayfalar** | Navbar/footer, ana sayfa (merlintoon akışı), katalog, detay, okuyucu, kaydedilenler, giriş, ayarlar | FE-04 | Bölüm 3 hedefleri; 390/1440 px ekran görüntüleri |
| **5 — Admin paneli** | Kabuk, panolar, formlar, sözlükler | FE-05, BE-03 + DB-02 | Admin form testleri; klavye ile kullanım |
| **6 — Veritabanı ve sorgular** | İndeksler, SQLite ayarları, MySQL uyumu, sorgular | DB-01, DB-06, DB-07, BE-07, DB-08 | Taban ölçüme göre sorgu iyileşmesi |
| **7 — Arka plan ve görseller** | Kuyruk, `sharp`, işler sayfası, JS bölme | DB-04, JOB-01..05, DB-05, FE-07, SEC-06, SEC-07 | İş testleri; LCP/CLS ve JS boyutu hedefleri |
| **8 — Sertleştirme ve kapanış** | CSP Report-Only, son ölçüm, belgeler | SEC-05, son taban karşılaştırması, README/AGENTS güncellemesi (kural 9: tema ayarları artık DB'de, varsayılanlar `config/site.ts`'te) | Önce/sonra raporu; açık kalanlar `GELISTIRME_ONERILERI.md`'de |

### Faz durumu

| Faz | Durum | Not |
| --- | --- | --- |
| 1 | ✅ Tamamlandı (2026-10-15) | Ayrıntılar AGENTS.md günlüğünde. Ek: P10 (görsellerde oturum) giderildi; `admin:promote` betiği eklendi. Dosya tabanlı `ace` komutları bu ortamda (jsonschema 1.5.0 + Node 24.21) yüklenemediğinden betik `ace` dışında yazıldı. |
| 1b | Bekliyor | Ek bulgulardan X1–X5, X9, X11 ile Ek A'daki G2 (build içinden göreli DB/içerik yolu), G3 (`db:reset`/`migrate:fresh` onaysız), G19 (düz HTTP'de `secure` çerez yüzünden üretimde girişin bozulması); küçük ve güvenlik/veri odaklı, Faz 2'den önce önerilir. |
| 2–8 | Bekliyor | — |

---

## Ek A — Doğrulanmış bulguların tam listesi (bağımsız doğrulama iş akışı, 2026-10-15)

Aşağıdaki tablolar, iddiaları çürütmeye çalışan doğrulayıcılar ve eksik alan eleştirmeninden geçmiş bulgulardır. Bölüm 2'deki özet tabloların kaynağıdır; kimlikler (A, B, C, D, E, F, G, DS) farklı bir numaralandırmadır. Satır numaraları Faz 1 değişiklikleriyle kayabilir; her görevden önce ilgili satır yeniden okunur.

### A.1 Şablon doğruluğu, inline JS ve formlar (A)

| ID | Önem | Sorun | Kanıt | Durum |
|---|---|---|---|---|
| A1 | Düşük | `series_detail` içinde fazladan `</div>` var; anahtar kelime kartı sidebar'dan taşıyor (her seri sayfasında, keywords hiç boş olmadığı için) | `pages/series_detail.edge`: 23 açılış `<div`, 24 kapanış `</div>`; :209-210; `series_presenter.ts:83-86` | Açık |
| A2 | Düşük | Kapak URL'si inline `onerror` JS dizesine yazılıyor (kural 9). Değer üretilmiş bir yol olduğu için şu an istismar edilemez | `series_detail.edge:10`; `upload_service.ts:33-36` | Açık |
| A3 | Düşük | Sözlük formlarında hata `get(...)` ile dizi olarak basılıyor; `role=alert` yok, mesaj iki kez görünüyor | `admin/{genres,content_types}/form.edge:21-22`, `{authors,artists}/form.edge:20-21`; karşılaştırma: `components/field_error.edge:2` | Açık |
| A4 | Orta | Seri ve bölüm formlarında alan altı hata yok. Hata sonrası çoğu alan geri yüklenmiyor (select'ler, ilişkiler, bölüm alanlarının hepsi). Mesajlar ham anahtar gösteriyor (`publication_year`), `range` için Türkçe mesaj yok | `admin/series/form.edge:38,58,69,80,88,124,311,354,397`; `admin/chapters/form.edge:13,49,57,134`; `start/validator.ts` | Açık |
| A5 | Düşük | İstek kaynaklı değer `x-data` JS dizesine yazılıyor (en kötü ihtimalle self-XSS) | `admin/cosmetics/form.edge:5-6,13`; ayrıca `series/form.edge:212,260`, `series_detail.edge:10`; sabit değerli ihlaller: `cosmetics/index.edge:28`, `account_menu.edge:133,151` | Açık |
| A6 | Orta | "Hepsini Kaldır" onay ve geri alma olmadan tüm kayıtları siliyor | `bookmarks.edge:11-17`; `bookmarks.js:82-86` | Açık |
| A7 | Düşük | `failed` durumu hiç gösterilmiyor; arama hatası "Sonuç bulunamadı" olarak görünüyor | `bookmarks.js:94,122,136`; `series_detail.edge:92-102`; `nav_search.js:21-25`; `navbar.edge:60-61,150-151` | Açık |
| A8 | Yüksek | Hata sayfaları başlığı layout'a aktarmıyordu; üretimde bilinmeyen URL 500 dönüp hata metni sızdırıyordu | `handler.ts` artık `renderPage` + `layout/error` kullanıyor | Giderildi (Faz 1a) |
| A9 | Orta | Cookie session ile uzun admin girdisi (bölüm metni, `page_order`) flash edildiğinde ~4 KB çerez sınırı aşılıyor; hata özeti ve girdi sessizce kayboluyor (tarayıcıda yeniden üretilmedi) | `config/session.ts:37-45`; `validators/admin.ts:10,31,32` | Açık |
| A10 | Düşük | `clearAll` her öğede hatayı sıfırladığı için ara hatalar gizleniyor | `bookmarks.js:73` | Açık |
| A11 | Düşük | Banner yoksa fallback aynı kırık URL'ye düşüyor | `series_detail.edge:7,10` | Açık |

### A.2 Erişilebilirlik ve görsel tutarlılık (B)

| ID | Önem | Sorun | Kanıt | Durum |
|---|---|---|---|---|
| B1 | Orta | 7 dialog'da focus trap, odak taşıma, odak iadesi ve scroll kilidi yok; kart açılışında `role`/`aria-modal` eksik | `auth_modal.edge:7-8`, `inbox.edge:3-4`, `inventory.edge:3-4`, `cosmetics/index.edge:117`, `cards/index.edge:52-54`, `settings.edge:129`, `comments/section.edge:177`; `package.json` içinde `@alpinejs/focus` yok | Açık |
| B2 | Düşük | 10 pencere düzeyi Esc dinleyicisi var: zil ve mobil menü birlikte kapanıyor, dialog içindeki dropdown Esc ile tüm dialog'u kapatıyor | `navbar.edge:5,77`, `inbox.edge:42`, `cosmetics/index.edge:37`, `settings.edge:75,86` | Açık |
| B3 | Düşük | 7 `tablist` var ama hiç `tabpanel` yok; filtreler sekme gibi işaretlenmiş; hesap menüsünde `role=menu` yanlış | `cards/index.edge:27`, `recommendations.edge:14`, `settings.edge:14`, `profile/show.edge:129`, `comments/section.edge:14`, `inbox.edge:10`, `inventory.edge:10`, `account_menu.edge:29` | Açık |
| B4 | Düşük | `×` butonlarının adı anlamsız; sayfa silme butonunun adı yok ve klavye odağında görünmüyor | `admin/flash_messages.edge:15,22,29`; `series/form.edge:112,160,322,365,408`; `chapters/form.edge:119-121` | Açık |
| B5 | Orta | `text-gray-500` %3.97 kontrastla AA'yı geçmiyor (100 kullanım); `gray-600` 2.54 | `tailwindcss/theme.css:230-232`; `series_detail.edge:185-207`, `footer.edge:10`, `errors/*:5` | Açık (footer düzeltildi) |
| B6 | Düşük | Tür ve durum renk eşlemeleri 5–7 kopya halinde; aynı rozet `series_list`'te durum, diğer sayfalarda tür anlamına geliyor | `home.edge:75-88,171-191`, `series_detail.edge:42-56,237-246`, `bookmarks.edge:46-52`, `series_list.edge:154`, `series_row.edge:3` | Açık |
| B7 | Düşük | İki ayrı toast sistemi var (konum, palet, ARIA ve süre farklı) | `flash_toast.edge:2-4`, `admin/flash_messages.edge:12`, `community/toast.edge:2-10`, `community.js:333` | Açık |
| B8 | Düşük | Navbar'da aktif sayfa ve `aria-current` yok; admin sidebar'da da `aria-current` yok | `navbar.edge:22-28,112-118`; `layout/admin.edge:27-66` | Açık |
| B9 | Düşük | Kırpma dialogunda cyan kalıntı; üye rozeti cyan | `settings.edge:139`; `config/roles.ts:5` | Açık |
| B10 | Düşük | Birincil buton 5 farklı görünümde; input 4 farklı stilde; `.btn-green` ve `.pill-active` emerald değil green-600 | `app.css:79-83,119-127`; ~32 eski input | Açık |
| B11 | Orta | Emerald/green/teal/orange/sky üzerinde beyaz metin AA'yı geçmiyor (2.47–4.02); `lv-badge` tier1 4.42 | `account_menu.edge:187`, `composer.edge:89`, `login_form.edge:21`, `app.css:81,120,136-141` | Açık |
| B12 | Düşük | "İçeriğe geç" bağlantısı yok; `<main>` öğesinde id yok | `layout/main.edge:14-31` | Açık |
| B13 | Düşük | Kırpma konumlandırması yalnız işaretçiyle yapılabiliyor (klavye alternatifi yok) | `settings.edge:133-135` | Açık |
| B14 | Düşük | Admin klavye engelleri: çoklu seçim `div` ile yapılmış, sayfa sırası yalnız sürükle-bırak, gizli sidebar sekme sırasında kalıyor | `series/form.edge:317,360,403`; `chapters/form.edge:104-108`; `layout/admin.edge:16-17` | Açık |
| B15 | Düşük | Flash ve toast duyurulmuyor; hata toast'ı 3.5 saniyede kendiliğinden kapanıyor | `admin/flash_messages.edge:12,19,26`; `community.js:333` | Açık |
| B16 | Düşük | Geçmiş sayfasındaki kapak bağlantısının erişilebilir adı yok | `discover/history.edge:19-21` | Açık |
| B17 | Düşük | Satır içi SVG'lerin 64/74'ünde `aria-hidden` yok (tasarım önerisi taraması) | `resources/views/**` | Açık |

### A.3 Frontend performansı ve varlıklar (C)

| ID | Önem | Sorun | Kanıt | Durum |
|---|---|---|---|---|
| C1 | Düşük | Hash'li asset'ler `max-age=0` ile sunuluyordu | `config/static.ts` artık `headers()` kullanıyor | Giderildi |
| C2 | Orta | Router'dan sunulan görsellerde ETag/Cache-Control yoktu | `media_controller.ts` `serveContent`: Cache-Control + `download(path, true)` | Giderildi |
| C3 | Orta | Üretimde her görsel tam router yığınından geçiyor, `progress.summary` çalıştırıyordu | `content_middleware.ts` artık router'dan önce sunuyor | Giderildi (yedek `/content/*` rotası duruyor) |
| C4 | Düşük | Tek JS paketi (74.6 KB, gzip 26 KB); uygulama kodu ~28 KB | `app.js:1-19` | Açık (düşük getiri) |
| C5 | Düşük | Tekrarlanan kartlarda glass/blur kullanılıyor (Safari'de pahalı; görselin arkasında boşa) | `series_list.edge:143-145`, `home.edge:159-160`, `bookmarks.edge:33-36`, `series_detail.edge:132-136,227-229` | Açık |
| C6 | Düşük | Sonsuz `fx` animasyonları (6 efekt) | `app.css:194-282`; reduced-motion kuralı var (`:580-585`) | Açık (düşük) |
| C7 | Orta | Okuyucunun ilk sayfası lazy yükleniyor, görsellerde boyut yok; hero ve banner'da `fetchpriority` yok; katalog ilk satırı lazy | `chapter_reader.edge:25-31`, `home.edge:42-70`, `series_detail.edge:6-11,25-30`, `series_list.edge:150` | Açık |
| C8 | Orta | Kapak, sayfa, yorum ve kart görselleri işlenmeden tam boyutta sunuluyor (ör. 4.8 MB PNG `max-h-96` içinde gösteriliyor) | `upload_service.ts:13,33-34`; `comment_controller.ts:12`; `public/content/comments/63f8…png` | Açık |
| C9 | Düşük | Yorumlar görünürlükten bağımsız olarak hemen yükleniyor | `comments.js:68-71,87-95` | Açık |
| C10 | Düşük | `prose` sınıfları çalışmıyor (typography eklentisi kurulu değil) | `chapter_reader.edge:39`; build CSS'te `prose` 0 kez geçiyor | Açık |
| C11 | Düşük | `check-mobile-nav` Playwright Chromium'u bulamıyor; root olarak `--no-sandbox` yok | `scripts/check-mobile-nav.mjs:21-35,57-69` | Açık |
| C12 | Orta | Prod CSS'te önekli `backdrop-filter` öne alınıyor ve Lightning CSS önek-siz satırı düşürüyor; Chromium'da blur yok, dev ve prod farklı görünüyor | `app.css:35-36,41-42`; `build/public/assets/app-*.css` | Açık |
| C13 | Orta | HTML/CSS/JS/JSON yanıtlarında sıkıştırma yok (CSS 110.6 KB → gzip 17.8 KB) | `start/kernel.ts` server stack | Açık |
| C14 | Düşük | Seri kapağında boyut olmadığı için mobilde CLS oluşuyor | `series_detail.edge:24-30` | Açık |

### A.4 Backend sorguları ve katman yapısı (D)

| ID | Önem | Sorun | Kanıt | Durum |
|---|---|---|---|---|
| D1 | Düşük | Seri detayı: misafir 20, üye 26 sorgu; 8'i tekrar, 3'ü kullanılmayan preload | `series_controller.ts:77-85`; `series_service.ts:19-47,204-226` | Açık |
| D2 | Düşük | Okuyucu: misafir 12, üye 18–28 sorgu; ~7'si gereksiz; `summary` iki kez çalışıyor | `chapter_controller.ts:11-30`; `series_service.ts:57-70` | Açık |
| D3 | Düşük | Gereksiz bölüm yüklemeleri: yorum kaydı, `recentByUser`, dashboard. Admin bölüm listesi içeriğe gerçekten ihtiyaç duyuyor | `comment_controller.ts:78-83`; `comment_service.ts:271`; `dashboard_controller.ts:26-29` | Açık |
| D4 | Yüksek | `popular()` her seri için `chapter_reads`/`bookmarks` korelasyonlu COUNT çalıştırıyor, `series_id` indeksi yok. 500 seri/300 bin okumada 6.9 sn sürüyor ve senkron better-sqlite3 tüm siteyi kilitliyor; indeksle 19 ms | `recommendation_service.ts:5-8,70-75`; `0014:23,50-51` | Açık |
| D5 | Düşük | Geçmiş `limit(2000)` + JS ile tekilleştirme; 2000'den fazla okumada yanlış sonuç | `library_service.ts:68-104` | Açık |
| D6 | Düşük | Kozmetik mağazası her görüntülemede tam tablo GROUP BY yapıyor | `cosmetic_service.ts:137-161` | Açık |
| D7 | Düşük | `evaluate` tetikleyen metriği bilmiyor; oy throttle'ı yok | `progress_service.ts:68-99`; `comment_service.ts:235-238` | Açık |
| D8 | Düşük | Profil: 3 tekrar COUNT, tüm kart koleksiyonu ve kullanılmayan preload'lar (~7 gereksiz sorgu) | `account_controller.ts:34-69`; `card_service.ts:66-96`; `comment_service.ts:272` | Açık |
| D9 | Düşük | 4 sözlük controller'ı kopya; `toIso` ve sayaç yardımcıları kopya | `admin/{genre,author,artist,content_type}_controller.ts`; `comment_service.ts:25`; `notification_service.ts:21` | Açık |
| D10 | Düşük | JSON hata biçimi 4 farklı şekilde; seri ve bölüm 404'leri düz metin | `comment_controller.ts:49…`; `series_controller.ts:80`; `chapter_controller.ts:10,14,19` | Açık |
| D11 | Düşük | `importLocal` öğe başına sorgu çalıştırıyor, tek uzun transaction (SQLite'ı kilitliyor) | `library_service.ts:180-219`; `library_controller.ts:12-27` | Açık |
| — | — | "JSON 500 ham SQL sızdırıyor" iddiası | `handler.ts` `renderErrorAsJSON` → `GENERIC_SERVER_ERROR` | Çürütüldü/Giderildi (bkz. F2) |

### A.5 Veritabanı (E)

| ID | Önem | Sorun | Kanıt | Durum |
|---|---|---|---|---|
| E1 | Orta | SQLite'ta eksik indeksler: sıcak yolda `chapter_reads(series_id)` ve `bookmarks(series_id)`; cascade/admin yolunda `comment_likes(comment_id)`, `comments(chapter_id)`, `comments(sticker_id)`, `series_authors(author_id)`, `series_artists(artist_id)`. MySQL/InnoDB FK kolonlarını otomatik indeksler | `0014`, `0015:46-48`, `0008/0009:22`, `0011:11` | Açık |
| E2 | Düşük | `chapters.series_id` indeksi `unique(series_id, number)` varken gereksiz | `0006:23-24` | Açık (dokunulmayacak) |
| E3 | Yüksek | MySQL'de `dateStrings` yok: Date nesnesi üzerinde `.replace` çağrısı TypeError atıyor (yorumlar, profil, rozetler 500 dönüyor); `isRecent` NaN olduğu için her istekte `last_seen` UPDATE çalışıyor | `config/database.ts` mysql; `comment_service.ts:25`; `profile/show.edge:6,150`; `rewards/badges.edge:27`; `level.ts:33` | Açık (MySQL'de çalıştırılmadı) |
| E4 | Düşük | SQLite WAL kapalı (busy timeout varsayılanı 5 sn) | `config/database.ts` sqlite | Açık |
| E5 | Düşük | LIKE içinde `%` ve `_` kaçışlanmıyor; MySQL'de JSON kolonu büyük/küçük harfe duyarlı | `series_service.ts:157-160,191-195` | Açık |
| E6 | Orta | Tür/yazar/çizer silinince pivot satırları CASCADE ile sessizce siliniyor; "silinemez" mesajı hiçbir zaman çıkmıyor | `0007/0008/0009:19-21`; `genre_controller.ts:83-88`, `author/artist_controller.ts:79-84` | Açık |
| E7 | Düşük | `root_id` sorgularda kullanılmıyor; kozmetik silinirken `detach()` aynı transaction içinde olmalı | `comment_service.ts:40,162`; `cosmetic_service.ts:256-264` | Açık (tasarım gereği) |
| E8 | Düşük | `remove()` sert/yumuşak silme kararını bellekteki `replyCount` ile veriyor; eşzamanlı eklenen yanıt CASCADE ile silinebilir | `comment_service.ts:246-252`; `0015:33-35` | Açık |
| E9 | Orta | MySQL: `(like_count - dislike_count)` unsigned çıkarma işlemi ERROR 1690 veriyor; `sort=top` 500 dönüyor | `comment_service.ts:116`; `0015:41`; `0016:24` | Açık |
| E10 | Düşük | Bildirim tablosu sınırsız büyüyor: `notifyMany` budama yapmıyor, okunmamışlar hiç silinmiyor | `notification_service.ts:47-80` | Açık |
| E11 | Düşük | `groupLimit` window function istiyor (MySQL 8+); en düşük sürüm belgelenmemiş | `comment_service.ts:104-106` | Açık |

### A.6 Güvenlik, eşzamanlılık ve arka plan (F)

| ID | Önem | Sorun | Kanıt | Durum |
|---|---|---|---|---|
| F1 | Orta | Editör kozmetik/kart yönetebiliyor ve kendine hediye verebiliyordu | `routes.ts:151-183` `.use(middleware.role(['admin']))` | Giderildi (editör 403 testi var) |
| F2 | — | "Üretim 5xx ham mesaj döndürüyor" | `handler.ts` `hideDetails` | Çürütüldü |
| F3 | Yüksek | Bodyparser her multipart parçayı tmp'ye yazıyor ve silmiyor; global limit 200 MB | `upload_gate_middleware.ts` misafirleri ve 12 MB üstünü engelliyor; `config/bodyparser.ts:42,50` hâlâ `autoProcess: true`, `200mb` | Kısmen (üye red ve hata yolları hâlâ tmp sızdırıyor) |
| F4 | Düşük | Kart yarışları | `disassemble` koşullu (`card_service.ts:121`); `give()` select-then-insert yapıyor (`:23-35`); `craft` parçaları ayrı transaction'da harcıyor | Kısmen |
| F5 | Orta | Parola veya e-posta değişince remember-me token'ları ve oturum geçersiz kılınmıyor (G4 ile aynı) | `account_controller.ts:149-159,135-147`; karşılaştırma: `admin/user_controller.ts:60` | Açık |
| F6 | — | `--production --seed` demo yönetici oluşturuyor | `setup-and-start.mjs:165-171` seed'i atlıyor | Çürütüldü. Kalan: daha önce seed'lenmiş DB'deki `admin@admin.com/admin` algılanmıyor |
| F7 | Düşük | Seri/bölüm silme, kapak/banner değiştirme ve sayfa düzenleme eski dosyaları yetim bırakıyor | `admin/chapter_controller.ts:160-165`; `admin/series_controller.ts:89-93,177-182` | Açık |
| F8 | Düşük | Dosyalar transaction'dan önce kaydediliyor; transaction başarısız olursa geri alınmıyor | `admin/chapter_controller.ts:65-86`; `series_controller.ts:89-103` (doğru örnek: `card_controller.save`) | Açık |
| F9 | Düşük | `announce` istek içinde çalışıyor; hata verirse kayıtlı bölüm 500 dönüyor ve tekrar deneme "numara mevcut" hatasına düşüyor | `admin/chapter_controller.ts:123-128` | Açık |
| F10 | Orta | Oy, import, craft/disassemble, avatar/banner ve `current_password` uç noktalarında throttle yok | `comment_controller.ts:131-139`; `account_controller.ts:135-159` | Açık |
| F11 | Düşük | `/content` altındaki SVG | `config/static.ts` `svgHeaders` (sandbox CSP), `nosniff` | Giderildi |
| F12 | Düşük | Kozmetik önbelleği yükleme sürerken `invalidate` çağrılırsa bayat değer yazılabiliyor | `cosmetic_service.ts:51-71` | Açık |
| F13 | Düşük | Zamanlanmış veya bakım işi yok | grep: scheduler/queue yok | Açık |
| F14 | Düşük | CSP kapalı; 12 inline `onerror`, 9 `onsubmit` | `config/shield.ts`; `resources/views` | Açık |
| F15 | Orta | Kozmetik önbelleği reddedilmiş promise'i sonsuza dek tutuyor; tek bir DB hatası her isteği yeniden başlatmaya kadar bozuyor | `cosmetic_service.ts:53-61` (`catch` yok); `silent_auth_middleware.ts:15` | Açık |
| F16 | Orta | Başarılı giriş aynı IP'nin sayacını sıfırlıyor; saldırgan kendi hesabıyla sınırı aşabiliyor | `auth_controller.ts:51,70` | Açık |
| F17 | Düşük | Yorum hız sınırı paralel isteklerle aşılabiliyor (kayıt geç yapılıyor) | `comment_controller.ts:56,105` | Açık |
| F18 | Düşük | Reddedilen veya geçersiz üye yüklemeleri tmp dosyası bırakıyor | `bodyparser_middleware-*.js:1095-1105` | Açık |

### A.7 Eleştirmenin belirlediği eksik alanlar (G)

| ID | Önem | Sorun | Kanıt |
|---|---|---|---|
| G1 | Yüksek | Topluluk sisteminin tamamı ve 0012–0016 migration'ları commit edilmemiş; son commit v0.8.2 | `git status`: `?? app/controllers/account_controller.ts`, `?? database/migrations/0012..0016`; diff 62 dosya |
| G2 | Yüksek | `build/` içinden `npm start` çalışırsa DB ve içerik göreli yollara yazılıyor ve sonraki build bunları siliyor | `config/database.ts:7-17`; `config/content.ts:9`; `start/env.ts:26-28` |
| G3 | Yüksek | `npm run db:reset` ve `migrate:fresh` onay sormuyor; `.env` NODE_ENV=development olduğu için koruma devreye girmiyor | `package.json:21-22` (`migrate:fresh`, `db:reset`) |
| G4 | Orta | = F5 | — |
| G5 | Orta | `trustProxy` tanımsız; giriş sınırı yalnız IP'ye bağlı, hesap bazlı sınır yok | `config/app.ts:18-40`; `auth_controller.ts:51,86` |
| G6 | Orta | Canonical, OG, JSON-LD, robots ve sitemap yok; özel sayfalarda noindex yok; meta description 50 bin karaktere kadar çıkabiliyor | `layout/main.edge:6-10`; `series_controller.ts:89`; `layout/admin.edge:1-7` |
| G7 | Düşük | favicon, manifest ve theme-color yok; `/favicon.ico` tam 404 render ediyor | `public/`; `main.edge:3-12` |
| G8 | Orta | Health endpoint yok; request-id görünmüyor; çıplak `catch {}` blokları hataları yanlış raporluyor; yavaş sorgu logu yok | `genre_controller.ts:84-87`; `progress_service.ts:82`; `library_service.ts:61,114` |
| G9 | Düşük | Env şeması eksik: `APP_NAME` yok, `LOG_LEVEL` serbest, TZ ve `APP_KEY` uzunluğu doğrulanmıyor, mysql DB_* zorunlu değil | `start/env.ts:15-34`; `config/logger.ts:16` |
| G10 | Orta | Tarih ayrıştırma tutarsız (yerel saat ve UTC karışık); "Bugün" 24 saatlik pencereyle hesaplanıyor; `toIso` 5 kopya | `series_presenter.ts:101-108`; `level.ts:31-34` |
| G11 | Orta | CSRF süresi dolunca hata gösterilmiyor; uzun bölüm yüklemesi sessizce kayboluyor; fetch 419'u ayrı ele almıyor | `config/session.ts:19`; `flash_toast.edge:1` |
| G12 | Orta | `chapter_form.js` önizlemelerde `readAsDataURL` kullanıyor (500 sayfa × 10 MB belleğe), boyut ön kontrolü yok, sessizce atlıyor, çift gönderim koruması yok | `chapter_form.js:40-53,78-91` |
| G13 | Düşük | `librarySync` 1000 kaydı gönderip tüm yerel anahtarları siliyor; fazlası kayboluyor | `library.js:205-226` |
| G14 | Düşük | `nav_search` abort yok; slider gizli sekmede çalışıyor; `profile_settings` busy yarışı | `nav_search.js:9-29`; `hero_slider.js:12-34`; `profile_settings.js:137-182` |
| G15 | Düşük | = A5 | — |
| G16 | Düşük | Türkçe büyük/küçük harf duyarsız arama yok; `toLowerCase('tr')` yok; sayılar tr-TR biçiminde değil; tür etiketi slug'dan üretiliyor | `series_service.ts:157-160,196`; `chapter_list.js:30-31`; `avatar.edge:14` |
| G17 | Orta | MySQL'de `description` TEXT (65 KB) ile 50 bin karakter çok baytlı metinde taşıyor; charset tanımsız | `0005:11`; `validators/admin.ts:10`; `config/database.ts:31-37` |
| G18 | Orta | Başlatıcı eşitliği: Linux'ta sudo/NodeSource zorunlu, `.gitattributes` yok, `start.ps1` BOM'suz, `--skip-install` iletilmiyor, HOST/PORT yok sayılıyor, `npm install` lockfile'ı değiştirebiliyor | `start.sh:10-41`; `start.ps1:1-6,78-81`; `setup-and-start.mjs:12,131,192,204` |
| G19 | Orta | Bağımsız dağıtım tarifi yok; `admin:promote` devDependency'ye bağlı; düz HTTP'de `secure` çerez nedeniyle giriş bozuluyor; Windows'ta Ctrl+C terminate çağırmıyor | `setup-and-start.mjs:188-202`; `promote-admin.mjs:10`; `config/app.ts:37` |
| G20 | Orta | Yedek ve geri yükleme betiği yok; DB ve tek yedek `tmp/` içinde | `tmp/manga.sqlite3*`; `README.md:58` |
| G21 | Orta | Test edilmemiş akışlar: silme, sözlük CRUD, katalog filtreleri, novel, e-posta değişimi, remember-me, CSRF süresi, 413, MySQL; CI yok | `tests/functional/catalog.spec.ts:158-165` |
| G22 | Düşük | README ile kod arasında çelişkiler; sürüm hâlâ 0.8.2 | `README.md:54,86,95,131,144` |
| G23 | Düşük | `RoleMiddleware` JSON isteğine HTML 403 dönüyor; süresi dolan remember-me token'ları temizlenmiyor; seeder transaction kullanmıyor | `role_middleware.ts:7-12`; `series_seeder.ts:1197+` |

### A.8 Tasarım sistemi taramasının ek bulguları (DS)

- **DS1:** Eski yüzey renklerinin (`#0d1117`, `#161b22`, `#1c2333` vb.) zemine kontrastı 1.01–1.26; hiyerarşi kurmuyorlar.
- **DS2:** Yaş rozeti `bg-yellow-600/80` üzerinde kontrast ≤ 2.94.
- **DS3:** `x-trap.inert` için `x-teleport="body"` gerekli: cosmetics önizlemesi ve settings editörü `<main>` içinde.
- **DS4:** `admin.edge` içinde `lang="tr"` sabit yazılmış; `site.language` kullanılmalı.

---

### A.9 Doğrulama planlayıcısının karar önerileri ve uygulanacak karşılıkları

| # | Konu | Seçenekler | Öneri |
|---|---|---|---|
| K1 | Tema ve palet | (a) Bu plandaki emerald + `#0a0f18` token seti; (b) önceki onaylı plandaki merlintoon değerleri (`#000022`, `#0fa942`) ve admin "Tema Ayarları"; (c) açık tema | Token mimarisi (a) ile kurulur; değerler CSS değişkeni olduğu için (b)'nin renkleri ve Tema Ayarları sonradan `:root` override ile eklenebilir. Açık tema şimdi yapılmaz, Faz 8'de yeniden değerlendirilir. Sahip varsayılan paleti teyit etmeli. |
| K2 | `sharp` görsel hattı | (a) `sharp` (önceki planda onaylı); (b) yalnız istemci tarafı küçültme; (c) hiçbiri | (a), dinamik import ve `IMAGE_PIPELINE` bayrağıyla; yüklenemezse orijinal görselle devam edilir. `allowScripts` ihtiyacı ve Windows ikili paketi doğrulanmalı. Ara adım olarak (b) Faz 4'te. |
| K3 | Arka plan işleri | (a) DB `jobs` tablosu + preload işçi (önceki planda onaylı); (b) senkron + batching + periyodik bakım | Adım A (b) her durumda Faz 5'te yapılır. (a) yalnız sharp ya da uzun işler devreye girince Faz 6'da; teyit gerekli. Redis veya sistem servisi yok. |
| K4 | Editörün kozmetik/kart yetkisi | (a) Yalnız admin (uygulandı, testli); (b) editöre CRUD açık, hediye kapalı | (a) korunur. |
| K5 | CSP stratejisi | (a) Report-Only + nonce + `'unsafe-eval'`, sonra enforce; (b) `@alpinejs/csp` build'ine geçiş (tüm inline ifadelerin `Alpine.data`'ya taşınması) | (a). (b) her şablona dokunmayı gerektirir ve fayda/maliyet oranı düşük. |
| K6 | Sıkıştırma | (a) npm middleware (tek komutla çalışır); (b) yalnız reverse proxy | (a) bayrakla; proxy kullanılıyorsa `COMPRESSION=off`. |
| K7 | Büyük form girdisi ve cookie session | (a) Büyük alanları flash'tan çıkar + sessionStorage taslağı; (b) session store değiştir (ör. dosya veya DB; sürüm desteği doğrulanmalı) | (a): bağımlılık yok, tek komutla çalışır. |
| K8 | MySQL destek düzeyi | (a) "MySQL 8+ deneysel" olarak belgele; (b) tam destek + CI'da MySQL servisi + `description` için `mediumText` alter | (a); (b) yalnız gerçek kullanım varsa. |
| K9 | Türkçe arama | (a) İstemci normalizasyonu + kaçışlama; (b) normalize arama kolonu (eklemeli migration + backfill) | Şimdilik (a); (b) GELISTIRME_ONERILERI'ne yazılır. |

**Uygulanacak karşılıklar:** K1–K4 için kullanıcının verdiği kararlar geçerlidir: merlintoon paleti ve admin Tema Ayarları (4.6), `sharp`, veritabanı tabanlı kuyruk, editörde kozmetik/kart yetkisi yok. Doğrulayıcının emerald palet önerisi uygulanmaz. K5–K9'daki öneriler, kullanıcı aksini söylemedikçe varsayılan olarak benimsenir. K7 için BE-03 (veritabanı oturum deposu) yerine önce bağımlılıksız (a) seçeneği denenir; yetmezse BE-03 uygulanır.
