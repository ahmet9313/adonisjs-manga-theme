# MangaHub geliştirme önerileri

Bu belge mevcut kod incelemesinden çıkan **henüz uygulanmamış** işleri içerir. Güncelleme günlüğü değildir; yapılan işler yalnızca [AGENTS.md](AGENTS.md) içine yazılır. Kurulum ve mimari rehberi [README.md](README.md) içindedir.

## Onaylı optimizasyon ve yeniden tasarım planı

Site genelindeki tasarım sistemi (ilk plandaki merlintoon tarzı cam tema yerine uygulanan "Mürekkep & Kâğıt" sistemi; README.md → Tasarım sistemi), yönetimden düzenlenebilir tema ayarları (renk, logo, zemin, rozetler, ana sayfa bölümleri), veritabanı tabanlı arka plan kuyruğu, `sharp` görsel hattı ve güvenlik/performans düzeltmeleri fazlara bölünmüş olarak [OPTIMIZATION_PLAN.md](OPTIMIZATION_PLAN.md) içinde izlenir. Tamamlanan fazlar AGENTS.md günlüğüne yazılır; bu bölümdeki bağlantı plan bitene kadar kalır.

## Öncelik 1 — Yayına hazırlık

| Öneri | Gerekçe / kapsam | Tamamlanma ölçütü |
| --- | --- | --- |
| Ortak giriş sınırı deposu ve ince yetkiler | Giriş/kayıt sınırı süreç belleğindedir; roller üç kademelidir (yönetici/editör/üye). | Çoklu sunucu için ortak sayaç deposu; çevirmen/yükleyici gibi ayrıntılı izinler ve izin bazlı testler. |
| E-posta doğrulama ve parola sıfırlama | Posta altyapısı yok; kayıt e-postası doğrulanmıyor, "şifremi unuttum" akışı yok. | Posta sağlayıcı ayarı (.env), imzalı süreli bağlantılar, doğrulanmamış hesaplar için sınırlar ve testler. |
| Yedekleme ve geri yükleme prosedürü | `npm run db:backup` tutarlı SQLite yedeği alır; görseller ve ortam anahtarı ayrıca korunmalı. | Otomatik zamanlanmış yedek (görseller dahil), geri yükleme provası, saklama süresi ve başarısızlık bildirimi. |
| Üretim dağıtım tarifi | HTTPS, süreç yöneticisi ve kalıcı CONTENT_ROOT işletime göre ayarlanmalı. | Yeniden derleme/yeniden başlatma sonrası yüklemeler ve oturum akışı doğrulanmalı; kurulum sağlık kontrolü belgelenmeli. |
| Windows/Linux + SQLite/MySQL CI matrisi | Doğrulamalar Linux/SQLite'ta yapılıyor; `start.ps1` ve MySQL düzenli denenmiyor (MySQL için `dateStrings`, `utf8mb4` ve imzalı oy sıralaması kodda düzeltildi ama çalıştırılmadı). | Her iki başlatıcıda `--check` eşdeğeri; MySQL 8 üzerinde migration, transaction, toplu bölüm, JSON araması ve uzun açıklama (`text` 64 KB sınırı) testleri. |
| Boş kurulum tarayıcı senaryosu | Mevcut UI kontrolü demo Naruto ve novel verisine dayanıyor. | Sıfır serili ana sayfa, boş filtre sonuçları ve ilk seri/bölüm oluşturma ayrı fixture ile test edilmeli. |

## Öncelik 2 — Fansub iş akışı ve veri modeli

| Öneri | Gerekçe / kapsam | Tamamlanma ölçütü |
| --- | --- | --- |
| İnceleme ve planlı yayın | Taslak var (0021); editör onayı ve belirli tarihte otomatik yayın yok. | Onay akışı ve yayın tarihi tüm katalog/arama/okuyucu sorgularında uygulanmalı. |
| Ekip ve katkı kredileri | Çevirmen, redaktör, temizleyici, dizgici ve ekip adı için alan yok. | Seri/bölüm bazlı katkılar, ekip sayfası ve yönetilebilir başvuru bağlantısı. |
| Bölüm numarası tasarımı | Mevcut şema tam sayıdır; 10.5, özel bölüm ve cilt için alan yok. | Ayrı sıralama alanı ve gösterim etiketiyle eski URL'leri koruyan, veri silmeyen migration. |
| URL geçmişi ve yönlendirmeler | Başlık değişiminde slug korunuyor; içerik türü değişimi URL'nin tür kısmını değiştiriyor. | Eski seri/tür adresleri için 301 kayıtları ve döngü/çakışma testi. |
| Denetim kaydı ve geri alma | Yönetim değişikliklerinin kim/ne zaman bilgisi yok. | Seri/bölüm değişiklik geçmişi; kritik silmeler için çöp kutusu ve geri yükleme. |
| Daha anlaşılır tarih modeli | Modeller timestamp alanlarını string olarak tutuyor. | UTC ve MySQL tarih dönüşümleri netleştirilerek Lucid DateTime alanlarına kontrollü geçiş; mevcut tarihlerin korunduğu test. |

## Öncelik 3 — Okuyucu ve keşif

- **Sayfa düzeyinde ilerleme:** Bölüm düzeyinde okundu/devam et ve hesap senkronizasyonu var; bölüm içindeki sayfa/kaydırma konumu ve "okunmadı olarak işaretle" yok.
- **Okuyucu tercihleri:** Okuma ayarları ve ← → kısayolları var; tercihlerin hesaba yazılması (cihazlar arası) yok.
- **Arama kalitesi:** Türkçe büyük/küçük harf ve aksan davranışı, yazım hatası toleransı, yayın yılı filtresi. Şu an JSON alternatif başlık araması metin eşleşmesi yapıyor; büyük katalogda tam metin indeksleri değerlendirilmeli.
- **SEO ve paylaşım:** Sitemap, robots, canonical adresler, Open Graph görselleri ve yapılandırılmış veri. Alan adı kesinleşmeden sabit üretim URL'si eklenmemeli.
- **Yorumların devamı:** İç içe yorumlar, oylar ve görsel/GIF var; yorum görselleri listede küçük kopyayla gösterilir ve seri/bölüm silinince silinir. Eksikler: GIF arama (Tenor/Giphy; API anahtarı ve dış istek izni gerekir), emoji tepkileri, düzenleme, @bahsetme bildirimleri, şikâyet/rapor kuyruğu ve yönetim paneli moderasyon listesi, spam/kelime filtresi.
- **Bildirimin devamı:** Gelen kutusu, rozetler, incelemeler ve yeni bölüm bildirimleri var. Eksikler: bildirim tercihleri ve abonelikten çıkma, @bahsetme, gerçek zamanlı (SSE/WebSocket) bildirim sayacı, e-posta/push bildirimi.
- **Topluluk sisteminin devamı:** Yerleşik kozmetikler CSS/SVG tabanlıdır; gerçek çizim çerçeve/duvar kağıdı/çıkartma setleri yönetimden yüklenmelidir. Kart sistemi seri kapaklarıyla başlatılabilir; karakter kartı çizimleri, kart detay sayfası, takas ve sezonluk etkinlikler eklenebilir. Ödeme ve sanal para bilerek yoktur (VIP, mağaza, mini oyun ve lonca kapsam dışı); eklenecekse ayrı tasarım ve hukuki değerlendirme gerekir. EXP kötüye kullanımına karşı günlük EXP üst sınırı ve hız sınırlarının ortak depoya taşınması değerlendirilmeli; yüklenen kozmetik görselleri için boyut/oran kontrolü ve küçültme eklenmeli.
- **Sosyal giriş ve 2 adımlı doğrulama:** Google ile giriş (OAuth) ve TOTP; hesap silme/dışa aktarma (KVKK) ve profil resmi için gelişmiş görsel işleme (yeniden boyutlandırma, GIF).
- **Erişilebilirlik:** Yönetim çoklu seçimlerinde tam klavye dolaşımı, odak yönetimi, okuyucuda yükleme durumları; otomatik kontrole ek ekran okuyucu denemesi.

## Öncelik 4 — Ölçek ve bakım

- **Medya yaşam döngüsü:** Değiştirilen/silinen kayıtların dosyaları artık silinir. Kalanlar: bu değişiklikten önce birikmiş sahipsiz dosyalar, kaydedilmeden bırakılan video ve tema görselleri ve `_variants` önbelleğinin büyümesi için önce yalnız raporlayan, sonra onayla temizleyen bir bakım komutu (zamanlanmış görev).
- **Görsel işleme:** Kapak/kart/yorum görsellerinin küçük WebP kopyaları istek anında üretiliyor (`?w=`). Kalanlar: yüklemede yeniden kodlama (10 MB'lık PNG kapakların asıl dosyası hâlâ büyük), okuyucu sayfa görselleri için boyut kaydı (`width`/`height`, kayma) ve küçük kopya, AVIF.
- **Nesne depolama/CDN:** Yerel CONTENT_ROOT sözleşmesini koruyan adaptör; doğrulanmış yükleme, URL üretimi ve önbellek politikası birlikte tasarlanmalı.
- **İçerik servisi:** Seri/bölüm controller'larındaki transaction akışları ileride API ve toplu içe aktarma tarafından paylaşılacaksa ayrı yazma servislerine çıkarılmalı. Küçük sözlük controller'ları ancak iş kuralları gerçekten ortak kaldığı ölçüde birleştirilmeli.
- **Ölçüm ve sınırlar:** Büyük veri fixture'ında sorgu sayısı, yanıt süresi, bellek kullanımı ve p95 ölçülmeli. Yönetim anahtar kelime önerileri ve bölüm seçicileri için büyük katalogda sunucu tarafında arama eklenmeli.
- **Güvenlik başlıkları:** CSP şu an kapalı. Satır içi `on*=` ve `<script>` kalmadı; Alpine'ın standart derlemesi `unsafe-eval` istediği için `@alpinejs/csp` derlemesi ve tema `<style>`'ı için nonce ile önce report-only politika uygulanmalı.
- **Kilitli içerik dosyaları:** `/content/*` herkese açık sunulur; taslak, üyelere özel ve VIP bölümlerin sayfa görselleri ile videoları adresi bilen herkes tarafından açılabilir (seed adları tahmin edilebilir). Bölüm dosyaları erişim denetimli bir rotadan ya da imzalı, süreli adreslerle sunulmalı.
- **EXP kötüye kullanımı:** İncelemeyi silip yeniden puan vermek ilk puan EXP'sini tekrar verir. İlk puan ödülü seri başına bir kez (ödül kaydı) verilmeli.
- **Uzun istek süresi:** Video yüklemesi için HTTP `requestTimeout` bütün rotalarda 3 saat; yavaş gövde ile bağlantı tutmaya açık. Uzun süre yalnız video yükleme rotasına (ya da ters vekilde) verilmeli.
- **Ana sayfa önbelleği:** Misafirden bağımsız ana sayfa bölümleri (tür dizini, ayın okurları, son yorumlar, tamamlananlar) 30–60 sn bellek önbelleğiyle tutulabilir; şu an her istekte ~37 sorgu (indekslerle hepsi hızlı).
- **Sözlük kopyaları:** Tür/yazar/çizer/içerik türü controller'ları neredeyse aynı; ortak bir sözlük denetleyicisi ve otomatik doldurucunun "Chu-Gong = Chugong" kuralıyla aynı yinelenme denetimi kullanılmalı.
- **Formlarda geri bildirim:** Doğrulama sonrası bütün çoklu seçim/tag alanlarının gönderilen değerlerle doldurulması; yükleme ilerlemesi ve istemci dosya hatalarının açık gösterimi.
- **Bağımlılık ve sürüm yönetimi:** Düzenli audit/upgrade kontrolü; büyük sürüm yükseltmeleri ayrı değişiklik olarak, Windows/Linux başlangıç testleriyle yapılmalı.

## Uygulama ilkeleri

Her işi küçük, doğrulanabilir değişikliklere ayırın. Veri silen migration veya reset çalıştırmayın. Dosyalar ve veritabanı için geri dönüş yolunu hazırlayın. Yeni tablo/alan gerekiyorsa ileri yönlü migration ekleyin; geçmiş migration'ları değiştirmeyin. İş bittiğinde bu listeden çıkarıp sonucunu AGENTS.md içindeki mevcut günlüğe ekleyin.

İncelemede kullanılan framework referansları: [Lucid transaction davranışı](https://lucid.adonisjs.com/docs/transactions), [ilişki başına sınırlı toplu yükleme](https://lucid.adonisjs.com/docs/has-many). Uygulama kodu ayrıca kurulu paketlerin tipleriyle doğrulandı.

## Puan, inceleme ve demo topluluk sonrası öneriler

- **Moderasyon:** İnceleme ve yorumlar için "şikâyet et" ve yönetimde bekleyen şikâyet listesi; kullanıcıyı yorumdan susturma. Şu an yalnız silme var.
- **İnceleme geliştirmeleri:** İnceleme düzenleme geçmişi, "okuma ilerlemesi %50'den fazla olanlar" rozeti (doğrulanmış okur), yanıtlanabilir incelemeler, puan değişim grafiği.
- **Yanıt bağlamı:** Yanıtlanan yoruma tıklayınca henüz yüklenmemiş (sayfalama arkasındaki) yorumları da getirip vurgulamak; şu an yalnız ekranda olanı vurgular. Profildeki yorum kartından doğrudan o yoruma gitmek.
- **Demo veri:** Tohumu ve ölçeği komut satırından seçmek (`seed:demo --scale=0.3 --seed=7`); gerçek GIF için isteğe bağlı bir sağlayıcı (yalnız geliştirme).
- **Kozmetik:** Yönetim formunda özel çerçeve (halka renkleri) ve duvar kağıdı geçişi oluşturmak (şu an görsel yükleme ya da hazır stil).

## Tasarım sistemi sonrası açık işler (2026-10-15)

- **Paket boyutu:** Yönetim JS/CSS'i okurlardan ayrıldı (okur: gzip ~39 KB JS, ~35 KB CSS). Kalanlar: sayfaya özgü okur modüllerinin (yorumlar, okuyucu, oynatıcı) tembel yüklenmesi, satır içi SVG ikonlar yerine sprite, latin font için `preload`.
- **Kozmetikler açık şemada:** Koyu zemin için tasarlanmış bazı ad efektleri ve beyaz çıkartmalar kâğıt zeminde soluk; açık şemaya özel varyantlar tasarlanabilir.
- **Profil etkinliği:** Yorum ve inceleme sekmeleri son 12 kaydı gösterir; üye etkinliği için sayfalı uç nokta yok.
- **Okuma ilerlemesi:** "Devam et" son okunan bölüme gider; sayfa düzeyinde ilerleme yoktur.
- **Envanter → sayfa eşitlemesi:** Envanterde kuşanılan kozmetik `cosmetic-change` olayı yayar; profil ve yorum kartları bu olayı dinleyip sayfayı yenilemeden güncellenebilir.

## Anime / izleme sonrası açık işler (2026-10-18)

- **Fansub'a göre gruplama:** Bir bölümün kaynaklarını fansub ekiplerine göre ayırma (izleme sayfasında fansub sekmeleri, yönetimde fansub alanı ve önerileri) ilk sürümde yapılmış, kullanıcının isteğiyle 2026-10-18'de kaldırılmıştır; şimdilik her bölümün tek bir kaynak listesi var. Gerekirse kaynaklara `fansub` alanı (veya ayrı bir `fansubs` tablosu) eklenip izleme sayfasına sekme olarak geri getirilebilir.
- **Büyük dosyalar:** Tek parça yükleme 4 GB ve 3 saatlik istek süresiyle sınırlıdır; kesilen yükleme baştan başlar. Parçalı/sürdürülebilir yükleme (ör. tus) ve ters vekil (nginx `client_max_body_size`, zaman aşımları) ayarı belgelenmeli.
- **Akış biçimi:** HLS (`.m3u8`) ve otomatik kalite seçimi yok; yalnız tarayıcının doğrudan oynattığı MP4/WebM. Sunucuda yeniden kodlama ve küçük resim üretimi de yok.
- **Altyazı:** Ayrı `.vtt` altyazı dosyası yükleme ve `<track>` desteği eklenebilir (şimdilik altyazının videoya gömülü olması gerekir).
- **İzleme ilerlemesi:** Videonun kaldığı saniye saklanmıyor; ←/→ bölüm kısayolları oynatıcıdaki sarma tuşlarıyla çakışmasın diye eklenmedi.
- **Erişim ve taslak (2026-10-18 sonrası):** VIP rolü yalnız yönetici tarafından elle verilir (süre/bitiş tarihi yok). Zamanlanmış yayın (taslağın belirli tarihte otomatik yayınlanması) yok. Kilitli seriler katalogda görünür; isteğe bağlı gizleme ayarı eklenebilir. Yaş onayı yalnız çerezle tutulur (hesaba yazılmaz, cihaz değişince tekrar sorulur). Kaydedilmeden bırakılan tema görselleri `CONTENT_ROOT/branding` altında kalır. Kart kataloğu ve profil sayfalarındaki yorum/inceleme bağlantıları taslak serileri ayıklamaz (bağlantı 404 verir).
- **Biçim değiştirme:** Seri kullanan bir içerik türünün biçimi (görsel/metin/video) şimdilik kilitli. Gerekirse bölümleri dönüştüren ya da yalnız bölümsüz serilerde izin veren bir akış eklenebilir; rozet rengi ise hâlâ slug'a göre (`site.badgeTones.type`) seçiliyor, yeni türler nötr rozet alır.
- **Gömülü oynatıcılar:** Dış oynatıcılar `sandbox` olmadan yüklenir (birçok site sandbox'ı reddeder); açılır reklamları engellemek için site bazında izin listesi ve isteğe bağlı sandbox düşünülebilir.

## Kapak bul sonrası açık işler (2026-10-21)

- Açıklamayı Türkçeye çeviren bir seçenek (kaynaklar İngilizce yazar; şimdilik elle çevriliyor).
- Seri listesinde kapağı olmayan (varsayılan görselli) serileri toplu bulma ve doldurma.
- Otomatik doldururken eklenen yazar/çizer/türler forma uygulanınca hemen sözlüğe yazılır; form kaydedilmezse sözlükte kullanılmayan kayıt kalabilir.
- Kart koleksiyonundaki kart görselleri seri kapağının kopyası olduğu için kapak bulanıklaştırmadan etkilenmez.
- Kapak bulanıklaştırma sayfa önbelleği olmadan çalışır; ileride bir HTML önbelleği eklenirse (ya da CDN) ziyaretçiye göre değişen kapaklar yüzünden önbellek anahtarına yaş onayı/üyelik girmeli.
- Arama sonuçları süreç belleğinde 30 dk tutulur; çok süreçli dağıtımda paylaşılan önbellek.
- Yönetim bildirimleri (toast) sağ alttaki kaydetme çubuğunun düğmesini birkaç saniye örtüyor; bildirimler çubuğun üstüne alınmalı.

