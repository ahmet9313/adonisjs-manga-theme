import type { Rng } from './rng.js'

/**
 * Turkish text for the demo community: comments, replies, reviews, bios and names. Templates avoid
 * attaching suffixes to series titles (foreign words break Turkish vowel harmony), so a title only
 * appears as a bare noun.
 */

export type CommentKind =
  | 'praise'
  | 'question'
  | 'prediction'
  | 'complaint'
  | 'thanks'
  | 'joke'
  | 'recommend'
  | 'reaction'

export interface TextContext {
  /** Series title. */
  t: string
  /** Another series title, for comparisons. */
  o: string
  /** Chapter number. */
  n?: number
  /** Name of the person being answered. */
  who?: string
}

export const fill = (template: string, context: TextContext) =>
  template
    .replaceAll('{t}', context.t)
    .replaceAll('{o}', context.o)
    .replaceAll('{n}', String(context.n ?? ''))
    .replaceAll('{who}', context.who ?? '')

/* ---- Top-level comments ---------------------------------------------------------------- */

export const seriesComments: Record<Exclude<CommentKind, 'reaction'>, string[]> = {
  praise: [
    '{t} gerçekten hak ettiği ilgiyi görmüyor, çizimler de hikâye de üst düzey.',
    'Yeni bitirdim ve hâlâ etkisindeyim. Herkese tavsiye ederim!',
    'Çeviri kalitesi çok iyi, akıcı okunuyor. Emeği geçenlere teşekkürler.',
    'İlk bölümlerde biraz yavaş ama ilerledikçe insanı resmen içine çekiyor.',
    'Ana karakterin gelişimi harika işlenmiş, sabırla okuyan pişman olmaz.',
    'Sayfalardaki detaylara bakın, her panel özenle çizilmiş.',
    'Yan karakterlere bile bağlanıyorsun, yazar çok iyi iş çıkarmış.',
    'Dövüş sahnelerindeki akış çok iyi, sayfa sayfa heyecanlanıyorsun.',
    'Atmosferi çok iyi oturtmuşlar, okurken kendimi içinde hissettim.',
    'Tam bir gece okumalık seri, bir baktım sabah olmuş.',
    'Çizer her bölümde kendini aşıyor, kapak sayfaları ayrı güzel.',
    'Bu seriyle birlikte okuma alışkanlığım değişti, her akşam bir bölüm şart oldu 😍',
  ],
  question: [
    'Yeni bölüm ne zaman gelir, takip eden var mı?',
    'Kaçıncı bölümden sonra gerçekten açılıyor? Başlarda biraz yavaş geldi.',
    'Bu serinin animesi ya da dizisi var mı?',
    'Bu seriyi sevenler ne okumalı? Benzer bir şey arıyorum.',
    'Final nasıl, tatmin edici bir bitiş mi? Spoiler vermeden söylerseniz sevinirim.',
    'Okumaya buradan başlamak yeterli mi, öncesinde bilmem gereken bir şey var mı?',
    'Çeviri ekibi genelde ne kadar sürede yeni bölüm çıkarıyor?',
    'Sizce ana karakter hangi bölümde "işte bu" dedirtti?',
  ],
  prediction: [
    'Bence asıl düşman henüz ortaya çıkmadı, şu an yaşananlar sadece ısınma turu.',
    'Teorim: ilk bölümlerdeki o detay sonradan çok önemli çıkacak, not alın 👀',
    'Yazarın planı belli ki uzun vadeli, ipuçları şimdiden serpiştirilmiş.',
    'Final için iki ihtimal görüyorum: ya her şey boşa gidecek ya da büyük bir yüzleşme olacak.',
  ],
  complaint: [
    'Bölümler biraz kısa geliyor, tam ısınmışken bitiyor.',
    'Son zamanlarda tempo düştü gibi, umarım toparlar.',
    'Bazı sayfalar geç yükleniyor, sadece bende mi böyle?',
    'Çeviride birkaç yazım hatası var ama genel olarak çok güzel.',
    'Ara vermeleri çok uzun sürüyor, sabırsızlıkla bekliyoruz…',
  ],
  thanks: [
    'Emeği geçen herkese teşekkürler, hafta sonu keyfimizi siz çıkarıyorsunuz 🙏',
    'Çevirmenlere ve editörlere sonsuz teşekkür, böyle bir site olduğu için çok mutluyum.',
    'Bölümler bu kadar hızlı geliyor, ellerinize sağlık!',
  ],
  joke: [
    "Bir bölüm daha dedim, saat sabahın 5'i oldu 😂",
    'Ben bu seriyi okurken komşular sesime uyandı, kusura bakmayın 😭',
    "Bölüm sonundaki cliffhanger'ı yapan kişiyle hesaplaşacağım.",
    'Yarın sınavım var, bölüm de var… karar verdim 😎',
    'Bu seriyi okuyunca insan kendi hayatına bakıp "ben ne yapıyorum" diyor 😅',
  ],
  recommend: [
    'Arkadaşıma önerdim, o da bayıldı. Herkese tavsiye ederim.',
    '{o} sevdiyseniz buna kesin bir şans verin, benzer bir tadı var.',
    '{t} ile {o} arasında kaldım, siz hangisini seversiniz?',
    'Bu seri neden daha popüler değil anlamıyorum.',
  ],
}

export const chapterComments: string[] = [
  '{n}. bölüm efsaneydi, sonu ne öyle!',
  'Bu bölümü okuyunca tüylerim diken diken oldu.',
  'Çizimler bu bölümde bir başka seviyeye çıkmış.',
  'Sondaki sahneyi üç kere okudum, hâlâ inanamıyorum.',
  'Çevirmene teşekkürler, bu bölüm çok hızlı gelmiş 🙏',
  'Bu bölümdeki espriler çok iyiydi 😂',
  '{n}. bölüm biraz sakin geçti ama sonraki bölümler için hazırlık gibi.',
  'Şu sahnedeki hamle çok akıllıcaydı, yazara saygılar.',
  'Bölümün temposu çok iyiydi, tek seferde okudum.',
  'Bu kadar kısa mıydı? Daha fazlasını istiyorum!',
  'Yeni bölüm gelmiş, hemen koştum 😍',
  'Kapanış sayfası çok iyiydi, devamı için sabırsızım.',
  'Bu bölümde karakterin bakışı her şeyi anlattı.',
  'Bu bölümde eski bir olaya gönderme yapılmış, fark edenler?',
  'Bölüm başlığı da çok yerinde olmuş.',
  'Bölüm sonunu görünce "hayır, olamaz" dedim 😭',
]

export const spoilerComments: string[] = [
  'Sondaki dönüş beklemiyordum, resmen şok oldum.',
  'Bu bölümdeki ifşa her şeyi değiştirdi, artık eskisi gibi bakamıyorum.',
  'Kahramanın verdiği karar çok cesurcaydı ama bedelini ödeyecek gibi.',
  'O karakterin sonunu hiç beklemiyordum, çok üzüldüm.',
]

/* ---- Replies (chosen by what the parent comment was) ----------------------------------- */

export const replyTemplates: Record<CommentKind | 'chat', string[]> = {
  question: [
    'Bence 10. bölümden sonra gerçekten açılıyor, bırakma.',
    'Ben de aynısını sormuştum, devam et pişman olmazsın.',
    'Genelde düzenli geliyor, duyuruları takip et yeter.',
    'Tam bilmiyorum ama benzer arıyorsan {o} bakabilirsin.',
    'Spoiler vermeyeyim ama sonu bence çok güzel 👌',
    'Bir arkadaşım "ilk beş bölüm yavaş, sonra uçuyor" demişti, doğruymuş.',
    'Başından başlaman yeterli, ekstra bir şey bilmen gerekmiyor.',
  ],
  praise: [
    'Aynen katılıyorum, bu seri çok daha fazla ilgiyi hak ediyor!',
    'Ben de bu yüzden sevdim, özellikle çizimler 🔥',
    'Yeni başlayanlara sadece şunu söyleyeyim: bırakmayın.',
    'Hak veriyorum, ben de bir günde yarısını bitirdim.',
    'Doğru söylüyorsun, çeviri de çok akıcı.',
    'Okuyunca anlıyorsun neden herkes bu kadar övüyor.',
  ],
  complaint: [
    'Haklısın ama bence buna değer, devam et.',
    'Bende de aynı sorun vardı, sayfayı yenileyince düzeldi.',
    'Bence ilerleyen bölümlerde toparlıyor.',
    'Sabır lazım 😅 ama bekleyişe değiyor.',
    'Katılıyorum, biraz daha uzun olabilirdi.',
  ],
  joke: [
    '😂😂😂',
    'Aynı ben, sabahladım bir kere.',
    'Yorumun günün yorumu olmuş.',
    'Hahaha çok doğru 😭',
    'Komşuyla aynı durumdayız 😄',
  ],
  prediction: [
    'Bence de öyle olacak, ipuçları çok belli!',
    'Pek sanmıyorum, yazar hep sürpriz yapıyor.',
    'Teori güzel ama şu detay çelişiyor gibi.',
    'Not aldım, bakalım zamanla ortaya çıkacak 👀',
    'İkinci ihtimali daha olası görüyorum.',
  ],
  thanks: [
    'Rica ederiz, keyifli okumalar!',
    'Bizim de en büyük motivasyonumuz bu yorumlar 💚',
    'Teşekkürler, daha iyi çeviriler için çalışıyoruz.',
  ],
  recommend: [
    'Ben de öneririm, sonuna kadar götürüyor.',
    'Benzer arıyorsanız {o} da güzel.',
    'Hangisini seçeceğine karar verdin mi?',
  ],
  reaction: [
    'Aynen, ben de çok şaşırdım!',
    'Bu bölümden sonra bir sonrakini beklemek işkence.',
    'Çizimlere bayıldım bu bölümde.',
    'Kesinlikle, o sahneyi ben de tekrar okudum.',
    'Evet! Ben de aynısını düşündüm.',
  ],
  chat: [
    'Haklısın.',
    'Hmm, hiç öyle düşünmemiştim.',
    'Bence biraz abartıyorsun ama saygı duyarım 😄',
    'Kesinlikle katılıyorum.',
    'Peki sence neden öyle yaptı?',
    'Güldüm şimdi 😂',
    'Bence de.',
    'Aynı fikirdeyim, özellikle son kısım.',
    'Bu arada bölümleri sırayla mı okuyorsun?',
    'Teşekkürler, bakacağım!',
    'Haha evet, tam olarak!',
    'Bence tartışmaya değer bir konu bu.',
  ],
}

/** Which GIFs fit which kind of comment. */
export const gifFor: Record<CommentKind | 'chat', string[]> = {
  praise: ['kalp', 'yildiz', 'alkis', 'gg'],
  question: ['dusunuyor', 'yukleniyor', 'uyku'],
  complaint: ['aglama', 'kizgin', 'sok'],
  joke: ['kahkaha', 'dans', 'konfeti', 'uyku'],
  thanks: ['kalp', 'alkis'],
  prediction: ['dusunuyor', 'sok'],
  recommend: ['yildiz', 'alkis', 'gg'],
  reaction: ['sok', 'ates', 'konfeti', 'kahkaha'],
  chat: ['kahkaha', 'dans', 'alkis'],
}

/* ---- Writing styles -------------------------------------------------------------------- */

export type Voice = 'normal' | 'lower' | 'emoji' | 'stretch' | 'formal' | 'shout'

const emojis = ['😂', '🔥', '😭', '💚', '👏', '😍', '🥲', '🙏', '✨', '😎', '🤯', '💀']

export function applyVoice(text: string, voice: Voice, rng: Rng) {
  switch (voice) {
    case 'lower':
      return text
        .replace(/^(\S)/u, (first) => first.toLocaleLowerCase('tr-TR'))
        .replace(/[.!]+$/u, '')
    case 'emoji':
      return /\p{Extended_Pictographic}$/u.test(text) ? text : `${text} ${rng.pick(emojis)}`
    case 'stretch':
      return text
        .replace(/çok /u, 'çooook ')
        .replace(/harika/u, 'harikaaa')
        .replace(/güzel/u, 'güzeeel')
        .replace(/!+$/u, '!!!')
    case 'formal':
      return rng.chance(0.4)
        ? `Merhaba, ${text.charAt(0).toLocaleLowerCase('tr-TR')}${text.slice(1)}`
        : text
    case 'shout':
      return rng.chance(0.6)
        ? text.replace(
            /([^.!?]*?)([.!?…]?)$/u,
            (_, body: string, mark: string) => `${body.toLocaleUpperCase('tr-TR')}${mark}`
          )
        : text
    default:
      return text
  }
}

/* ---- Reviews --------------------------------------------------------------------------- */

const genreFlavor: Record<string, string> = {
  'Aksiyon': 'Aksiyon sahneleri akıcı ve heyecan verici.',
  'Macera': 'Macera hissi çok iyi verilmiş.',
  'Shounen': 'Klasik shounen enerjisi taşıyor ama sıkıcı değil.',
  'Dövüş Sanatları': 'Dövüş koreografileri göz dolduruyor.',
  'Dram': 'Duygusal sahneler insanı gerçekten vuruyor.',
  'Korku': 'Atmosfer ürkütücü ve gerçekten tedirgin ediyor.',
  'Gerilim': 'Gerilim hiç düşmüyor, her bölüm sonunda merak ediyorsun.',
  'Psikolojik': 'Psikolojik derinliği şaşırtıcı.',
  'Doğaüstü': 'Doğaüstü unsurlar yaratıcı kullanılmış.',
  'Komedi': 'Espriler yerinde, çoğu gerçekten güldürüyor.',
  'Romantizm': 'Karakterler arasındaki kimya çok güzel.',
  'Fantastik': 'Fantastik dünya zengin ve ayrıntılı.',
  'Okul': 'Okul hayatı atmosferi çok iyi yakalanmış.',
  'Spor': 'Spor sahneleri gerçekten heyecanlı.',
  'Gizem': 'Gizem unsuru sürekli merakta tutuyor.',
  'Bilim Kurgu': 'Bilim kurgu dünyası düşünülmüş ve tutarlı.',
  'Tarihi': 'Tarihi atmosfer çok iyi işlenmiş.',
  'Slice of Life': 'Gündelik anların samimiyeti çok sıcak.',
  'Reenkarnasyon': 'Reenkarnasyon konusu klişe olsa da taze bir bakış açısı var.',
  'Oyun': 'Oyun mekaniklerinin hikâyeye entegrasyonu eğlenceli.',
  'Seinen': 'Seinen olgunluğu hissediliyor.',
  'Mitoloji': 'Mitolojik göndermeler hoş.',
  'Aile': 'Aile bağları güzel işlenmiş.',
  'Girls Love': 'Romantik anlar çok tatlı.',
  'Yuri': 'Romantik anlar çok tatlı.',
}

type Tier = 'rave' | 'good' | 'mixed' | 'bad'
const tierOf = (rating: number): Tier =>
  rating >= 9 ? 'rave' : rating >= 7 ? 'good' : rating >= 5 ? 'mixed' : 'bad'

const intros: Record<Tier, string[]> = {
  rave: [
    'Uzun zamandır bu kadar etkilendiğim bir seri okumamıştım.',
    '{t} benim için türünün zirvelerinden biri.',
    'Tek kelimeyle: muhteşem. Başladığım günden beri aklımdan çıkmıyor.',
    'Bu seriyi keşfettiğim için çok mutluyum.',
  ],
  good: [
    'Beklentimin üzerinde çıkan, keyifle okuduğum bir seri.',
    '{t} kusursuz değil ama ciddi şekilde eğlenceli.',
    'Genel olarak çok sevdim, birkaç küçük eksiği var.',
    'Önerilere uyup başladım, pişman olmadım.',
  ],
  mixed: [
    '{t} iyi fikirlere sahip ama uygulaması dalgalı.',
    'Başı güzel, ortası tartışmalı; yine de yarım bırakmadım.',
    "Hype'ı biraz fazla bulmuş olabilirim, orta karar bir deneyim.",
  ],
  bad: [
    "Hype'a kapılıp başladım ama beni tatmin etmedi.",
    'Bu seriyi sevmeye çalıştım ama olmadı.',
    'Açıkçası beklentim yüksekti, hayal kırıklığı yaşadım.',
  ],
}

const story: Record<Tier, string[]> = {
  rave: [
    'Hikâye ilerledikçe derinleşiyor, her bölümde yeni bir şey öğreniyorsun.',
    'Olay örgüsü sürprizlerle dolu ve hiçbir bölüm gereksiz hissettirmiyor.',
    'Dünya kurulumu çok iyi düşünülmüş.',
  ],
  good: [
    'Hikâye sağlam, arada tahmin edilebilir yerler olsa da akıcı.',
    'Olay örgüsü ilgiyi canlı tutuyor.',
  ],
  mixed: [
    'Hikâye genel olarak iyi ama bazı bölümlerde dolgu hissi var.',
    'Olay örgüsü tahmin edilebilir yerler içeriyor ama yine de akıcı.',
  ],
  bad: ['Hikâye ilerledikçe ilgimi kaybettim.', 'Olay örgüsü dağınık ve bazı yerler mantıksız.'],
}

const art: Record<Tier, string[]> = {
  rave: [
    'Çizimler gerçekten üst seviye, kadrajlar sinema gibi.',
    'Sanatçı detaylara çok özen göstermiş, kapak sayfaları ayrı güzel.',
  ],
  good: ['Çizimler temiz ve okunaklı, bazı sahneler gerçekten çok iyi.'],
  mixed: ['Çizimler idare eder, bazı sahnelerde detay eksik.'],
  bad: ['Çizimler benim zevkime hitap etmedi.'],
}

const characters: Record<Tier, string[]> = {
  rave: [
    'Karakterler çok iyi yazılmış, yan karakterlere bile bağlanıyorsun.',
    'Ana karakterin gelişimi çok doğal ilerliyor.',
  ],
  good: ['Karakterler sevimli, motivasyonları anlaşılır.'],
  mixed: ['Karakterler fena değil ama bazıları yüzeysel kalmış.'],
  bad: ['Karakterlere bir türlü ısınamadım.'],
}

const pacing: Record<Tier, string[]> = {
  rave: ['Tempo çok iyi ayarlanmış, sıkılmadan okudum.'],
  good: ['Tempo genelde iyi, ara sıra yavaşlıyor.'],
  mixed: ['Tempo bazen düşüyor, biraz sabır gerektiriyor.'],
  bad: ['Tempo çok yavaş, bazı bölümlerde neredeyse hiçbir şey olmuyor.'],
}

const translation: Record<Tier, string[]> = {
  rave: ['Türkçe çeviri akıcı, emeği geçenlere teşekkürler.'],
  good: ['Çeviri akıcı, küçük pürüzler dışında sorun yok.'],
  mixed: ['Çeviride ufak pürüzler var ama anlaşılır.'],
  bad: [],
}

const closing: Record<Tier, string[]> = {
  rave: [
    'Türü seviyorsanız kesinlikle şans verin.',
    'Kısaca: okuyun, okutun.',
    'Benim için tam puan, tekrar okuyacağım.',
  ],
  good: ['Tavsiye ederim, ilk bölümlerde pes etmeyin.', 'Zamanı olan bir şans versin.'],
  mixed: [
    'Tavsiye ederim ama beklentiyi biraz düşük tutun.',
    'Türün hayranıysanız bakabilirsiniz.',
  ],
  bad: [
    'Sadece belirli bir kitleye hitap ediyor, ben o kitlede değilmişim.',
    'Zamanınızı daha iyi kullanabilirsiniz.',
  ],
}

const reviewTitles: Record<Tier, string[]> = {
  rave: [
    'Başyapıtlık bir macera',
    'Uzun zamandır okuduğum en iyi seri',
    'Kesinlikle okunmalı',
    'Bağımlılık yapıyor',
    'Hak ettiği değeri görmüyor',
  ],
  good: [
    'Beklediğimden iyi',
    'Keyifli bir okuma',
    'Genel olarak çok iyi',
    'Küçük eksiklere rağmen güzel',
  ],
  mixed: [
    'Orta karar',
    'Fena değil ama…',
    'İyi fikir, dalgalı uygulama',
    'Başı güzel, sonrası tartışmalı',
  ],
  bad: ['Hayal kırıklığı', 'Beklentimi karşılamadı', 'Bana göre değil', 'Hype fazla'],
}

export interface ReviewSubject {
  title: string
  other: string
  genres: string[]
}

export function writeReview(rating: number, subject: ReviewSubject, rng: Rng) {
  const tier = tierOf(rating)
  const context: TextContext = { t: subject.title, o: subject.other }
  const flavor = subject.genres.map((genre) => genreFlavor[genre]).filter(Boolean)
  const parts = [
    rng.pick(intros[tier]),
    ...(flavor.length && tier !== 'bad' && rng.chance(0.75) ? [rng.pick(flavor)] : []),
    rng.pick(story[tier]),
    ...(rng.chance(0.8) ? [rng.pick(art[tier])] : []),
    ...(rng.chance(0.7) ? [rng.pick(characters[tier])] : []),
    ...(rng.chance(0.45) ? [rng.pick(pacing[tier])] : []),
    ...(translation[tier].length && rng.chance(0.4) ? [rng.pick(translation[tier])] : []),
    rng.pick(closing[tier]),
  ]
  const short = rng.chance(0.3)
  const body = (short ? [parts[0], parts[parts.length - 1]] : parts).join(' ')
  return {
    title: rng.chance(0.75) ? rng.pick(reviewTitles[tier]) : null,
    body: fill(body, context),
  }
}

/* ---- People ---------------------------------------------------------------------------- */

export const bios: string[] = [
  'Geceleri manhwa okuyan bir bilgisayar mühendisi adayı.',
  "Shounen'in kalbi burada atıyor ⚔️",
  'Her hafta yeni bir seri keşfetmeye çalışıyorum.',
  'Webtoon bağımlısı | çay tiryakisi 🍵',
  'Çevirmen adayıyım, Japonca öğreniyorum 🇯🇵',
  'Hayatım: okul, ders, manga. Sırayla değil.',
  'Fantastik dünyaların daimi misafiri.',
  'Çizim yapıyorum, manga okuyorum, kahve içiyorum ☕',
  'Romantik komedi sevenler beni bulsun 💕',
  'Dövüş sahneleri için yaşıyorum 🥊',
  'Novel okuru. Görsel okuyunca gözlerim yoruluyor 😅',
  'Spoiler vermeyin, ben okurken ağlarım.',
  'Günde 1 bölüm kuralı… bozulmak için konmuş.',
  'Önerilerim için incelemelerime bakın 📚',
  'Kendi çapımda eleştirmen 🎭',
  'Manga koleksiyonu yapıyorum, kartları da topluyorum 🃏',
  'Okumaya yetişemiyorum, yeni bölüm çok.',
  'Korku ve gerilim olmadan gün geçmez.',
  'Seinen > her şey. Tartışmaya açığım.',
  'Isekai görünce elim kendiliğinden gidiyor.',
  'Yorumlara yanıt yazmayı seviyorum, sohbete bekleriz!',
  'Her gün giriş yapıp serimi bozmamaya çalışıyorum 🔥',
  '',
  '',
  '',
]

export const firstNames: string[] = [
  'Kaan',
  'Elif Naz',
  'Baran',
  'Zeynep',
  'Mert',
  'Selin',
  'Burak',
  'Derya',
  'Emre',
  'Gizem',
  'Onur',
  'Merve',
  'Yiğit',
  'Ece',
  'Cem',
  'Buse',
  'Arda',
  'İrem',
  'Tolga',
  'Naz',
  'Berk',
  'Defne',
  'Efe',
  'Sude',
  'Kerem',
  'Aslı',
  'Can',
  'Pelin',
  'Ozan',
  'Ceren',
  'Furkan',
  'Melis',
  'Deniz',
  'Ada',
  'Umut',
  'Beren',
  'Alp',
  'Hande',
  'Kuzey',
  'Yaren',
  'Eren',
  'Nehir',
  'Tuna',
  'Ilgın',
  'Doruk',
  'Esra',
  'Rüzgâr',
  'Simge',
  'Barış',
  'Ayça',
  'Koray',
  'Büşra',
  'Taner',
  'Dilara',
  'Mete',
  'Sena',
  'Volkan',
  'Tuğçe',
  'Anıl',
  'Gamze',
  'Ufuk',
  'Beyza',
  'Ege',
  'Lale',
  'Murat',
  'Nil',
  'Hakan',
  'Özge',
  'Sinan',
  'İpek',
  'Orhan',
  'Cansu',
  'Batu',
  'Ela',
]

export const handleSuffixes: string[] = [
  '_okur',
  '_senpai',
  '_manga',
  'x',
  '_chan',
  '_01',
  'reads',
  '_tr',
  '_san',
  '_webtoon',
  '_kun',
  '_oku',
]
export const handlePrefixes: string[] = ['', '', '', 'the_', 'neo_', 'dark_', 'mr_', 'kitap_']

export const displayTags: string[] = [
  '',
  '',
  '',
  ' ⚔️',
  ' 📚',
  ' | Okur',
  ' 🌙',
  ' ✨',
  ' | Manga Avcısı',
  ' 🔥',
  ' 🎭',
  ' ☕',
]

export const slug = (text: string) =>
  text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/[^a-z0-9]+/g, '')

/** Messages demo readers send to real accounts' comments, profiles and reviews. */
export const incomingTitles = {
  reply: (name: string) => `${name} yorumuna yanıt verdi`,
  profileLike: (name: string) => `${name} profilini beğendi`,
}
