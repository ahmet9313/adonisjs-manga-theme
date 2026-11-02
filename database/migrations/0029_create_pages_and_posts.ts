import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Static pages (Hakkımızda, S.S.S., DMCA, KVKK …) and announcements ("Duyurular"). Additive only.
 * - `pages`: Markdown body (app/services/markdown_service.ts), footer link and order, published.
 * - `posts`: announcements; `published_at` null is a draft, pinned ones are listed first.
 * The starter pages below are inserted when their slug is free; they are short templates
 * (marked as such) the administrator is expected to edit under Admin → İçerik → Sayfalar.
 */
const note =
  '> **Şablon metin:** Bu sayfa örnek olarak eklendi. Yönetim → İçerik → Sayfalar bölümünden kendi sitene göre düzenle ya da yayından kaldır.'

const starterPages = [
  {
    title: 'Hakkımızda',
    slug: 'hakkimizda',
    body: `${note}

Biz manga, manhwa, webtoon ve novel seven gönüllülerden oluşan bir çeviri topluluğuyuz. Sevdiğimiz serileri Türkçe okurlarla buluşturmak için çeviri, düzenleme ve kontrol işlerini boş zamanlarımızda yapıyoruz.

## Neler yapıyoruz?

- Seçtiğimiz serileri Türkçeye çeviriyoruz.
- Yeni bölümleri duyurular sayfasında ve Discord sunucumuzda paylaşıyoruz.
- Okurlarla yorumlarda ve incelemelerde sohbet ediyoruz.

Ekibe katılmak istersen [İletişim](/sayfa/iletisim) sayfasından bize ulaşabilirsin.`,
  },
  {
    title: 'Sıkça Sorulan Sorular',
    slug: 'sss',
    body: `${note}

### Yeni bölüm ne zaman gelir?

Bölümler çevirmenlerimizin boş zamanına göre çıkar; kesin bir tarih veremiyoruz. Seriyi kaydedersen yeni bölüm çıktığında gelen kutuna bildirim düşer.

### Üye olmak zorunda mıyım?

Okumak için hayır. Yorum yazmak, puan vermek, okuma geçmişini ve kaydettiklerini her cihazda görmek için üye olman gerekir.

### Bir hata buldum, nereye bildireyim?

Bölümün altına yorum yazabilir ya da [İletişim](/sayfa/iletisim) sayfasından bize ulaşabilirsin.

### Bu içeriklerin hakları kime ait?

Eserlerin tüm hakları yazarlarına ve yayıncılarına aittir. Ayrıntılar için [Telif Hakkı](/sayfa/telif-hakki) sayfasına bak.`,
  },
  {
    title: 'Telif Hakkı (DMCA)',
    slug: 'telif-hakki',
    body: `${note}

Sitedeki eserlerin tüm hakları yazarlarına, çizerlerine ve yayıncılarına aittir. Çevirilerimiz tanıtım amaçlıdır ve ticari bir amaç gütmez; eseri beğendiysen lütfen orijinal yayını satın alarak destekle.

## Kaldırma talebi

Hak sahibiysen ve bir içeriğin kaldırılmasını istiyorsan [İletişim](/sayfa/iletisim) sayfasındaki adrese şu bilgilerle yaz:

1. Hak sahibi olduğunu gösteren bilgi veya belge,
2. Kaldırılmasını istediğin sayfanın adresi,
3. Sana ulaşabileceğimiz iletişim bilgisi.

Geçerli talepleri en kısa sürede inceleyip içeriği kaldırıyoruz.`,
  },
  {
    title: 'Gizlilik Politikası',
    slug: 'gizlilik-politikasi',
    body: `${note}

Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hazırlanması gereken aydınlatma metni için bir başlangıç taslağıdır; yayımlamadan önce kendi durumuna göre tamamla.

## Hangi verileri işliyoruz?

- **Hesap bilgileri:** kullanıcı adı, e-posta adresi ve parolanın şifrelenmiş hâli.
- **Kullanım bilgileri:** okuma geçmişi, kaydedilenler, yorumlar, puanlar ve giriş zamanları.
- **Teknik bilgiler:** IP adresi ve tarayıcı bilgisi (güvenlik ve kötüye kullanımı önleme için).

## Çerezler

Oturumunu açık tutmak, renk şeması gibi tercihlerini hatırlamak ve güvenliği sağlamak için zorunlu çerezler kullanıyoruz. Reklam veya izleme çerezi kullanmıyoruz.

## Haklarını nasıl kullanırsın?

KVKK'nın 11. maddesindeki haklarınla ilgili taleplerini [İletişim](/sayfa/iletisim) sayfasındaki adrese iletebilirsin. Hesabını ve verilerini silmemizi de isteyebilirsin.`,
  },
  {
    title: 'Kullanım Koşulları',
    slug: 'kullanim-kosullari',
    body: `${note}

Siteyi kullanarak aşağıdaki koşulları kabul etmiş olursun.

- Site kişisel ve ticari olmayan kullanım içindir; içerikleri izinsiz kopyalayıp başka yerlerde yayımlama.
- Hesabının güvenliğinden sen sorumlusun; parolanı kimseyle paylaşma.
- Yorumlarda ve profilinde [Yorum Kuralları](/sayfa/yorum-kurallari) geçerlidir.
- Kurallara uymayan hesapları uyarmadan askıya alabiliriz.
- Bu koşulları zaman zaman güncelleyebiliriz; önemli değişiklikleri [duyurularda](/duyurular) paylaşırız.`,
  },
  {
    title: 'Yorum Kuralları',
    slug: 'yorum-kurallari',
    body: `${note}

Yorumlar herkesin keyifle okuyabileceği bir yer olsun diye birkaç kuralımız var:

1. Saygılı ol; hakaret, küfür, nefret söylemi ve kişisel saldırı yok.
2. Sonraki bölümlerden bilgi veriyorsan yorumu **spoiler** olarak işaretle.
3. Reklam, başka sitelerin bağlantıları ve tekrar eden mesajlar yok.
4. Çevirmenleri bölüm için sıkıştırma; emekleri gönüllü.
5. Kurala uymayan yorumlar silinir, tekrarlayan hesaplar askıya alınır.`,
  },
  {
    title: 'İletişim',
    slug: 'iletisim',
    body: `${note}

Soruların, önerilerin, ekip başvuruların ve telif taleplerin için bize ulaşabilirsin.

- **E-posta:** ornek@alanadin.com
- **Discord:** sunucumuzun davet bağlantısını buraya ekle.

Genelde birkaç gün içinde yanıt veriyoruz.`,
  },
]

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('pages', (table) => {
      table.increments('id')
      table.string('title', 120).notNullable()
      table.string('slug', 140).notNullable().unique()
      table.text('body', 'mediumtext').notNullable()
      table.boolean('show_in_footer').notNullable().defaultTo(true)
      table.integer('sort').notNullable().defaultTo(0)
      table.boolean('published').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['published', 'sort'])
    })

    this.schema.createTable('posts', (table) => {
      table.increments('id')
      table.string('title', 160).notNullable()
      table.string('slug', 180).notNullable().unique()
      table.text('body', 'mediumtext').notNullable()
      table.boolean('pinned').notNullable().defaultTo(false)
      table.timestamp('published_at').nullable()
      table
        .integer('author_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['published_at'])
    })

    this.defer(async (db) => {
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
      for (const [sort, page] of starterPages.entries()) {
        const taken = await db.from('pages').where('slug', page.slug).first()
        if (taken) continue
        await db.table('pages').insert({
          title: page.title,
          slug: page.slug,
          body: page.body,
          show_in_footer: true,
          sort: (sort + 1) * 10,
          published: true,
          created_at: timestamp,
          updated_at: timestamp,
        })
      }
    })
  }

  async down() {
    this.schema.dropTable('posts')
    this.schema.dropTable('pages')
  }
}
