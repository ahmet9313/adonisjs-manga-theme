# Proje Çalışma Kuralları ve Güncelleme Günlüğü

## Tüm geliştiriciler ve yapay zekâlar için zorunlu kurallar

1. Windows ve Linux tek komutla başlangıç akışını her değişiklikte çalışır tutun.
2. Kurulum veya çalışma biçimini etkileyen değişikliklerden sonra sırasıyla `npm run typecheck`, `npm run lint` ve `npm run setup` kontrollerini çalıştırın.
3. Yeni bir sistem bağımlılığı eklemek yerine mümkün olduğunda npm ile platformlar arası çalışan bir çözüm kullanın.
4. `.env` içindeki sırları, yerel veritabanını, `node_modules`, derleme çıktılarını ve üretilen içerikleri repoya eklemeyin.
5. Yapılan her anlamlı güncellemeyi bu dosyanın **Güncelleme günlüğü** bölümüne tarih, özet, etkilenen dosyalar ve doğrulama sonucu ile ekleyin. Projede ikinci bir değişiklik günlüğü oluşturmayın.
6. Başlatma akışını değiştiren kişi hem `start.ps1` hem `start.sh` davranışını eşdeğer tutmak zorundadır.
7. Veri silen migration, `migration:fresh` veya `db:reset` komutlarını açık kullanıcı onayı olmadan çalıştırmayın.
8. Kurulum ve mimari için `README.md`, yapılmamış işler için `GELISTIRME_ONERILERI.md` kullanın. Yeni güncelleme günlüğü oluşturmayın; bu dosyadaki geçmiş kayıtları koruyun.
9. Site seçeneklerini `config/site.ts`, kalıcı içerik yolunu `config/content.ts` altında tutun. Karmaşık tarayıcı davranışlarını `resources/js/components` içinde geliştirin; dinamik metinleri inline JavaScript string'lerine eklemeyin.
10. Otomatik testler yalnızca izole SQLite bellek veritabanı ve `tmp/test-uploads` kullanır. Üretim görsellerini `build` içine taşımayın; seri/bölüm ve ilişki yazmalarında transaction kullanın.

## Hızlı başlatma sözleşmesi

- Windows: `powershell -ExecutionPolicy Bypass -File .\start.ps1`
- Linux: `bash ./start.sh`
- Sadece kurulum/kontrol: Windows'ta `-Check`, Linux'ta `--check`
- Örnek veriler: Windows'ta `-Seed`, Linux'ta `--seed`
- Üretim modu: Windows'ta `-Production`, Linux'ta `--production`

Başlatıcı Node.js 24+ sürümünü kontrol eder, mümkünse işletim sisteminin paket yöneticisiyle kurar, npm paketlerini tamamlar, `.env` ve uygulama anahtarını oluşturur, SQLite klasörünü hazırlar, migration'ları uygular ve sunucuyu başlatır. Varsayılan SQLite'tır; `.env` içinde `DB_CONNECTION=mysql` seçilirse MySQL veritabanı da otomatik oluşturulmaya çalışılır.

## Güncelleme günlüğü

### 2026-09-11 — v0.8.2 sürüm notları

- Modüler yapı: Ortak site/içerik ayarları, giriş doğrulama ve medya servisleri merkezileştirildi; ön yüz davranışları Alpine bileşenlerine ayrıldı. Kurulum ve mimari belgeleri README altında toplandı, gelecek geliştirmeler `GELISTIRME_ONERILERI.md` içinde önceliklendirildi.
- Performans ve veri tutarlılığı: Katalog SQL sayfalama ve toplu ilişki sorgularına geçirildi; katalog indeksleri eklendi. Seri/bölüm işlemleri transaction ile korundu, yükleme doğrulaması ve kalıcı medya sunumu iyileştirildi.
- Arayüz: Mobil navigasyon, arama ve hero carousel düzeltildi. Mobil filtreler, iki satırlı kart başlıkları, dar ekran sayfalaması, bölüm araması boş sonuç mesajı ve kaydedilenler ekranı iyileştirildi. Klavye odağı ve menü erişilebilirliği geliştirildi.
- Kurulum: Windows/Linux ortak tek komutla başlangıç akışı, SQLite varsayılanı ve isteğe bağlı MySQL desteği korundu. Windows taşınabilir Node.js kurulumu ve çift tıklama başlatıcısı mevcut.
- Sürüm dosyaları: `package.json` ve `package-lock.json` sürümü `0.8.2` olarak güncellendi; README'ye sürüm notu bağlantısı eklendi. Ayrıntılı değişiklikler aşağıdaki tarihli kayıtlarda yer alır.
- Önceki doğrulamalar: Tip kontrolü, genel lint, kurulum, üretim derlemesi ve tarayıcı testleri başarılı. Yerel SQLite ve mevcut içerikler korundu. Linux/MySQL çalışma zamanı bu Windows ortamında doğrulanmadı.
- Sürüm doğrulaması: `0.8.2` ile sırasıyla `npm run typecheck`, `npm run lint` ve `npm run setup` geçti; 11 migration ve 6 otomatik test başarılı, üretim derlemesi tamamlandı. Paket ve kilit dosyasının sürümleri eşleşiyor.
- Yayın hedefi: `ahmet9313/adonisjs-manga-theme`; sürüm etiketi `v0.8.2` ve GitHub Release başlığı `MangaHub v0.8.2`.

### 2026-09-11 — Sayfa arayüzü ve mobil yerleşim düzeltmeleri

- Özet: Mobil katalog filtreleri iki sütuna alındı; çoklu seçim etiketleri kısaltıldı, açılır panellerin birbirini kapatması ve Escape ile kapanması sağlandı. Virgülle ayrılan filtre URL'lerinin seçim durumu düzeltildi. Kart başlıkları iki satıra, sayfalama ve detay düğmeleri dar ekranda satır kaydırmaya uyarlandı. Bölüm aramasına boş sonuç mesajı eklendi; boş kaydetme listesinde temizleme düğmesi devre dışı bırakıldı. Okuyucudaki mevcut olmayan yorum özelliğine çağrı kaldırıldı. Koyu yerel form kontrolleri, klavye odak göstergeleri, arama alanı etiketleri ve yönetim menüsü erişilebilirliği iyileştirildi.
- Etkilenen dosyalar: `resources/css/app.css`, `resources/js/components/catalog.js`, `resources/views/pages/{home,series_list,series_detail,bookmarks,chapter_reader}.edge`, `resources/views/components/layout/admin.edge`, `resources/views/partials/admin/pagination.edge`, `AGENTS.md`.
- Doğrulama: Sırasıyla `npm run typecheck`, `npm run lint`, `npm run setup` başarılı; `npm run test:ui` ve `npm run build` geçti. Ana sayfa, katalog, seri detayı, kaydedilenler ve giriş ekranları 320/1440 px boyutlarında kontrol edildi; yatay taşma bulunmadı. Mevcut Edge testi 390/1280 px katalog, detay, manga/novel okuyucu, kaydedilenler ve giriş sayfaları ile 934 px navigasyonu doğruladı; kırık görsel/sayfa hatası bulunmadı, carousel, arama ve kaydetme kontrolleri geçti. Yönetim yerleşimi kaynak üzerinden incelendi; oturum açılmış yönetim ekranları için bu turda görsel test yapılmadı.

### 2026-09-09 — Tek komutla platformlar arası kurulum

- Özet: Windows ve Linux için otomatik gereksinim kontrolü, kurulum, ortam hazırlama, migration ve başlatma akışı eklendi.
- Etkilenen dosyalar: `start.ps1`, `start.sh`, `scripts/setup-and-start.mjs`, `package.json`, `package-lock.json`, `.env.example`, `start/env.ts`, `config/database.ts`, `README.md`, `AGENTS.md`.
- Veritabanı: Sunucu gerektirmeyen SQLite varsayılan yapıldı; MySQL isteğe bağlı olarak korunuyor.
- Doğrulama: Node.js 24.18 ile tip kontrolü geçti; yeni/değişen kaynakların lint kontrolü geçti; PowerShell sözdizimi ve Linux dosyasının LF satır sonları doğrulandı; SQLite üzerinde 10 migration geçti; 53 seri/1.351 bölüm seed edildi ve ikinci seed güvenle atlandı; geliştirme ile üretim sunucularının ana sayfası HTTP 200 döndürdü; üretim derlemesi geçti. Projenin önceden var olan dosyalarında 149 lint hatası ayrıca tespit edildi.

### 2026-09-09 — Windows çift tıklama düzeltmesi

- Özet: `winget` bulunmayan Windows sistemleri için SHA256 doğrulamalı taşınabilir Node.js 24 kurulumu ve hata halinde pencereyi açık tutan `start.cmd` eklendi.
- Etkilenen dosyalar: `start.cmd`, `start.ps1`, `scripts/setup-and-start.mjs`, `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `AGENTS.md`.
- Doğrulama: `winget` bulunmayan Windows Server üzerinde resmi Node.js v24.20 paketi indirildi, SHA256 doğrulandı, proje içine açıldı ve `start.ps1 -Check` başarıyla tamamlandı. `start.cmd` ile geliştirme sunucusu açıldı, ana sayfa HTTP 200 döndürdü ve kapatıldığında 3333 portu temiz biçimde serbest kaldı.

### 2026-09-09 — Mobil navigasyon ve arama düzeltmeleri

- Özet: Hamburger ile mobil menünün ayrı Alpine durumları kullanması düzeltildi; 1024 px altı/yüksek zoom görünümünde mobil navigasyona geçildi; mobil arama, erişilebilirlik nitelikleri, dışarı tıklama ve `x-cloak` desteği eklendi. Arama görsel yolu ve eski/yeni arama yanıtlarının yarış durumu düzeltildi.
- Etkilenen dosyalar: `resources/views/partials/navbar.edge`, `resources/css/app.css`, `app/services/series_service.ts`, `scripts/check-mobile-nav.mjs`, `package.json`, `AGENTS.md`.
- Veritabanı: MySQL'e özel `JSON_SEARCH` kaldırılarak hem SQLite hem MySQL ile çalışan alternatif başlık araması kullanıldı.
- Doğrulama: 390 px mobil, 934 px yüksek zoom ve 1280 px masaüstü headless Edge testleri geçti; menü açılma/kapanma durumu, responsive görünürlük, mobil Naruto araması ve yatay taşma kontrol edildi. `/ara?q=Naruto`, alternatif başlık araması ve seri filtreleme HTTP 200 döndürdü. TypeScript ve kurulum kontrolleri geçti; değişen kaynakların lint kontrolü geçti. Projenin dokunulmayan eski dosyalarında kalan 142 lint hatası nedeniyle genel lint kontrolü başarısız olmaya devam ediyor.

### 2026-09-09 — Hero banner yeniden tasarımı

- Özet: Ana sayfa bannerı sabit ve responsive bir carousel kabuğuyla yeniden kuruldu; slaytların alt alta yığılması önlendi. JavaScript yüklenmeden güvenli ilk slayt görünümü, erişilebilir düğmeler, klavye yön tuşları, mobil kaydırma, etkileşim sırasında otomatik oynatmayı durdurma ve azaltılmış hareket tercihi desteği eklendi.
- Etkilenen dosyalar: `resources/views/pages/home.edge`, `resources/js/app.js`, `scripts/check-mobile-nav.mjs`, `package.json`, `AGENTS.md`.
- Doğrulama: 390 px mobil ve 1440 px masaüstü görsel kontrolleri geçti. Headless Edge testinde 6 slayttan yalnızca birinin görünür olduğu, tüm slaytların katmanlı konumlandığı, görselin yüklendiği, ileri düğmesinin Naruto'dan One Piece'e geçtiği ve yatay taşma olmadığı doğrulandı. TypeScript, üretim derlemesi, değişen kaynakların lint kontrolü ve `npm run setup` geçti. Genel lint, projede önceden bulunan ve bu değişikliklerle ilgisi olmayan 142 hata nedeniyle başarısız olmaya devam ediyor.

### 2026-09-10 — Site incelemesi, modülerleştirme ve otomatik düzeltmeler

- Özet: Kamuya açık ekranlar, yönetim controller/form akışları, model/migration/seed dosyaları, ön yüz, yapılandırma, başlatıcılar ve bulunan proje belgeleri incelendi. README'deki yinelenen ve eski teknoloji/özellik anlatımları tek Türkçe kullanım ve mimari rehberinde toplandı. Uygulanmamış öneriler ayrı `GELISTIRME_ONERILERI.md` dosyasına yazıldı; önceki günlük korundu. Klasörde Git metaverisi bulunmadığından değişiklik öncesi kaynak yedeği `tmp/source-before-review.zip` içine alındı.
- Modüler yapı: Site ayarları `config/site.ts`, medya deposu `config/content.ts`, ortak Edge verisi `start/view.ts` altında toplandı. Sorgu/pagination/slug/tarih yardımcıları ve seri sunum dönüşümleri ayrıldı. Slider, arama, filtre, kaydetme, bölüm listesi, bölüm yükleme ve çoklu seçim Alpine bileşenleri çıkarıldı; okuyucu navigasyonu ortak partial oldu.
- Veritabanı ve performans: Ana sayfa/katalog tam veri tarayıp JavaScript'te dilimlemek yerine SQL sayfalama, bölüm sayısı/son bölüm aggregate'leri ve ilişki başına son üç bölüm preload'u kullanıyor. Tür/benzer seri sorgularında ilişki filtreleri kullanıldı. `0011_add_catalog_indexes.ts` yalnızca dört indeks ekler. Seri/bölüm ve ilişkileri transaction ile kaydedilir. Model sınıfları zaten elle tanımlı olduğu için kullanılmayan, her migration sonrası biçim hatası üreten `database/schema.ts` kaldırıldı; her iki bağlantıda otomatik şema sınıfı üretimi kapatıldı.
- Hata düzeltmeleri: Hatalı sayfa/arama parametreleri normalize edildi, yönetim sayfa boyutu 100 ile sınırlandı, Türkçe/Unicode slug üretimi ve çakışma denetimi iyileştirildi. Seri başlığı ve içerik türü adı değişiminde mevcut slug korunur. Yabancı kayıt ID'leri, bölüm numarası, durumlar ve yükleme içerikleri doğrulanır. Tırnak ve script kapanış metinleri içeren başlıklar güvenli veri nitelikleriyle aktarılır. Kayıtlı serilerde kapak yolları, profil e-posta çakışması, giriş yönlendirmesi, form hatalarının görünürlüğü ve sayfa başlıkları düzeltildi. Yapılandırılmamış logo/sosyal/başvuru bağlantıları artık bozuk istek üretmez.
- Medya ve seed: Yeni yüklemeler raster görsellerle sınırlı, geçerlilik/taşıma sonucu denetimli ve UUID adlarıyla yazılır; sıralama sırasında eski sayfaların üzerine yazılmaz. Örnek seed mevcut içerikleri silmez, mevcut yönetici şifresini sıfırlamaz ve üretimde çalışmaz. CONTENT_ROOT üzerinden kalıcı medya sunumu eklendi; üretim başlatıcısı proje içerik klasörünün mutlak yolunu geçirir. Üretim derlemesi yüklenen içerikleri paketlemez. Windows/Linux aynı ortak başlatma kodunu kullanmayı sürdürür.
- Araçlar ve bağımlılıklar: Eski lint hataları düzeltildi. ESLint tarayıcı/script JavaScript dosyalarını da denetler; `.tools`, `tmp` ve üretilen içerikler kontrol/izleme dışında tutulur. Vite bağımlılık taraması giriş dosyasıyla sınırlandı, test önbelleği ayrıldı. `npm audit fix` mevcut sürüm aralıklarında 14 paket güncelledi ve 1 gereksiz paketi kaldırdı; esbuild kurulum izni kurulu sürüme uyarlandı. Son tam audit 0, üretim bağımlılık audit'i 0 açık bildirdi.
- Etkilenen dosyalar: `app/controllers/*.ts`, `app/controllers/admin/*.ts`, `app/middleware/auth_middleware.ts`, `app/services/{series_service,series_presenter,input_service,upload_service}.ts`, `app/validators/admin.ts`, `config/{site,content,database}.ts`, `start/{env,routes,view}.ts`, `database/migrations/0011_add_catalog_indexes.ts`, `database/seeders/*.ts`, `database/schema.ts` (kaldırıldı), `resources/views/**/*.edge`, `resources/js/app.js`, `resources/js/components/*.js`, `tests/bootstrap.ts`, `tests/unit/input.spec.ts`, `tests/functional/catalog.spec.ts`, `bin/test.ts`, `scripts/{setup-and-start,check-mobile-nav}.mjs`, `adonisrc.ts`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `.prettierignore`, `README.md`, `GELISTIRME_ONERILERI.md`, `AGENTS.md`. Diğer mevcut TypeScript dosyalarında genel lint kaynaklı biçim düzeltmeleri de yapıldı.
- Doğrulama: Node.js 24.20.0 ile sırasıyla `npm run typecheck`, **genel** `npm run lint` ve `npm run setup` geçti. İzole SQLite üzerinde 11 migration ve 6 otomatik test geçti: sayfalama/toplu bölümler, arama/bozuk girdiler, script metinlerinin kaçışı, yönetim giriş/formları, ilişki doğrulama, gerçek PNG yükleme/yeniden sıralama, medya sunumu, yabancı anahtar ve transaction geri alma kontrol edildi. `start.ps1 -Production` kurulum/üretim derlemesi/sunucu akışını tamamladı; 110 kamuya açık URL HTTP 200 döndürdü. Geliştirme ve üretimde Edge ile 390/1280 px katalog, detay, manga/novel okuyucu, kaydedilenler ve giriş ekranları; 934 px navigasyon; carousel, arama ve kaydetme kontrol edildi. Taşma veya kırık görsel bulunmadı. PowerShell sözdizimi ve Linux başlatıcısının LF satır sonları doğrulandı.
- Veri koruma: Yerel SQLite `integrity_check=ok`, yabancı anahtar ihlali 0. Önce/sonra 53 seri, 1.351 bölüm, 26 tür, 51 yazar, 52 çizer ve 5 içerik türü korundu. 11.851 görsel referansında eksik dosya 0. Veri silen migration/reset çalıştırılmadı. Test yazmaları bellek veritabanına ve `tmp/test-uploads` klasörüne yapıldı.
- Sınırlar: Linux ve MySQL bu Windows ortamında çalıştırılarak doğrulanmadı. Üretim dağıtımı yerel HTTP kontrolüdür; gerçek alan adı/HTTPS dağıtımı yapılmadı. Büyük katalog yük testi, tam rol sistemi, yayın iş akışı, medya temizliği ve ileri okuyucu özellikleri öneri belgesinde yer alır.
