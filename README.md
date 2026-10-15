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

Varsayılan adresler: [site](http://localhost:3333), [giriş](http://localhost:3333/giris), [kayıt](http://localhost:3333/kayit), [yönetim paneli](http://localhost:3333/admin). Port `.env` içindeki `PORT` ile değişir.

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

Örnek içerik yalnızca geliştirme içindir. `npm run seed` tekrar çalıştırıldığında mevcut seriler yeniden yazılmaz ve mevcut yöneticinin şifresi sıfırlanmaz. Veritabanı boşken içerik klasörü doluysa seed dosyaları korumak için durur. Demo seed yönetici hesabı `admin@admin.com` / `admin` oluşturur; kullanmadan önce panelden güçlü bir şifreyle değiştirin. Hesap parolaları en az 8 karakterdir. Üretimde demo seed kapalıdır: `--production --seed` (Windows'ta `-Production -Seed`) birlikte verilirse seed adımı uyarıyla atlanır. İlk gerçek yönetici için siteden normal kayıt olun ve sunucuda `npm run admin:promote -- <kullanıcı adı veya e-posta>` komutunu proje klasöründe çalıştırın (aynı `.env` veritabanını kullanır); komut parola istemez, yalnız mevcut hesabın rolünü yükseltir.

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
| `config/roles.ts` | Rol tanımları (`admin`, `editor`, `member`), varsayılan ad/renkler, panel erişen roller ve izin tablosu |
| `database/demo/*`, `database/seeders/social_seeder.ts` | Demo topluluk: kişiler, Türkçe metin havuzu, GIF/SVG üreticileri, yorum zincirleri, kozmetik kataloğu, temizleme |
| `app/services/review_service.ts`, `app/controllers/review_controller.ts` | Puan ve inceleme (özet, liste, faydalı oyu, silme) |
| `config/admin_nav.ts` | Yönetim yan menüsü grupları (Manga, Topluluk, Tema, Kullanıcılar) ve hangi rolün gördüğü |
| `config/theme.ts`, `app/services/{settings,theme}_service.ts` | Tema alanları (renk, düzen, anahtar, hazır tema); `settings` tablosundan okunan site/tema/rol ayarları, doğrulama ve CSS üretimi |
| `app/controllers/{auth,account}_controller.ts` | Üyelik: giriş, kayıt, çıkış, profil, ayarlar ve avatar/banner yükleme |
| `app/middleware/{silent_auth,role}_middleware.ts` | Tüm sayfalarda oturum yükleme ve rol bazlı erişim |
| `app/models/`, `database/migrations/` | Şema, ilişkiler, veri dönüşümleri ve indeksler |
| `resources/views/components/layout/`, `resources/views/partials/` | Ortak sayfa kabukları ve tekrar kullanılabilir şablonlar |
| `resources/js/app.js`, `resources/js/components/` | Alpine kayıt noktası; slider, arama, filtre, kaydetme, bölüm listesi/yükleme ve çoklu seçim modülleri |
| `config/rewards.ts`, `config/cosmetics.ts` | EXP miktarları, seviye eğrisi, rozetler, kart nadirlikleri; kozmetik türleri ve hazır CSS stilleri |
| `app/services/{progress,cosmetic,card,notification,recommendation}_service.ts` | Seviye/günlük giriş/rozet, kozmetik kilitleri ve kuşanma, kart düşmesi/parçalama/üretim, gelen kutusu, öneriler |
| `resources/js/components/community.js` | Hesap menüsü, gelen kutusu, envanter, bildirim balonları, koleksiyon, kartlar ve profil beğenisi |
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
| `npm run seed` | Geliştirme örnekleri (seriler, yönetici ve demo topluluk) |
| `npm run seed:demo` | Yalnız demo topluluğu ekler (mevcut seriler üzerine; bir kez çalışır) |
| `npm run seed:clear` | Demo topluluğu ve oluşturulan dosyalarını siler (gerçek hesaplara dokunmaz) |
| `npm run covers:fetch` | Gerçek kapakları ve alternatif başlıkları AniList'ten indirir (isteğe bağlı) |
| `npm run admin:promote -- <kullanıcı>` | Kayıtlı hesabı yönetici yapar (ilk üretim yöneticisi) |
| `npm run lint`, `npm run typecheck` | Kod ve tip kontrolü |
| `npm run format` | Kaynak biçimlendirme; üretilen klasörler hariç |
| `npm test`, `npm run test:ui` | Otomatik davranış ve tarayıcı kontrolleri |

Mevcut doğrulama sonuçları AGENTS.md günlüğündedir. Bu Windows ortamında Linux ve MySQL çalıştırma doğrulaması yapılmadı; ayrı CI matrisi önerilir.

## Lisans

Projenin mevcut `UNLICENSED` paket tanımı korunmuştur. Önceki belgede belirtildiği gibi eğitim ve kişisel kullanım amacıyla geliştirilmiştir.


## Demo topluluk verisi (canlı site görünümü)

`npm run seed` (veya `start.sh --seed` / `start.ps1 -Seed`) seriler ve yöneticiden sonra `database/seeders/social_seeder.ts` ile sitenin "yaşıyormuş" gibi görünmesini sağlar; mevcut bir veritabanına yalnız bunu eklemek için `npm run seed:demo` yeterlidir. Tek seferliktir (demo hesaplar varsa atlanır) ve üretimde çalışmaz. Aynı tohum aynı toplulukla sonuçlanır.

- **Hesaplar:** 77 demo okur (`*@demo.mangahub.local`, hepsinin parolası `demo1234`): 3 çeviri/editör üyesi, kıdemli okurlar, eleştirmenler, düzenli/gelip geçen/yeni üyeler. Her biri SVG avatar, çoğu banner, biyografi, seviye/EXP, giriş serisi, rozetler, kuşanılmış çerçeve-efekt-duvar kağıdı, kart koleksiyonu, kaydedilen seriler, okuma geçmişi ve gelen kutusuna sahip; bir kısmı "çevrimiçi" görünür.
- **Yorumlar:** ~6.000 yorum, yarısından fazlası yanıt (6 seviyeye kadar zincir, "N yanıt", yanıt bağlamı). Seri sayfaları ve bölümler; üslup farkları (küçük harf, emoji, uzatma), spoiler, silinmiş yorum, çıkartma, 14 farklı **animasyonlu GIF tepkisi** (kahkaha, ağlama, alkış, kalp, ateş, dans…), artı/eksi oylar. Yanıtlar üst yorumun türüne uyar (soruya cevap, esprili yoruma gülme…).
- **Puan ve inceleme:** Her seri için popülerliğine göre onlarca puan (yaklaşık gerçekçi ortalamalar) ve ~800 Türkçe inceleme; tür ve puana göre değişen metinler, başlıklar, faydalı oyları.
- **Test ekipmanı:** 113 ek kozmetik: 24 ad efekti (özel renk geçişi), 28 avatar çerçevesi (halka, kedi kulağı, taç, kanat, alev, yörünge yıldızı, piksel…), 20 duvar kağıdı (şehir, synthwave, seigaiha, manga hız çizgileri…), 41 çıkartma (8'i hareketli GIF). Bazıları rozete (`yorumcu`, `elestirmen`, `okur`) veya hediyeye bağlıdır, yüksek seviyeliler kilitli kalır. 103 kart (her seri için kapaklı ve özel baskı) ile 7 nadirlik.
- **Mevcut hesaplar (admin, kendi hesabınız):** Tüm kozmetikler hediye olarak envantere eklenir, kartların ~%88'i ve her nadirlikten parça verilir, profil beğenisi ve gelen kutusu bildirimleri gelir, mevcut yorumlarınıza demo okurlar yanıt yazar/oy verir. EXP/seviye ve okuma geçmişiniz değişmez.
- **Dosyalar:** `CONTENT_ROOT/seed/` altında (avatar, banner, kozmetik, kart, GIF; git'e girmez). Silmek için `npm run seed:clear`: demo hesaplar, yorumları, puanları, üretilen kozmetik/kartlar ve dosyalar silinir; gerçek hesaplara verilen hediyeler ve bildirimler kalır.
- **Gerçek kapaklar (isteğe bağlı):** `npm run covers:fetch` AniList'in açık API'siyle eşleşen serilerin kapağını (`<tür>/<slug>/cover.jpg`), varsa banner'ını indirir ve alternatif başlıklara (İngilizce/romaji/orijinal ad, eş anlamlılar) ekler; kartlar yeni kapağı izler. `--dry` yalnız eşleşmeleri gösterir, `--restore` oluşturulmuş kapaklara döner, `--no-titles` başlıklara dokunmaz. Görseller yayıncılarına aittir; yalnızca yerel test içindir, yayımlamayın. Ağ yoksa seed yine çalışır (oluşturulmuş kapaklar kalır).

## Üyelik, roller ve profil

- **Hesaplar:** `/giris` ve `/kayit` sayfaları ile menüdeki giriş/kayıt penceresi. Giriş kullanıcı adı veya e-posta ile yapılır, "Beni hatırla" desteklenir. Başarısız girişler ve kayıtlar IP başına süreç içinde sınırlandırılır (çoklu sunucu için ortak depo gerekir).
- **Roller:** `admin` (tüm panel + kullanıcılar), `editor` (seri/bölüm/sözlük yönetimi), `member` (yalnızca site). Rol atama ve hesap askıya alma `/admin/kullanicilar` altındadır; yöneticiler kendi rollerini değiştiremez. Mevcut hesaplar migration ile `admin` olur.
- **Roller sayfası (`/admin/roller`, yalnız yönetici):** Discord benzeri rol listesi (renkli nokta, üye sayısı), seçili rolün adı ve rengi (canlı rozet önizlemesiyle), izinleri (salt okunur) ve üyeleri. Ad ve renk `settings` tablosunda saklanır; rozetler, yorumlar, profil ve kullanıcı listesi bunu kullanır. İzinler koda bağlı sabittir; rol ekleme/silme yoktur.
- **Tema (`/admin/tema/*`, yalnız yönetici):** Altı bölüm: **Genel** (site adı, açıklama, logo), **Renkler** (arka plan, metin, üst menü, alt bilgi, paneller, vurgu: ~35 renk; saydamlık kaydırıcıları; hazır temalar: Varsayılan, Gece Mavisi, Mor, Kızıl, Açık Tema), **Düzen ve Görünüm** (içerik genişliği, köşe yuvarlaklığı, cam bulanıklığı, yazı tipi ve boyutu, arka plan görseli), **Göster / Gizle** (üst menü bağlantıları, arama, zil, ana sayfa bölümleri, seri/okuyucu bölümleri, alt bilgi, efektler), **Duyuru Çubuğu** ve **Gelişmiş** (özel CSS, JSON dışa/içe aktarma, sıfırlama). Alan listesi `config/theme.ts`'te, varsayılan değerler `resources/css/app.css` başındaki `--t-*` değişkenlerindedir; yalnız değişen değerler `settings` tablosuna yazılır ve sayfaya satır içi `<style>` olarak eklenir. Renk/düzen değişiklikleri düzenleyici sayfasında kaydetmeden canlı görünür. Panel temadan etkilenir; okunmaz olursa herhangi bir yönetim adresinin sonuna `?guvenli=1` ekleyin. Yönetim menüsü `config/admin_nav.ts`'ten üretilir; editör yalnız Manga grubunu görür.
- **Profil:** `/uye/:kullanici_adi` herkese açık profil, `/ayarlar` profil (görünen ad, hakkında), hesap (e-posta) ve güvenlik (parola) ayarlarıdır. Avatar ve banner, ayarlar sayfasındaki profil kartından Discord benzeri kırpma penceresiyle yüklenir; görseller `CONTENT_ROOT/avatars` ve `banners` altında UUID adlarıyla saklanır, değiştirilince eskisi silinir.
- **Eski adresler:** `/admin/giris` artık `/giris` sayfasına yönlenir.
- **Kütüphane:** Giriş yapan okurların kaydettikleri (`bookmarks`) ve okudukları bölümler (`chapter_reads`) veritabanında tutulur; bölüm açıldığında sunucu okundu kaydı yazar. Misafirler aynı bilgiyi tarayıcıda (`bookmark:` / `read:` anahtarları) tutar ve giriş yaptıklarında `/kutuphane/aktar` ile hesaba bir kez aktarılır. Seri sayfasında "Okumaya Devam Et", okunan bölümlere işaret ve "Son okunan" etiketi; Kaydedilenler'de devam bağlantısı ve yeni bölüm etiketi gösterilir.
- **Yorumlar:** Seri sayfasında seri geneli, okuyucuda bölüm yorumları (`comments`, `comment_likes`). Sınırsız derinlikte yanıt (görselde 3 seviye girinti; her yanıt neye yanıt olduğunu gösterir, aşağıya bakın), beğeni, spoiler, "En yeni / En beğenilen" sıralaması. Görsel/GIF (JPG, PNG, WebP, GIF; en fazla 8 MB) düğmeyle, sürükle-bırakla veya yapıştırarak eklenir ve `CONTENT_ROOT/comments` altında saklanır. Okumak herkese açık; yazmak, beğenmek giriş ister, kullanıcı başına dakikada 6 yorum sınırı vardır. Sahibi ve yönetici/editör silebilir; yanıtı olan yorum "silindi" olarak yerinde kalır. Yorumlar kart görünümündedir: yazarın duvar kağıdı, avatar çerçevesi, ad efekti, seviye rozeti ve çevrimiçi noktası gösterilir; yanıtlar "Yanıtları görüntüle" ile açılır. Beğeni yerine yukarı/aşağı oy vardır (`comment_likes.value` ±1; "En beğenilen" net puana göre sıralar) ve yorum metin, görsel ya da açılmış bir çıkartma içerebilir. Uç noktalar: `GET /yorumlar`, `GET /yorumlar/:id/yanitlar`, `POST /yorumlar`, `POST /yorumlar/:id/oy` (`value: 1 | -1`), `POST /yorumlar/:id/begen` (eski istemciler için artı oy), `POST /yorumlar/:id/sil`.
- **Yanıtlar neye yanıt?** Her yanıt, üstünde "↩ @kullanıcı kişisine yanıt: "yorumdan bir alıntı"" şeridi gösterir; şeride basınca yanıtlanan yorum vurgulanarak açılır. Silinmiş yoruma, spoiler'a, çıkartmaya ve GIF'e verilen yanıtlar da (alıntı yerine) açıklayıcı metinle gösterilir. Yorum başlığı toplamı "N yorum · M yanıt" olarak böler; profilde "Son etkinlik → Yorumlar" listesi her yanıtın hangi yoruma verildiğini, yazdığı ve aldığı yanıt sayısını gösterir.
- **Puan ve inceleme (`/incelemeler`, seri sayfası):** 1-10 puan ve isteğe bağlı başlık/inceleme (10-4000 karakter, spoiler işareti). Okur başına seri başına bir kayıt; puanı sonradan düzenlemek ilk puan EXP'sini (+15) tekrar vermez. Özet (ortalama, yıldız, dağılım grafiği), "En faydalı / En yeni / En yüksek / En düşük" sıralaması, "Faydalı" oyu (yazara bildirim gider; kendi incelemene oy verilmez), yazar ve yönetim/editör silme. `series.rating_avg/rating_count/review_count` sütunları katalog kartlarında ve sıralamada (`/seriler?order=rating|votes`, ağırlıklı skor) kullanılır. Rozetler: Eleştirmen (5 inceleme), Rehber (20 faydalı oy). Tema → Göster / Gizle'den kapatılabilir.
- **Seri bilgisi bağlantıları:** Tür, yazar, sanatçı ve içerik türü katalogda filtre açar (`/seriler?genre=`, `?author=`, `?artist=`, `?type=`).

## Topluluk: seviye, ödüller, kozmetik ve kartlar

Sitede satın alma ve sanal para yoktur; her şey okuyarak, yorum yazarak, her gün uğrayarak ve rozet kazanarak açılır.

- **EXP ve seviye:** Kayıt +50, yeni bir bölümü ilk kez okumak +10 (hızlı sayfa çevirmeye karşı 20 sn aralık), yorum +5, günlük giriş +20…+50 (7 günlük seri). Seviye eğrisi ve miktarlar `config/rewards.ts` içindedir. Günlük giriş günü `config/site.ts` içindeki `timezone` (varsayılan `Europe/Istanbul`) ile belirlenir.
- **Rozetler (`/rozetler`):** Okunan bölüm, yorum, alınan artı oy, giriş serisi, kart, seviye ve profil beğenisi hedefleri. Rozetler EXP verir; bazı kozmetikler rozete bağlıdır.
- **Kozmetikler (`/kozmetik/cikartmalar|cerceveler|efektler|duvar-kagitlari`):** Avatar çerçevesi, ad efekti, duvar kağıdı (yorum kartı, profil ve menü arka planı) ve yorumlarda kullanılan çıkartmalar. Her öğe seviye, rozet ya da yalnızca yönetici hediyesiyle açılır; "Dene" kendi yorum kartında önizler, "Kuşan" uygular. Envanter penceresi açılmış öğeleri listeler. Yerleşik katalog migration ile eklenir (CSS stilleri `resources/css/app.css`, çıkartmalar `public/images/stickers`); yönetici `/admin/kozmetikler` altından görsel yükleyerek, hazır stil seçerek veya ad efektleri için 2-3 renkli geçiş tanımlayarak yeni öğe ekler, gizler ve üyelere hediye eder.
- **Kartlar (`/kartlar`):** Yeni bölüm okurken %12 olasılıkla, 7 günlük giriş serisinde garantili kart düşer (okunan serinin kartları önceliklidir). Nadirlikler F→R; fazla kopyalar aynı nadirlikte parçaya dönüşür, parçalarla o nadirlikte rastgele (eksiklere öncelikli) kart üretilir. Yönetici `/admin/kartlar` altında kart ekler veya kartı olmayan serilerin kapaklarından toplu kart oluşturur.
- **Gelen kutusu:** Hoş geldin, seviye/rozet/kart/hediye ödülleri, yorum yanıtları, profil beğenileri ve kaydedilen serilerdeki yeni bölümler (yönetimden bölüm eklenince). Filtreler, okundu/okunmadı, tekli ve toplu silme; kullanıcı başına en fazla 300 kayıt tutulur (eski okunmuşlar temizlenir).
- **Menü ve keşif:** Hesap menüsü seviye ilerlemesi, giriş serisi ve "Günlük Giriş" düğmesiyle açılır; bölümler akordeon şeklindedir. `/oneriler` sık okunan türlerdeki yeni serileri ve okunmamış popüler serileri, `/gecmis` okuma geçmişini gösterir. Profilde beğeni, rozetler, istatistikler ve kart vitrini vardır; son 5 dakikada görülen üyeler çevrimiçi sayılır.
