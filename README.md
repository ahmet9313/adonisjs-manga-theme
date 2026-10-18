# MangaHub — Türkçe manga, manhwa ve novel okuma sitesi

Fansub ekipleri için hazır bir okuma sitesi ve yönetim paneli: manga / manhwa / manhua / webtoon / novel serileri yayımlayın, okurlar okusun, yorumlasın, puanlasın ve okudukça seviye atlasın. Sitede satın alma ve sanal para yoktur; ödüllerin hepsi okuyarak ve katılarak kazanılır.

**Sürüm:** 0.10.0-beta.1 (ön sürüm) — değişiklikler için [güncelleme günlüğü](AGENTS.md#güncelleme-günlüğü).

**Teknoloji:** AdonisJS 7, Lucid, Edge, Alpine.js 3, Tailwind CSS 4 · Node.js 24+ ve npm 11+ · SQLite (varsayılan) veya MySQL 8.

![MangaHub ana sayfa, koyu şema](docs/screenshots/ana-sayfa.webp)

## Öne çıkanlar

- **Okuma:** Ana sayfada kaydırılabilir öne çıkanlar, "Son Güncellenenler" ve keşif bölümleri; filtreli katalog; dikey görsel ve düz metin (novel) okuyucu; kaydedilenler, okuma ilerlemesi ve "Okumaya Devam Et".
- **İzleme (anime):** Anime serilerinin bölümleri video bölümüdür; izleme sayfasında oynatıcı ve yanında numaralı kaynak listesi bulunur. Kaynak, siteye yüklenmiş video (**maouwach**), başka bir sitenin gömülü oynatıcısı ya da doğrudan video bağlantısı olabilir.
- **Topluluk:** İç içe yorumlar (GIF, çıkartma, spoiler, yukarı/aşağı oy), 1-10 puan ve incelemeler, profil sayfaları, gelen kutusu, öneriler.
- **Kazanılan ödüller:** EXP ve seviye, günlük giriş serisi, rozetler, kart koleksiyonu; avatar çerçevesi, ad efekti, duvar kağıdı ve çıkartma gibi kozmetikler.
- **Görünüm:** "Mürekkep & Kâğıt" tasarım sistemi; koyu, açık ve sistem şeması; telefonda da tam kullanılabilir arayüz; klavye ve ekran okuyucu desteği.
- **Yönetim paneli:** Seri, bölüm ve sözlük yönetimi; toplu sayfa yükleme; kullanıcılar ve roller; kozmetik ve kart yönetimi; renkleri, düzeni ve bölümleri koddan bağımsız değiştiren tema düzenleyici.
- **Kurulum:** Windows ve Linux'ta tek komutla kurulum ve başlatma ([aşağıda](#tek-komutla-başlatma)).

## Ekran görüntüleri

Görüntüler demo verisiyle (`npm run seed:demo`) ve oluşturulmuş SVG kapaklarla alınmıştır; kullanıcılar, yorumlar ve kapaklar örnektir.

### Okuma ve keşif

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/son-guncellenenler.webp" alt="Son Güncellenenler: her seride son üç bölüm; sayfalar yenilenmeden, iskeletle yüklenir"><br><sub>Son Güncellenenler: her seride son üç bölüm; sayfalar yenilenmeden, iskeletle yüklenir</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/katalog.webp" alt="Katalog: arama, tür / durum / içerik türü filtreleri ve sıralama"><br><sub>Katalog: arama, tür / durum / içerik türü filtreleri ve sıralama</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/seri.webp" alt="Seri sayfası: bilgiler, puan, bölüm listesi ve "Okumaya Devam Et""><br><sub>Seri sayfası: bilgiler, puan, bölüm listesi ve "Okumaya Devam Et"</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/seri-incelemeler.webp" alt="Puan ve incelemeler: ortalama, dağılım, "Faydalı" oyu, spoiler"><br><sub>Puan ve incelemeler: ortalama, dağılım, "Faydalı" oyu, spoiler</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/okuyucu.webp" alt="Okuyucu: araç çubuğu, bölüm seçici, ← → ile bölüm geçişi"><br><sub>Okuyucu: araç çubuğu, bölüm seçici, ← → ile bölüm geçişi</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/okuyucu-ayarlar.webp" alt="Okuma ayarları"><br><sub>Okuma ayarları</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/arama.webp" alt="Klavyeyle kullanılabilen anlık arama ("/" kısayolu)"><br><sub>Klavyeyle kullanılabilen anlık arama ("/" kısayolu)</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/oneriler.webp" alt="Sana özel öneriler"><br><sub>Sana özel öneriler</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/ana-sayfa-acik.webp" alt="Açık şema (Kâğıt): ana sayfa"><br><sub>Açık şema (Kâğıt): ana sayfa</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/seri-acik.webp" alt="Açık şema: seri sayfası"><br><sub>Açık şema: seri sayfası</sub></td>
  </tr>
</table>

### Topluluk ve hesap

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/seri-yorumlar.webp" alt="Yorumlar: iç içe yanıtlar, oylar, GIF / çıkartma, kozmetikli yorum kartları"><br><sub>Yorumlar: iç içe yanıtlar, oylar, GIF / çıkartma, kozmetikli yorum kartları</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/profil.webp" alt="Profil: banner, çerçeve, ad efekti, seviye ve istatistikler"><br><sub>Profil: banner, çerçeve, ad efekti, seviye ve istatistikler</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/profil-koleksiyon.webp" alt="Profil koleksiyonu: kazanılmış ad efektleri ve rozetler"><br><sub>Profil koleksiyonu: kazanılmış ad efektleri ve rozetler</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/hesap-menusu.webp" alt="Hesap menüsü: seviye ilerlemesi ve günlük giriş"><br><sub>Hesap menüsü: seviye ilerlemesi ve günlük giriş</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/gelen-kutusu.webp" alt="Gelen kutusu: yanıtlar, ödüller, yeni bölümler"><br><sub>Gelen kutusu: yanıtlar, ödüller, yeni bölümler</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/oduller.webp" alt="Seviye ve ödüller: günlük giriş serisi, EXP kaynakları"><br><sub>Seviye ve ödüller: günlük giriş serisi, EXP kaynakları</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/rozetler.webp" alt="Rozetler"><br><sub>Rozetler</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/kartlar.webp" alt="Kart koleksiyonu, parçalama ve üretim"><br><sub>Kart koleksiyonu, parçalama ve üretim</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/kozmetik.webp" alt="Kozmetikler: avatar çerçeveleri ("Dene" ve "Kuşan")"><br><sub>Kozmetikler: avatar çerçeveleri ("Dene" ve "Kuşan")</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/gecmis.webp" alt="Okuma geçmişi"><br><sub>Okuma geçmişi</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/kaydedilenler.webp" alt="Kaydedilenler: devam bağlantısı ve yeni bölüm etiketi"><br><sub>Kaydedilenler: devam bağlantısı ve yeni bölüm etiketi</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/ayarlar.webp" alt="Ayarlar: canlı profil kartı, avatar / banner kırpma"><br><sub>Ayarlar: canlı profil kartı, avatar / banner kırpma</sub></td>
  </tr>
</table>

### Yönetim paneli

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-panel.webp" alt="Panel: katalog özeti, hızlı işlemler, son değişiklikler"><br><sub>Panel: katalog özeti, hızlı işlemler, son değişiklikler</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-seriler.webp" alt="Seriler: arama ve filtreler"><br><sub>Seriler: arama ve filtreler</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-seri-formu.webp" alt="Seri formu: etiket girişi, çoklu seçim, sürükle-bırak kapak / banner"><br><sub>Seri formu: etiket girişi, çoklu seçim, sürükle-bırak kapak / banner</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-bolumler.webp" alt="Bölümler"><br><sub>Bölümler</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-bolum-formu.webp" alt="Bölüm formu: toplu sayfa yükleme ve sıralama"><br><sub>Bölüm formu: toplu sayfa yükleme ve sıralama</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-turler.webp" alt="Türler, yazarlar, çizerler ve içerik türleri için ortak sözlük sayfası"><br><sub>Türler, yazarlar, çizerler ve içerik türleri için ortak sözlük sayfası</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-tema-renkler.webp" alt="Tema → Renkler: iki şema, hazır setler, kaydetmeden canlı önizleme"><br><sub>Tema → Renkler: iki şema, hazır setler, kaydetmeden canlı önizleme</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-tema-goster.webp" alt="Tema → Göster / Gizle: sitenin bölümlerini açıp kapatma"><br><sub>Tema → Göster / Gizle: sitenin bölümlerini açıp kapatma</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-tema-gelismis.webp" alt="Tema → Gelişmiş: özel CSS, JSON dışa / içe aktarma"><br><sub>Tema → Gelişmiş: özel CSS, JSON dışa / içe aktarma</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-roller.webp" alt="Roller: ad, renk, izinler (Discord benzeri)"><br><sub>Roller: ad, renk, izinler (Discord benzeri)</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-kozmetikler.webp" alt="Kozmetik yönetimi: ekleme, hediye etme, gizleme"><br><sub>Kozmetik yönetimi: ekleme, hediye etme, gizleme</sub></td>
    <td width="50%" valign="top"><img src="docs/screenshots/admin-kartlar.webp" alt="Kart yönetimi: kapaklardan toplu kart oluşturma"><br><sub>Kart yönetimi: kapaklardan toplu kart oluşturma</sub></td>
  </tr>
</table>

<details>
<summary>Yönetim paneli, açık şema</summary>

![Yönetim paneli, açık şema](docs/screenshots/admin-acik.webp)

</details>

### Telefonda

<table>
  <tr>
    <td width="25%" valign="top"><img src="docs/screenshots/mobil-ana-sayfa.webp" alt="Ana sayfa"><br><sub>Ana sayfa</sub></td>
    <td width="25%" valign="top"><img src="docs/screenshots/mobil-menu.webp" alt="Mobil menü"><br><sub>Mobil menü</sub></td>
    <td width="25%" valign="top"><img src="docs/screenshots/mobil-seri.webp" alt="Seri sayfası"><br><sub>Seri sayfası</sub></td>
    <td width="25%" valign="top"><img src="docs/screenshots/mobil-katalog.webp" alt="Katalog (açık şema)"><br><sub>Katalog (açık şema)</sub></td>
  </tr>
  <tr>
    <td width="25%" valign="top"><img src="docs/screenshots/mobil-okuyucu.webp" alt="Okuyucu"><br><sub>Okuyucu</sub></td>
    <td width="25%" valign="top"><img src="docs/screenshots/mobil-profil.webp" alt="Profil (açık şema)"><br><sub>Profil (açık şema)</sub></td>
    <td width="25%" valign="top"><img src="docs/screenshots/mobil-admin.webp" alt="Yönetim: seriler"><br><sub>Yönetim: seriler</sub></td>
    <td></td>
  </tr>
</table>

## Belgeler

| Belge | Sorumluluğu |
| --- | --- |
| [README.md](README.md) | Kurulum, kullanım, mimari ve bakım rehberi |
| [AGENTS.md](AGENTS.md) | Geliştirme kuralları ve **tek güncelleme günlüğü** |
| [GELISTIRME_ONERILERI.md](GELISTIRME_ONERILERI.md) | Henüz uygulanmamış, önceliklendirilmiş geliştirme önerileri |

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

Şemanın çekirdeği seriler, bölümler, içerik türleri, türler, yazarlar, çizerler ve üç ilişki tablosudur; bunların yanında kullanıcılar ve roller, kaydedilenler ve okuma kayıtları, yorumlar, puan/incelemeler, bildirimler, kozmetikler, kartlar ve site/tema ayarları (`settings`) tabloları bulunur. Bölüm numarası seri içinde benzersiz ve tam sayıdır; `0` kullanılabilir. Seri silindiğinde bölümleri ve ilişki kayıtları yabancı anahtar kurallarıyla silinir. Kullanımdaki içerik türünün silinmesi engellenir. Dosyalar kayıt silinirken otomatik temizlenmez.

Görsellerin tek depolama ayarı `config/content.ts`, isteğe bağlı ortam değişkeni `CONTENT_ROOT` olur. Geliştirmede varsayılan `public/content`; üretim başlatıcısı da aynı kalıcı klasörün mutlak yolunu kullanır. **Yüklenen içerikler build içine kopyalanmaz.** `/content/*` rotası bu depodan görselleri sunar. Başlatıcı dışında `build` klasöründen çalıştırıyorsanız `CONTENT_ROOT` ve `SQLITE_DB_PATH` için kalıcı, mutlak yollar sağlayın.

Veritabanını, içerik klasörünü ve `.env` dosyasını birlikte yedekleyin. Çalışan SQLite veritabanı için tutarlı çevrim içi yedekleme kullanın veya kopyalamadan önce sunucuyu durdurun. `migration:fresh` ve `db:reset` verileri siler; rutin kurulumun parçası değildir ve açık onay olmadan çalıştırılmaz.

## İçerik yönetimi

Yönetim panelinden içerik türü, tür, yazar, çizer, seri ve bölüm oluşturulabilir.

**İçerik türü biçimleri:** Her içerik türü üç ana biçimden birindedir (`content_types.format`, migration 0020; tanımlar `config/site.ts` → `contentFormats`): **Görsel** (manga, manhwa, manhua, webtoon: bölümler sayfa görselleriyle eklenir ve okunur), **Metin** (novel: bölümler metin olarak yazılır) ve **Video** (anime: bölümler video kaynaklarıyla eklenir ve izlenir). Biçim Yönetim → İçerik Türleri'nde eklerken veya düzenlerken seçilir; hızlı eklemede seçilmezse addan önerilir (`novel` geçen → metin, `anime`/`donghua` → video, diğerleri görsel). Bölüm düzenleyicisini, okuyucu/oynatıcıyı ve sitenin "oku" mu "izle" mi diyeceğini slug değil biçim belirler; böylece "Light Novel" veya "Donghua" gibi yeni türler kod değişikliği olmadan çalışır. Mevcut bölümler o biçime göre kaydedildiği için seri kullanan bir türün biçimi değiştirilemez.

**Taslak, erişim ve yaş uyarıları** (migration 0021): Seri ve bölüm formundaki "Yayın ve erişim" bölümünde **Taslak** açılırsa kayıt katalogda, aramada, ana sayfada, öneri/geçmiş/kaydedilenler listelerinde ve bölüm listelerinde görünmez; adresi yalnız yönetici ve editörler açar (üstte "Taslak" notu görürler). Taslak bölüm kaydedenlere bildirim göndermez ve seriyi "Son Güncellenenler"de yukarı taşımaz; taslaktan çıkınca o günün tarihini alır ve bildirim gider. **Erişim** Herkes / Üyelere özel / VIP'lere özel seçilir; bölümde serinin ayarından sıkı olan geçerlidir. Kilitli bölümler listede kilit rozetiyle görünür, açılınca giriş ya da VIP kapısı çıkar (403); yorum API'si de kapalıdır. Yaş sınırı olan seriler için Tema → Yaş ve Erişim'de her sınıra "Uyarı yok", "Yaş uyarısı" veya "Yaş uyarısı + üyelik" seçilir (varsayılan: 18+ uyarı + üyelik, 16+ uyarı). Yaş onayı `POST /yas-onayi` ile bir yıllık `age_ok` çerezine yazılır; 18+ onayı 16+'yı da kapsar. Bölüm formundaki "Bölüm öncesi uyarı" doluysa okur önce uyarıyı görür ve "Devam et" ile (`?onay=1`) bölüme geçer. Kapılar geçilmeden okuma kaydı, EXP ve kart yazılmaz. Yönetici/editör erişim ve yaş kapılarına takılmaz. Kurallar `app/services/access_service.ts` içindedir.

**Tema görselleri:** Logo, mobil logo (1024 px altında logonun yerine), sekme simgesi (PNG/JPG/WebP/GIF/ICO, en fazla 1 MB) ve arka plan görseli tema sayfalarında sürükle-bırak ile yüklenir (`POST /admin/tema/gorsel`, `CONTENT_ROOT/branding/`); adres alanı elle de yazılabilir. Kaydedilince değiştirilen eski yüklemeler silinir. SVG yüklenemez (adres olarak verilebilir).

Seri oluştururken ilişkiler seçilir; kapak ve banner isteğe bağlıdır. Kapaksız kayıt ortak yer tutucuyu kullanır. Seri başlığı veya içerik türü adı değiştiğinde mevcut slug korunur. Serinin içerik türünü değiştirmek URL'nin tür kısmını değiştirir; bunun için otomatik yönlendirme henüz yoktur.

Görsel yüklemeleri JPG/JPEG, PNG ve WebP ile sınırlıdır; dosya başına 10 MB, istek başına 200 MB, bölüm başına en fazla 500 sayfa kabul edilir. Yeni dosyalar benzersiz adla yazılır. Bölüm düzenlemede mevcut görsellerin sırası değiştirilebilir; yeni görseller mevcut dosyaların üzerine yazılmaz. Metin türlerinin bölümlerinde boş olmayan düz metin kullanılır. Önceden üretilmiş güvenilir SVG örnekleri okunabilir; yönetim yüklemeleri SVG kabul etmez.

**Anime (video) bölümleri:** İçerik türünün biçimi **Video** ise (varsayılan `anime`, migration 0019 ekler) bölüm formunda sayfalar yerine **Kaynaklar** düzenleyicisi açılır. Her kaynağın isteğe bağlı bir etiketi (ör. 1080p) ve türü vardır; kaynaklar izleme sayfasında bu sırayla listelenir:
- **maouwach (video yükle):** MP4, WebM veya M4V; en fazla 4 GB. Dosya `POST /admin/bolumler/video` ile bellekte tutulmadan doğrudan `CONTENT_ROOT/videos/<seri id>/` altına UUID adıyla yazılır, dosya imzası denetlenir. Video ileri/geri sarılabilsin diye `/content` HTTP Range (206) destekler. Kaynak bölümden çıkarılınca, bölüm veya seri silinince dosya da silinir (başka bir bölüm kullanmıyorsa). Yerel oynatıcının görünen adı `config/watch.ts` → `localHost`'tur.
- **Bağlantı / iframe kodu:** Adres ya da yapıştırılan `<iframe>` kodu kabul edilir; yalnız https. YouTube, Google Drive, Dailymotion, ok.ru ve Vimeo izleme adresleri oynatıcı adresine çevrilir, `.mp4/.webm/.m4v` adresleri doğrudan `<video>` ile oynatılır, diğerleri iframe olarak gömülür. Kaynak adı boş bırakılırsa adresten bulunur.

İzleme sayfası, ziyaretçi bir kaynak seçene ya da "İzle"ye basana kadar dış sitelerin oynatıcılarını yüklemez; son seçilen kaynak tarayıcıda (`watch-prefs`) hatırlanır. Okuma geçmişi, ödüller, yorumlar ve kaydedilenler anime bölümlerinde de aynen çalışır ("İzlemeye Devam Et").

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
| `resources/js/app.js` | Alpine kayıt noktası: `components/*.js` modüllerini toplar, `ui.js` (odak tuzağı, katmanlar, onay penceresi, görsel yedeği) ve şema anahtarını başlatır |
| `config/rewards.ts`, `config/cosmetics.ts` | EXP miktarları, seviye eğrisi, rozetler, kart nadirlikleri; kozmetik türleri ve hazır CSS stilleri |
| `app/services/{progress,cosmetic,card,notification,recommendation}_service.ts` | Seviye/günlük giriş/rozet, kozmetik kilitleri ve kuşanma, kart düşmesi/parçalama/üretim, gelen kutusu, öneriler |
| `resources/js/components/*.js` | Her modül `export const components = { … }` ile Alpine bileşenlerini bildirir; `app.js` hepsini otomatik kaydeder (ör. `account_menu`, `inbox`, `inventory`, `toasts`, `cosmetic_store`, `card_collection`, `profile_like`, `ui`, `theme_switch`, `reader`) |
| `resources/css/` | Tasarım sistemi: `tokens.css` (iki şema), `base.css`, `components.css`, `layout.css`, `cosmetics.css`, `reader.css`, sayfa dosyaları `pages/*.css` |
| `resources/views/components/ui/`, `components/series/card.edge` | Ortak Edge bileşenleri (düğme, alan, panel, rozet, pencere, açılır menü, sekmeler, sayfalama, boş durum, seri kartı …) |
| `scripts/setup-and-start.mjs` | Windows/Linux ortak kurulum ve başlatma |
| `tests/`, `scripts/check-mobile-nav.mjs` | Birim, HTTP/veritabanı ve tarayıcı kontrolleri |

Yeni sayfalarda ortak layout ve partial'ları kullanın. Karmaşık etkileşimi Edge içine script olarak eklemek yerine bir Alpine bileşenine taşıyın. Dinamik metni JavaScript string'ine yerleştirmeyin; HTML kaçışı yapılan `data-*` JSON verisiyle aktarın. Seri/bölüm ve ilişki güncellemelerini aynı transaction içinde tutun. Listeleme için tüm kayıtları belleğe almak yerine SQL sayfalama kullanın.

Katalogda seri başlığı/alternatif başlık araması, tür/durum/içerik türü filtreleri ve sıralama vardır. Ana sayfa her seri için son üç bölümü toplu getirir; katalog bölüm sayısını ve son bölüm numarasını SQL içinde hesaplar. Okuyucu dikey görselleri veya düz metni gösterir. Kaydedilenler ve okuma ilerlemesi üyelerde veritabanında, misafirlerde tarayıcıda tutulur (ayrıntı: [Üyelik, roller ve profil](#üyelik-roller-ve-profil)).

## Tasarım sistemi: Mürekkep & Kâğıt

Arayüz tek bir tasarım sistemiyle çizilir; yeni bir sayfa yazarken renk veya ölçü uydurmayın, aşağıdaki parçaları kullanın.

- **İki renk şeması:** Koyu (varsayılan, mürekkep) ve açık (kâğıt). `<html data-theme="dark|light|system">` sunucuda `theme` çerezinden seçilir (`schemeOf()`), bu yüzden ilk boyamada yanlış şema görünmez. Ziyaretçi üst menüdeki Koyu / Açık / Sistem anahtarıyla seçer; yönetici varsayılanı Tema → Renkler'de belirler ve Tema → Göster/Gizle'den seçimi kapatabilir.
- **Token'lar:** `resources/css/tokens.css` iki şemanın bütün renklerini, köşe yarıçaplarını, gölge ve katman sıralarını tanımlar. Stok değerler `config/theme.ts` ile birebir aynıdır (`tests/unit/tokens.spec.ts` bunu doğrular). Yönetici her rengi iki şemada ayrı düzenler: koyu `c.<anahtar>`, açık `cl.<anahtar>` olarak saklanır; yalnız varsayılandan farklı değerler yazılır.
- **Anlamsal sınıflar:** `bg-surface`, `bg-surface-2`, `bg-field`, `bg-hover`, `border-line`, `text-ink` (başlık), `text-body`, `text-muted`, `text-accent-text`, `bg-accent-strong`, `text-on-accent`, `text-on-image` (görsel üstünde sabit beyaz), `text-success/warning/danger/info`, `shadow-1/2`. Tailwind palet renkleri, `*-white` sınıfları, köşeli parantezli renkler, köşesiz `rounded` ve satır içi olaylar `npm run lint:design` tarafından reddedilir.
- **Bileşen sınıfları** (`components.css`): `btn` (+ `btn--primary|secondary|ghost|danger`), `panel`, `card`, `badge` + `data-tone`, `chip`, `field`/`control`, `tabs`/`tab`, `segmented`, `menu`, `modal`, `toast`, `alert`, `empty`, `skeleton`, `progress`, `page-head`, `section-head`, `stat`, `table`, `series-card`, `user-chip`. Alpine ile tarayıcıda çizilen listeler (yorumlar, kaydedilenler, gelen kutusu, kozmetikler) da aynı sınıfları kullanır.
- **Edge bileşenleri** (`resources/views/components/ui/*`, `components/series/card.edge`): düğme, form alanı (eski girdi ve hata mesajı otomatik), panel, rozet, açılır pencere (odak tuzağı, Esc yalnız üstteki katmanı kapatır), açılır menü, sekmeler, sayfalama (sorgu dizesini sunucuda korur), sayfa ve bölüm başlıkları, boş durum, iskelet, ilerleme, istatistik, uyarı, kullanıcı çipi, şema anahtarı, yorum/inceleme/kozmetik önizlemeleri. Bileşen yolu her zaman `components/ui/<ad>` biçimindedir ve Edge etiketleri satır başında olmalıdır.
- **Davranış:** silme ve geri alınamaz işlemler `<form data-confirm="…">` ile ortak onay penceresini açar; kırık görseller `data-fallback`, çift gönderim `data-submit-once` ile yönetilir; bildirimler `$dispatch('toast', { text, tone })` ile gösterilir, sunucu `session.flash` mesajları JavaScript olmadan da görünür.
- **Kozmetikler içeriktir:** ad efektleri, çerçeveler, duvar kağıtları, kartlar ve seviye rozeti (`cosmetics.css`) kendi renklerini iki şemada da korur.
- **Kontroller:** `npm run lint:design`, `npm run lint:contrast`, `npm run test:ui` ve `npm run test:a11y`.

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
| `npm run lint:design` | Şablon ve tarayıcı bileşenlerinde tasarım kuralı denetimi (palet/sabit renk, `white` sınıfları, köşesiz `rounded`, satır içi olaylar, eski sınıflar) |
| `npm run lint:contrast` | Tema renklerinin iki şemada ve hazır setlerde WCAG kontrastı |
| `npm run format` | Kaynak biçimlendirme; üretilen klasörler hariç. `.edge` dosyalarını toplu biçimlendirmeyin (prettier-edge satır başındaki Edge etiketlerini bozabilir) |
| `npm test`, `npm run test:ui` | Otomatik davranış ve tarayıcı kontrolleri |
| `npm run test:a11y` | axe-core ile erişilebilirlik taraması (iki şema, telefon ve masaüstü genişliği; `-- <adres> --login kullanıcı:parola --paths /,/seriler`) |

Doğrulama sonuçları AGENTS.md günlüğündedir. Windows ve Linux başlatıcıları ile MySQL her değişiklikte birlikte denenmiyor; ayrı bir CI matrisi önerilir.

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
- **Roller:** `admin` (tüm panel + kullanıcılar), `editor` (seri/bölüm/sözlük yönetimi), `vip` (site + VIP'lere özel içerik; satın alma yok, rolü yönetici verir), `member` (yalnızca site). Rol atama ve hesap askıya alma `/admin/kullanicilar` altındadır; yöneticiler kendi rollerini değiştiremez. Mevcut hesaplar migration ile `admin` olur.
- **Roller sayfası (`/admin/roller`, yalnız yönetici):** Discord benzeri rol listesi (renkli nokta, üye sayısı), seçili rolün adı ve rengi (canlı rozet önizlemesiyle), izinleri (salt okunur) ve üyeleri. Ad ve renk `settings` tablosunda saklanır; rozetler, yorumlar, profil ve kullanıcı listesi bunu kullanır. İzinler koda bağlı sabittir; rol ekleme/silme yoktur.
- **Tema (`/admin/tema/*`, yalnız yönetici):** Yedi bölüm: **Genel** (site adı, açıklama, logo, mobil logo, sekme simgesi; her görsel sürükle-bırak ile yüklenir ya da adresi yapıştırılır), **Renkler** (koyu ve açık şema ayrı ayrı: arka plan, metin, üst menü, alt bilgi, paneller, vurgu, rozet ve durum renkleri; saydamlık kaydırıcıları; ziyaretçilerin varsayılan şeması; hazır setler: Mürekkep, Gece Mavisi, Zümrüt, Kızıl / Kâğıt, Krem, Kar), **Düzen ve Görünüm** (içerik genişliği, köşe yuvarlaklığı, üst menü bulanıklığı, yazı tipi ve boyutu, arka plan görseli: yüklenebilir ya da adres), **Göster / Gizle** (üst menü bağlantıları, arama, zil, ana sayfa bölümleri, seri/okuyucu bölümleri, alt bilgi, efektler), **Duyuru Çubuğu**, **Yaş ve Erişim** (yaş sınırına göre uyarı/üyelik) ve **Gelişmiş** (özel CSS, JSON dışa/içe aktarma, sıfırlama). Alan listesi ve varsayılan değerler `config/theme.ts`'te, aynı değerler `resources/css/tokens.css`'teki `--t-*` değişkenlerindedir; yalnız değişen değerler `settings` tablosuna yazılır ve sayfaya satır içi `<style>` olarak eklenir. Renk/düzen değişiklikleri düzenleyici sayfasında kaydetmeden canlı görünür. Panel temadan etkilenir; okunmaz olursa herhangi bir yönetim adresinin sonuna `?guvenli=1` ekleyin. Yönetim menüsü `config/admin_nav.ts`'ten üretilir; editör yalnız Manga grubunu görür.
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
- **Kozmetikler (`/kozmetik/cikartmalar|cerceveler|efektler|duvar-kagitlari`):** Avatar çerçevesi, ad efekti, duvar kağıdı (yorum kartı, profil ve menü arka planı) ve yorumlarda kullanılan çıkartmalar. Her öğe seviye, rozet ya da yalnızca yönetici hediyesiyle açılır; "Dene" kendi yorum kartında önizler, "Kuşan" uygular. Envanter penceresi açılmış öğeleri listeler. Yerleşik katalog migration ile eklenir (CSS stilleri `resources/css/cosmetics.css`, çıkartmalar `public/images/stickers`); yönetici `/admin/kozmetikler` altından görsel yükleyerek, hazır stil seçerek veya ad efektleri için 2-3 renkli geçiş tanımlayarak yeni öğe ekler, gizler ve üyelere hediye eder.
- **Kartlar (`/kartlar`):** Yeni bölüm okurken %12 olasılıkla, 7 günlük giriş serisinde garantili kart düşer (okunan serinin kartları önceliklidir). Nadirlikler F→R; fazla kopyalar aynı nadirlikte parçaya dönüşür, parçalarla o nadirlikte rastgele (eksiklere öncelikli) kart üretilir. Yönetici `/admin/kartlar` altında kart ekler veya kartı olmayan serilerin kapaklarından toplu kart oluşturur.
- **Gelen kutusu:** Hoş geldin, seviye/rozet/kart/hediye ödülleri, yorum yanıtları, profil beğenileri ve kaydedilen serilerdeki yeni bölümler (yönetimden bölüm eklenince). Filtreler, okundu/okunmadı, tekli ve toplu silme; kullanıcı başına en fazla 300 kayıt tutulur (eski okunmuşlar temizlenir).
- **Menü ve keşif:** Hesap menüsü seviye ilerlemesi, giriş serisi ve "Günlük Giriş" düğmesiyle açılır; bölümler akordeon şeklindedir. `/oneriler` sık okunan türlerdeki yeni serileri ve okunmamış popüler serileri, `/gecmis` okuma geçmişini gösterir. Profilde beğeni, rozetler, istatistikler ve kart vitrini vardır; son 5 dakikada görülen üyeler çevrimiçi sayılır.

## Lisans

Paket tanımı `UNLICENSED`dır; proje eğitim ve kişisel kullanım amacıyla geliştirilmiştir. Seri adları ve isteğe bağlı olarak indirilen kapak görselleri sahiplerine aittir.
