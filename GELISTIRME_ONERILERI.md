# MangaHub geliştirme önerileri

Bu belge mevcut kod incelemesinden çıkan **henüz uygulanmamış** işleri içerir. Güncelleme günlüğü değildir; yapılan işler yalnızca [AGENTS.md](AGENTS.md) içine yazılır. Kurulum ve mimari rehberi [README.md](README.md) içindedir.

## Onaylı optimizasyon ve yeniden tasarım planı

Site genelindeki tasarım sistemi (ilk plandaki merlintoon tarzı cam tema yerine uygulanan "Mürekkep & Kâğıt" sistemi; README.md → Tasarım sistemi), yönetimden düzenlenebilir tema ayarları (renk, logo, zemin, rozetler, ana sayfa bölümleri), veritabanı tabanlı arka plan kuyruğu, `sharp` görsel hattı ve güvenlik/performans düzeltmeleri fazlara bölünmüş olarak [OPTIMIZATION_PLAN.md](OPTIMIZATION_PLAN.md) içinde izlenir. Tamamlanan fazlar AGENTS.md günlüğüne yazılır; bu bölümdeki bağlantı plan bitene kadar kalır.

## Öncelik 1 — Yayına hazırlık

| Öneri | Gerekçe / kapsam | Tamamlanma ölçütü |
| --- | --- | --- |
| Ortak giriş sınırı deposu ve ince yetkiler | Giriş/kayıt sınırı süreç belleğindedir; roller üç kademelidir (yönetici/editör/üye). | Çoklu sunucu için ortak sayaç deposu; çevirmen/yükleyici gibi ayrıntılı izinler ve izin bazlı testler. |
| E-posta doğrulama ve parola sıfırlama | Posta altyapısı yok; kayıt e-postası doğrulanmıyor, "şifremi unuttum" akışı yok. | Posta sağlayıcı ayarı (.env), imzalı süreli bağlantılar, doğrulanmamış hesaplar için sınırlar ve testler. |
| Yedekleme ve geri yükleme prosedürü | SQLite/MySQL, kalıcı görseller ve ortam anahtarı birlikte korunmalı. | Otomatik zamanlanmış yedek, geri yükleme provası, saklama süresi ve başarısızlık bildirimi. |
| Üretim dağıtım tarifi | HTTPS, süreç yöneticisi ve kalıcı CONTENT_ROOT işletime göre ayarlanmalı. | Yeniden derleme/yeniden başlatma sonrası yüklemeler ve oturum akışı doğrulanmalı; kurulum sağlık kontrolü belgelenmeli. |
| Windows/Linux + SQLite/MySQL CI matrisi | Bu inceleme Windows/SQLite üzerinde doğrulandı. | Her iki başlatıcıda `--check` eşdeğeri; MySQL 8 üzerinde migration, transaction, toplu bölüm ve JSON araması testleri. |
| Boş kurulum tarayıcı senaryosu | Mevcut UI kontrolü demo Naruto ve novel verisine dayanıyor. | Sıfır serili ana sayfa, boş filtre sonuçları ve ilk seri/bölüm oluşturma ayrı fixture ile test edilmeli. |

## Öncelik 2 — Fansub iş akışı ve veri modeli

| Öneri | Gerekçe / kapsam | Tamamlanma ölçütü |
| --- | --- | --- |
| Taslak, inceleme ve planlı yayın | Kaydedilen bölüm doğrudan okuyucuya açılıyor. | Taslak görünmez olmalı; editör onayı ve yayın tarihi tüm katalog/arama/okuyucu sorgularında uygulanmalı. |
| Ekip ve katkı kredileri | Çevirmen, redaktör, temizleyici, dizgici ve ekip adı için alan yok. | Seri/bölüm bazlı katkılar, ekip sayfası ve yönetilebilir başvuru bağlantısı. |
| Bölüm numarası tasarımı | Mevcut şema tam sayıdır; 10.5, özel bölüm ve cilt için alan yok. | Ayrı sıralama alanı ve gösterim etiketiyle eski URL'leri koruyan, veri silmeyen migration. |
| URL geçmişi ve yönlendirmeler | Başlık değişiminde slug korunuyor; içerik türü değişimi URL'nin tür kısmını değiştiriyor. | Eski seri/tür adresleri için 301 kayıtları ve döngü/çakışma testi. |
| Denetim kaydı ve geri alma | Yönetim değişikliklerinin kim/ne zaman bilgisi yok. | Seri/bölüm değişiklik geçmişi; kritik silmeler için çöp kutusu ve geri yükleme. |
| Daha anlaşılır tarih modeli | Modeller timestamp alanlarını string olarak tutuyor. | UTC ve MySQL tarih dönüşümleri netleştirilerek Lucid DateTime alanlarına kontrollü geçiş; mevcut tarihlerin korunduğu test. |

## Öncelik 3 — Okuyucu ve keşif

- **Sayfa düzeyinde ilerleme:** Bölüm düzeyinde okundu/devam et ve hesap senkronizasyonu var; bölüm içindeki sayfa/kaydırma konumu ve "okunmadı olarak işaretle" yok.
- **Okuyucu tercihleri:** Genişlik, arka plan, metin boyutu, klavye kısayolları; tercihler kalıcı ve mobilde erişilebilir olmalı.
- **Arama kalitesi:** Türkçe büyük/küçük harf ve aksan davranışı, yazım hatası toleransı, yayın yılı filtresi. Şu an JSON alternatif başlık araması metin eşleşmesi yapıyor; büyük katalogda tam metin indeksleri değerlendirilmeli.
- **Dinamik içerik türleri:** Panelden eklenen özel içerik türleri katalog seçimlerine de otomatik yansıtılmalı. Mevcut katalog arayüzündeki beş tür ve `novel` özel davranışı ortak bir içerik türü modeline bağlanmalı.
- **SEO ve paylaşım:** Sitemap, robots, canonical adresler, Open Graph görselleri ve yapılandırılmış veri. Alan adı kesinleşmeden sabit üretim URL'si eklenmemeli.
- **Yorumların devamı:** İç içe yorumlar, beğeni ve görsel/GIF var. Eksikler: GIF arama (Tenor/Giphy; API anahtarı ve dış istek izni gerekir), emoji tepkileri, düzenleme, @bahsetme bildirimleri, şikâyet/rapor kuyruğu ve yönetim paneli moderasyon listesi, spam/kelime filtresi, yorum görsellerinin küçültülmesi, seri silinince kalan yorum görsellerinin temizliği.
- **İnceleme ve bildirimin devamı:** Gelen kutusu, rozetler ve yeni bölüm bildirimleri var. Eksikler: puanlama/inceleme ("İncelemeler" sekmesi), bildirim tercihleri ve abonelikten çıkma, @bahsetme, gerçek zamanlı (SSE/WebSocket) bildirim sayacı, e-posta/push bildirimi.
- **Topluluk sisteminin devamı:** Yerleşik kozmetikler CSS/SVG tabanlıdır; gerçek çizim çerçeve/duvar kağıdı/çıkartma setleri yönetimden yüklenmelidir. Kart sistemi seri kapaklarıyla başlatılabilir; karakter kartı çizimleri, kart detay sayfası, takas ve sezonluk etkinlikler eklenebilir. Ödeme ve sanal para bilerek yoktur (VIP, mağaza, mini oyun ve lonca kapsam dışı); eklenecekse ayrı tasarım ve hukuki değerlendirme gerekir. EXP kötüye kullanımına karşı günlük EXP üst sınırı ve hız sınırlarının ortak depoya taşınması değerlendirilmeli; yüklenen kozmetik görselleri için boyut/oran kontrolü ve küçültme eklenmeli.
- **Sosyal giriş ve 2 adımlı doğrulama:** Google ile giriş (OAuth) ve TOTP; hesap silme/dışa aktarma (KVKK) ve profil resmi için gelişmiş görsel işleme (yeniden boyutlandırma, GIF).
- **Erişilebilirlik:** Yönetim çoklu seçimlerinde tam klavye dolaşımı, odak yönetimi, okuyucuda yükleme durumları; otomatik kontrole ek ekran okuyucu denemesi.

## Öncelik 4 — Ölçek ve bakım

- **Medya yaşam döngüsü:** Kayıt hatasından veya değiştirilmiş kapaktan kalan sahipsiz dosyalar otomatik silinmiyor. Önce yalnızca raporlayan tarama; ardından referans kontrolü, bekleme süresi ve açık onayla temizleme yapılmalı.
- **Görsel işleme:** Orijinali koruyarak küçük kapaklar, responsive srcset, AVIF/WebP dönüşümü ve resim boyutlarının kaydı. npm tabanlı platformlar arası araç ve arka plan iş kuyruğu tercih edilmeli.
- **Nesne depolama/CDN:** Yerel CONTENT_ROOT sözleşmesini koruyan adaptör; doğrulanmış yükleme, URL üretimi ve önbellek politikası birlikte tasarlanmalı.
- **İçerik servisi:** Seri/bölüm controller'larındaki transaction akışları ileride API ve toplu içe aktarma tarafından paylaşılacaksa ayrı yazma servislerine çıkarılmalı. Küçük sözlük controller'ları ancak iş kuralları gerçekten ortak kaldığı ölçüde birleştirilmeli.
- **Ölçüm ve sınırlar:** Büyük veri fixture'ında sorgu sayısı, yanıt süresi, bellek kullanımı ve p95 ölçülmeli. Yönetim anahtar kelime önerileri ve bölüm seçicileri için büyük katalogda sunucu tarafında arama eklenmeli.
- **Güvenlik başlıkları:** CSP şu an kapalı. Alpine ifadeleri ve mevcut inline davranışlar değerlendirilip önce report-only politika, ardından uygun CSP yaklaşımı uygulanmalı.
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

- **Paket boyutu:** Yeniden tasarımla ilk CSS ve JS büyüdü (gzip ~40 KB + ~40 KB). Sayfa CSS'lerinin yalnız ilgili sayfada yüklenmesi (ayrı giriş dosyaları veya `@layer` ile ölü kural temizliği) ve Manrope alt kümelerinin daraltılması değerlendirilmeli.
- **Kozmetikler açık şemada:** Koyu zemin için tasarlanmış bazı ad efektleri ve beyaz çıkartmalar kâğıt zeminde soluk; açık şemaya özel varyantlar tasarlanabilir.
- **Profil etkinliği:** Yorum ve inceleme sekmeleri son 12 kaydı gösterir; üye etkinliği için sayfalı uç nokta yok.
- **Okuma ilerlemesi:** "Devam et" son okunan bölüme gider; sayfa düzeyinde ilerleme yoktur.
- **Envanter → sayfa eşitlemesi:** Envanterde kuşanılan kozmetik `cosmetic-change` olayı yayar; profil ve yorum kartları bu olayı dinleyip sayfayı yenilemeden güncellenebilir.

## Anime / izleme sonrası açık işler (2026-10-18)

- **Fansub'a göre gruplama:** Bir bölümün kaynaklarını fansub ekiplerine göre ayırma (izleme sayfasında fansub sekmeleri, yönetimde fansub alanı ve önerileri) ilk sürümde yapılmış, kullanıcının isteğiyle 2026-10-18'de kaldırılmıştır; şimdilik her bölümün tek bir kaynak listesi var. Gerekirse kaynaklara `fansub` alanı (veya ayrı bir `fansubs` tablosu) eklenip izleme sayfasına sekme olarak geri getirilebilir.
- **Kaydedilmemiş yüklemeler:** Yüklenip bölüm kaydedilmeden bırakılan videolar `CONTENT_ROOT/videos` altında kalır; hiçbir bölümün kullanmadığı eski dosyaları silen bir temizlik komutu yazılmalı.
- **Büyük dosyalar:** Tek parça yükleme 4 GB ve 3 saatlik istek süresiyle sınırlıdır; kesilen yükleme baştan başlar. Parçalı/sürdürülebilir yükleme (ör. tus) ve ters vekil (nginx `client_max_body_size`, zaman aşımları) ayarı belgelenmeli.
- **Akış biçimi:** HLS (`.m3u8`) ve otomatik kalite seçimi yok; yalnız tarayıcının doğrudan oynattığı MP4/WebM. Sunucuda yeniden kodlama ve küçük resim üretimi de yok.
- **Altyazı:** Ayrı `.vtt` altyazı dosyası yükleme ve `<track>` desteği eklenebilir (şimdilik altyazının videoya gömülü olması gerekir).
- **İzleme ilerlemesi:** Videonun kaldığı saniye saklanmıyor; ←/→ bölüm kısayolları oynatıcıdaki sarma tuşlarıyla çakışmasın diye eklenmedi.
- **Erişim ve taslak (2026-10-18 sonrası):** VIP rolü yalnız yönetici tarafından elle verilir (süre/bitiş tarihi yok). Zamanlanmış yayın (taslağın belirli tarihte otomatik yayınlanması) yok. Kilitli seriler katalogda görünür; isteğe bağlı gizleme ayarı eklenebilir. Yaş onayı yalnız çerezle tutulur (hesaba yazılmaz, cihaz değişince tekrar sorulur). Kaydedilmeden bırakılan tema görselleri `CONTENT_ROOT/branding` altında kalır. Kart kataloğu ve profil sayfalarındaki yorum/inceleme bağlantıları taslak serileri ayıklamaz (bağlantı 404 verir).
- **Biçim değiştirme:** Seri kullanan bir içerik türünün biçimi (görsel/metin/video) şimdilik kilitli. Gerekirse bölümleri dönüştüren ya da yalnız bölümsüz serilerde izin veren bir akış eklenebilir; rozet rengi ise hâlâ slug'a göre (`site.badgeTones.type`) seçiliyor, yeni türler nötr rozet alır.
- **Gömülü oynatıcılar:** Dış oynatıcılar `sandbox` olmadan yüklenir (birçok site sandbox'ı reddeder); açılır reklamları engellemek için site bazında izin listesi ve isteğe bağlı sandbox düşünülebilir.
