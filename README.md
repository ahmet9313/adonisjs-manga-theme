# MangaHub — fansub manga sitesi

Güncel sürüm: **0.8.2** — [Sürüm notları](AGENTS.md#2026-09-11--v082-sürüm-notları).

AdonisJS 7, Lucid, Edge, Alpine.js 3 ve Tailwind CSS 4 üzerinde çalışan Türkçe manga / manhwa / manhua / webtoon / novel okuma ve yönetim uygulaması. Node.js 24+, npm 11+ gerekir. Varsayılan veritabanı SQLite; MySQL 8 isteğe bağlıdır. Paket sürümlerinin kaynağı `package.json` ve `package-lock.json` dosyalarıdır.

## Belgelerin tek giriş noktası

| Belge | Sorumluluğu |
| --- | --- |
| [README.md](README.md) | Kurulum, kullanım, mimari ve bakım rehberi |
| [AGENTS.md](AGENTS.md) | Geliştirme kuralları ve **tek güncelleme günlüğü** |
| [GELISTIRME_ONERILERI.md](GELISTIRME_ONERILERI.md) | Henüz uygulanmamış, önceliklendirilmiş geliştirme önerileri |

İncelemede proje kapsamında bulunan iki Markdown belge bu rehbere göre düzenlendi. Node.js ve npm bağımlılıklarına ait belgeler proje belgesi değildir. Eski README'deki yinelenen İngilizce/Türkçe kurulum adımları birleştirildi; uygulanmamış yıl filtresi ve sayfa sayfa okuyucu gibi özellik iddiaları çıkarıldı. Önceki çalışma kayıtları AGENTS.md içinde korundu.

## Tek komutla başlatma

Windows'ta `start.cmd` dosyasına çift tıklayın veya:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Linux'ta:

```bash
bash ./start.sh
```

| İşlem | Windows seçeneği | Linux seçeneği |
| --- | --- | --- |
| Yalnızca kurulum/kontrol | `-Check` | `--check` |
| Örnek içerik yükleme | `-Seed` | `--seed` |
| Üretim derleme ve sunucu | `-Production` | `--production` |

Başlatıcı Node.js sürümünü kontrol eder; desteklenen sistemlerde kurar, npm paketlerini tamamlar, `.env` ve uygulama anahtarını oluşturur, SQLite klasörünü hazırlar ve yalnızca bekleyen migration'ları uygular. Windows'ta gerektiğinde SHA256 doğrulamalı taşınabilir Node.js `.tools` içine kurulur. İşletim sistemine özgü başlatıcılar aynı `scripts/setup-and-start.mjs` dosyasına bağlanır.

Varsayılan adresler: [site](http://localhost:3333), [yönetim girişi](http://localhost:3333/admin/giris). Port `.env` içindeki `PORT` ile değişir.

Sistemde daha eski Node.js varsa terminalde `npm` komutlarını çalıştırmadan önce Node.js 24+ seçin. Windows taşınabilir kurulumunu mevcut terminalde kullanmak için:

```powershell
$mangaNodeDir = Get-ChildItem -LiteralPath .\.tools -Directory -Filter 'node-v24*-win-*' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
$env:Path = "$mangaNodeDir;$env:Path"
node --version
```

## Veritabanı ve kalıcı içerik

SQLite için ek sunucu kurulmaz: `.env` içinde `DB_CONNECTION=sqlite`, `SQLITE_DB_PATH=tmp/manga.sqlite3`. MySQL için `DB_CONNECTION=mysql` ve `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` ayarlanır. Başlatıcı MySQL veritabanını yoksa oluşturmaya çalışır; bu işlem kullanıcının veritabanı oluşturma yetkisini gerektirir.

Şema; seriler, bölümler, içerik türleri, türler, yazarlar, çizerler, üç ilişki tablosu ve yönetici kullanıcılarından oluşur. Bölüm numarası seri içinde benzersiz ve tam sayıdır; `0` kullanılabilir. Seri silindiğinde bölümleri ve ilişki kayıtları yabancı anahtar kurallarıyla silinir. Kullanımdaki içerik türünün silinmesi engellenir. Dosyalar kayıt silinirken otomatik temizlenmez.

Görsellerin tek depolama ayarı `config/content.ts`, isteğe bağlı ortam değişkeni `CONTENT_ROOT` olur. Geliştirmede varsayılan `public/content`; üretim başlatıcısı da aynı kalıcı klasörün mutlak yolunu kullanır. **Yüklenen içerikler build içine kopyalanmaz.** `/content/*` rotası bu depodan görselleri sunar. Başlatıcı dışında `build` klasöründen çalıştırıyorsanız `CONTENT_ROOT` ve `SQLITE_DB_PATH` için kalıcı, mutlak yollar sağlayın.

Veritabanını, içerik klasörünü ve `.env` dosyasını birlikte yedekleyin. Çalışan SQLite veritabanı için tutarlı çevrim içi yedekleme kullanın veya kopyalamadan önce sunucuyu durdurun. `migration:fresh` ve `db:reset` verileri siler; rutin kurulumun parçası değildir ve açık onay olmadan çalıştırılmaz.

## İçerik yönetimi

Yönetim panelinden içerik türü, tür, yazar, çizer, seri ve bölüm oluşturulabilir. Seri oluştururken ilişkiler seçilir; kapak ve banner isteğe bağlıdır. Kapaksız kayıt ortak yer tutucuyu kullanır. Seri başlığı veya içerik türü adı değiştiğinde mevcut slug korunur. Serinin içerik türünü değiştirmek URL'nin tür kısmını değiştirir; bunun için otomatik yönlendirme henüz yoktur.

Görsel yüklemeleri JPG/JPEG, PNG ve WebP ile sınırlıdır; dosya başına 10 MB, istek başına 200 MB, bölüm başına en fazla 500 sayfa kabul edilir. Yeni dosyalar benzersiz adla yazılır. Bölüm düzenlemede mevcut görsellerin sırası değiştirilebilir; yeni görseller mevcut dosyaların üzerine yazılmaz. Novel bölümlerinde boş olmayan düz metin kullanılır. Önceden üretilmiş güvenilir SVG örnekleri okunabilir; yönetim yüklemeleri SVG kabul etmez.

Örnek içerik yalnızca geliştirme içindir. `npm run seed` tekrar çalıştırıldığında mevcut seriler yeniden yazılmaz ve mevcut yöneticinin şifresi sıfırlanmaz. Veritabanı boşken içerik klasörü doluysa seed dosyaları korumak için durur. Demo seed yönetici hesabı `admin@admin.com` / `admin` oluşturur; kullanmadan önce panelden güçlü bir şifreyle değiştirin. Yeni profil şifreleri en az 12 karakterdir. Üretimde demo seed kapalıdır; ilk gerçek yönetici oluşturma aracı geliştirme önerilerinde yer alır.

## Modül haritası

| Yer | Ne değiştirilir? |
| --- | --- |
| `config/site.ts` | Site adı, açıklama, logo, ekip başvuru adresi, sosyal bağlantılar, durumlar, yaş sınırları, yönetim sayfa boyutları |
| `config/content.ts`, `config/database.ts` | Kalıcı içerik ve veritabanı bağlantısı |
| `start/routes.ts`, `start/kernel.ts`, `start/view.ts` | URL'ler, middleware, ortak şablon verileri |
| `app/controllers/` | İstek/yanıt, ekran akışları ve yönetim işlemleri |
| `app/services/series_service.ts` | Katalog, arama, sayfalama ve toplu bölüm sorguları |
| `app/services/series_presenter.ts` | Modeli ekran verisine dönüştürme ve tarih gösterimi |
| `app/services/input_service.ts` | Ortak sorgu parametreleri, slug, tarih ve sayfalama |
| `app/services/upload_service.ts` | Görsel doğrulama, benzersiz dosya yazma, bölüm sıralaması |
| `app/validators/admin.ts` | Seri ve bölüm form kuralları |
| `app/models/`, `database/migrations/` | Şema, ilişkiler, veri dönüşümleri ve indeksler |
| `resources/views/components/layout/`, `resources/views/partials/` | Ortak sayfa kabukları ve tekrar kullanılabilir şablonlar |
| `resources/js/app.js`, `resources/js/components/` | Alpine kayıt noktası; slider, arama, filtre, kaydetme, bölüm listesi/yükleme ve çoklu seçim modülleri |
| `scripts/setup-and-start.mjs` | Windows/Linux ortak kurulum ve başlatma |
| `tests/`, `scripts/check-mobile-nav.mjs` | Birim, HTTP/veritabanı ve tarayıcı kontrolleri |

Yeni sayfalarda ortak layout ve partial'ları kullanın. Karmaşık etkileşimi Edge içine script olarak eklemek yerine bir Alpine bileşenine taşıyın. Dinamik metni JavaScript string'ine yerleştirmeyin; HTML kaçışı yapılan `data-*` JSON verisiyle aktarın. Seri/bölüm ve ilişki güncellemelerini aynı transaction içinde tutun. Listeleme için tüm kayıtları belleğe almak yerine SQL sayfalama kullanın.

Katalogda seri başlığı/alternatif başlık araması, tür/durum/içerik türü filtreleri ve sıralama vardır. Ana sayfa her seri için son üç bölümü toplu getirir; katalog bölüm sayısını ve son bölüm numarasını SQL içinde hesaplar. Okuyucu dikey görselleri veya düz metni gösterir. Kaydedilenler mevcut tarayıcının localStorage alanındadır; hesaplar arasında eşitlenmez.

## Kontroller

Kurulum veya çalışma davranışını değiştiren güncellemelerden sonra sırasıyla:

```bash
npm run typecheck
npm run lint
npm run setup
```

Ardından değişikliğin kapsamına göre:

```bash
npm test
npm run build
npm run test:ui
```

`npm test`, uygulama veritabanından bağımsız SQLite bellek veritabanı kullanır; HTTP test sunucusu `127.0.0.1:3334`, yükleme çıktıları `tmp/test-uploads` altındadır. Testler gerçek yerel veritabanını sıfırlamaz. `test:ui` için 3333 portunda çalışan sunucu, örnek içerik ve Edge/Chrome/Chromium gerekir. Gerekirse `SMOKE_BASE_URL`, `EDGE_PATH` veya `CHROME_PATH` ayarlanabilir.

| Komut | İşlev |
| --- | --- |
| `npm run setup` | Kurulum ve bekleyen migration'lar, sunucu açılmaz |
| `npm run setup:start` | Kurulum ve geliştirme sunucusu |
| `npm run dev` | Hazır ortamda HMR sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm start` | **build klasöründe** üretim sunucusu |
| `npm run migrate` | Bekleyen migration'lar |
| `npm run seed` | Geliştirme örnekleri |
| `npm run lint`, `npm run typecheck` | Kod ve tip kontrolü |
| `npm run format` | Kaynak biçimlendirme; üretilen klasörler hariç |
| `npm test`, `npm run test:ui` | Otomatik davranış ve tarayıcı kontrolleri |

Mevcut doğrulama sonuçları AGENTS.md günlüğündedir. Bu Windows ortamında Linux ve MySQL çalıştırma doğrulaması yapılmadı; ayrı CI matrisi önerilir.

## Lisans

Projenin mevcut `UNLICENSED` paket tanımı korunmuştur. Önceki belgede belirtildiği gibi eğitim ve kişisel kullanım amacıyla geliştirilmiştir.
