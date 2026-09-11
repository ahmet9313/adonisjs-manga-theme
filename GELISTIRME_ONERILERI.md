# MangaHub geliştirme önerileri

Bu belge mevcut kod incelemesinden çıkan **henüz uygulanmamış** işleri içerir. Güncelleme günlüğü değildir; yapılan işler yalnızca [AGENTS.md](AGENTS.md) içine yazılır. Kurulum ve mimari rehberi [README.md](README.md) içindedir.

## Öncelik 1 — Yayına hazırlık

| Öneri | Gerekçe / kapsam | Tamamlanma ölçütü |
| --- | --- | --- |
| Gerçek ilk yönetici oluşturma komutu | Şu an ilk hesap demo seed üzerinden geliyor. E-posta ve gizli şifre girişi alan, mevcut hesabı değiştirmeyen Ace komutu eklenmeli. | Üretimde demo içerik oluşturmadan yönetici açılabilmeli; şifre loglara düşmemeli. |
| Giriş denemesi sınırı ve yetki rolleri | Panelde tek yönetici seviyesi var; çevirmen, editör ve yükleyici için ayrım yok. | IP/hesap bazlı deneme sınırı, rol bazlı erişim testleri ve yetkisiz işlemlerde 403. Çoklu sunucu için ortak sayaç deposu. |
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

- **Okuma ilerlemesi:** Son okunan bölüm/sayfa, devam et düğmesi; mevcut localStorage kayıtlarını bozmayan sürümlü veri biçimi. İleride hesapla senkronizasyon.
- **Okuyucu tercihleri:** Genişlik, arka plan, metin boyutu, klavye kısayolları; tercihler kalıcı ve mobilde erişilebilir olmalı.
- **Arama kalitesi:** Türkçe büyük/küçük harf ve aksan davranışı, yazım hatası toleransı, yayın yılı filtresi. Şu an JSON alternatif başlık araması metin eşleşmesi yapıyor; büyük katalogda tam metin indeksleri değerlendirilmeli.
- **Dinamik içerik türleri:** Panelden eklenen özel içerik türleri katalog seçimlerine de otomatik yansıtılmalı. Mevcut katalog arayüzündeki beş tür ve `novel` özel davranışı ortak bir içerik türü modeline bağlanmalı.
- **SEO ve paylaşım:** Sitemap, robots, canonical adresler, Open Graph görselleri ve yapılandırılmış veri. Alan adı kesinleşmeden sabit üretim URL'si eklenmemeli.
- **Yorum ve bildirim:** Moderasyon, spam kontrolü ve abonelikten çıkma tasarımıyla birlikte ele alınmalı.
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
