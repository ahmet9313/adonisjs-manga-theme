import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import ContentType from '#models/content_type'
import Genre from '#models/genre'
import Author from '#models/author'
import Artist from '#models/artist'
import SeriesModel from '#models/series'

// ---------- DATA from generate-data.mjs ----------

const SERIES_DATA = [
  // MANGA (10)
  { title: 'Naruto', slug: 'naruto', type: 'manga', alt: ['ナルト'], desc: 'Naruto Uzumaki, köyünün en güçlü ninjası Hokage olmayı hayal eden genç bir ninjadir. İçinde dokuz kuyruklu tilki Kurama\'yı barındırır.', author: 'Masashi Kishimoto', artist: 'Masashi Kishimoto', year: 2002, age: '13+', genres: ['Aksiyon', 'Macera', 'Shounen', 'Dövüş Sanatları'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: true, featuredDesc: 'Efsanevi ninja destanı! Naruto\'nun Hokage olma yolculuğu.', chapters: 20 },
  { title: 'One Piece', slug: 'one-piece', type: 'manga', alt: ['ワンピース'], desc: 'Monkey D. Luffy, Korsan Kralı olmak için yola çıkar. Lastik güçleriyle dünyayı dolaşır ve nakama toplar.', author: 'Eiichiro Oda', artist: 'Eiichiro Oda', year: 1999, age: '13+', genres: ['Aksiyon', 'Macera', 'Komedi', 'Shounen'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: true, featuredDesc: 'Korsan Kralı olma yolundaki büyük macera!', chapters: 20 },
  { title: 'Attack on Titan', slug: 'attack-on-titan', type: 'manga', alt: ['Shingeki no Kyojin', '進撃の巨人'], desc: 'İnsanlık, devasa titanların tehdidi altında duvarlarin arkasinda yaşamaktadır. Eren Yeager, annesinin ölümünden sonra tüm titanları yok etmeye yemin eder.', author: 'Hajime Isayama', artist: 'Hajime Isayama', year: 2009, age: '18+', genres: ['Aksiyon', 'Dram', 'Korku', 'Gerilim'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: true, featuredDesc: 'Titanların dünyasında hayatta kalma mücadelesi!', chapters: 13 },
  { title: 'Death Note', slug: 'death-note', type: 'manga', alt: ['デスノート'], desc: 'Light Yagami, ölüm tanrısının defterini bulur. Bu deftere adını yazdığı herkes ölür. Light, dünyayı suçlulardan temizlemeye karar verir.', author: 'Tsugumi Ohba', artist: 'Takeshi Obata', year: 2003, age: '16+', genres: ['Gerilim', 'Psikolojik', 'Doğaüstü', 'Gizem'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 10 },
  { title: 'Jujutsu Kaisen', slug: 'jujutsu-kaisen', type: 'manga', alt: ['呪術廻戦', 'Büyü Savaşı'], desc: 'Yuji Itadori, lanetli bir parmağı yuttuktan sonra lanetlerin dünyasına adım atar. Şimdi güçlü büyücülerle birlikte lanetlilere karşı savaşmalıdır.', author: 'Gege Akutami', artist: 'Gege Akutami', year: 2018, age: '16+', genres: ['Aksiyon', 'Doğaüstü', 'Shounen', 'Okul'], status: 'Tamamlandı', tStatus: 'Aktif', featured: true, featuredDesc: 'Lanetlere karşı büyük savaş başlıyor!', chapters: 20 },
  { title: 'Chainsaw Man', slug: 'chainsaw-man', type: 'manga', alt: ['チェンソーマン'], desc: 'Denji, testere şeytan Pochita ile birleşerek Chainsaw Man\'e dönüşür. Şeytan avcıları organizasyonunda çalışarak borçlarını ödemeye çalışır.', author: 'Tatsuki Fujimoto', artist: 'Tatsuki Fujimoto', year: 2018, age: '18+', genres: ['Aksiyon', 'Korku', 'Doğaüstü', 'Seinen'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 17 },
  { title: 'Demon Slayer', slug: 'demon-slayer', type: 'manga', alt: ['Kimetsu no Yaiba', '鬼滅の刃'], desc: 'Tanjiro Kamado, ailesi iblisler tarafından katledildikten sonra iblise dönüşen kız kardeşini kurtarmak için iblis avcısı olur.', author: 'Koyoharu Gotouge', artist: 'Koyoharu Gotouge', year: 2016, age: '16+', genres: ['Aksiyon', 'Doğaüstü', 'Shounen', 'Tarihi'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 20 },
  { title: 'Black Clover', slug: 'black-clover', type: 'manga', alt: ['ブラッククローバー'], desc: 'Sihirsiz doğan Asta, Büyücü Kral olmayı hedefler. Anti-sihir güçleriyle en güçlü büyücüler arasına girmeye çalışır.', author: 'Yuki Tabata', artist: 'Yuki Tabata', year: 2015, age: '13+', genres: ['Aksiyon', 'Komedi', 'Fantastik', 'Shounen'], status: 'Bırakıldı', tStatus: 'Bırakıldı', featured: false, chapters: 15 },
  { title: 'Bleach', slug: 'bleach', type: 'manga', alt: ['ブリーチ'], desc: 'Ichigo Kurosaki, bir Shinigami\'nin güçlerini devralarak ruhları koruyan bir ölüm tanrısı olur. Soul Society\'nin karanlık sırlarını ortaya çıkarır.', author: 'Tite Kubo', artist: 'Tite Kubo', year: 2001, age: '13+', genres: ['Aksiyon', 'Macera', 'Doğaüstü', 'Shounen'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 20 },
  { title: 'Dragon Ball Super', slug: 'dragon-ball-super', type: 'manga', alt: ['ドラゴンボール超'], desc: 'Son Goku ve arkadaşları, evrenler arası dövüş turnuvasına katılır. Yeni düşmanlar ve yeni güç seviyeleri onları beklemektedir.', author: 'Akira Toriyama', artist: 'Toyotarou', year: 2015, age: '13+', genres: ['Aksiyon', 'Komedi', 'Bilim Kurgu', 'Shounen'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 10 },

  // MANHWA (8)
  { title: 'Solo Leveling', slug: 'solo-leveling', type: 'manhwa', alt: ['나 혼자만 레벨업', 'Tek Başına Seviye Atlama'], desc: 'Dünyanın en zayıf avcısı Sung Jin-Woo, gizemli bir zindan görevinden sonra seviye atlayabilen tek insan olur. Gücü sınırsızca artmaya başlar.', author: 'Chugong', artist: 'Dubu', year: 2018, age: '16+', genres: ['Aksiyon', 'Fantastik', 'Macera', 'Oyun'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: true, featuredDesc: 'En zayıf avcıdan en güçlüye! Efsanevi yükseliş.', chapters: 20 },
  { title: 'Tower of God', slug: 'tower-of-god', type: 'manhwa', alt: ['신의 탑', 'Tanrı Kulesi'], desc: 'Bam, en yakın arkadaşı Rachel\'ı bulmak için gizemli Kule\'ye girer. Her katı geçmek için ölümcül testlerden geçmesi gerekir.', author: 'SIU', artist: 'SIU', year: 2010, age: '16+', genres: ['Aksiyon', 'Fantastik', 'Macera', 'Gizem'], status: 'Bırakıldı', tStatus: 'Bırakıldı', featured: false, chapters: 18 },
  { title: 'The Beginning After the End', slug: 'the-beginning-after-the-end', type: 'manhwa', alt: ['끝이 아닌 시작'], desc: 'Güçlü bir kral, yeniden doğarak yeni bir dünyada maceraya atılır. Önceki hayatının bilgisiyle bu dünyada zirvreye çıkmayı hedefler.', author: 'TurtleMe', artist: 'Fuyuki23', year: 2018, age: '13+', genres: ['Aksiyon', 'Fantastik', 'Macera', 'Reenkarnasyon'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 19 },
  { title: 'Omniscient Reader', slug: 'omniscient-reader', type: 'manhwa', alt: ['전지적 독자 시점', 'Her Şeyi Bilen Okuyucu'], desc: 'Kim Dokja, yıllardır okuduğu web romanının gerçek olduğu bir dünyada uyanır. Hikayenin sonunu bilen tek kişi olarak hayatta kalmaya çalışır.', author: 'Sing Shong', artist: 'Sleepy-C', year: 2020, age: '16+', genres: ['Aksiyon', 'Fantastik', 'Psikolojik', 'Oyun'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: true, featuredDesc: 'Romanın kahramanı sen olduğunda ne yaparsın?', chapters: 16 },
  { title: 'True Beauty', slug: 'true-beauty', type: 'manhwa', alt: ['여신강림', 'Gerçek Güzellik'], desc: 'Makyaj ustası Jugyeong, okuldaki popülerliğini makyajsız yüzünün sırrını saklayarak korumaya çalışır.', author: 'Yaongyi', artist: 'Yaongyi', year: 2018, age: '13+', genres: ['Romantizm', 'Komedi', 'Okul', 'Slice of Life'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 12 },
  { title: 'Sweet Home', slug: 'sweet-home', type: 'manhwa', alt: ['스위트홈'], desc: 'İnsanlar canavar haline dönüşmeye başlayınca, bir apartman sakinleri hayatta kalmak için mücadele eder.', author: 'Youngchan Hwang', artist: 'Carnby Kim', year: 2017, age: '18+', genres: ['Korku', 'Gerilim', 'Dram', 'Doğaüstü'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 140 },
  { title: 'Falling', slug: 'falling', type: 'manhwa', alt: ['폴링', 'Chute Libre'], desc: 'Ömür boyu suç dünyasında yaşamış Seungji, eski patronu tarafından ihanete uğrayınca ortadan kaybolmak için yeni kurulmuş bir kaçakçılık işine katılır.', author: 'Gye Cha Suyeol', artist: 'Eunsu, Dog', year: 2024, age: '18+', genres: ['Aksiyon', 'Dram', 'Girls Love', 'Yuri'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 45 },
  { title: 'Lookism', slug: 'lookism', type: 'manhwa', alt: ['외모지상주의'], desc: 'Park Hyung-seok, çirkin görünümü yüzünden zorbalığa uğrar. Bir gün yakışıklı bir bedene sahip olur ve iki beden arasında geçiş yapabilir.', author: 'Park Tae-jun', artist: 'Park Tae-jun', year: 2014, age: '16+', genres: ['Aksiyon', 'Dram', 'Okul', 'Komedi'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 20 },

  // MANHUA (4)
  { title: 'Tales of Demons and Gods', slug: 'tales-of-demons-and-gods', type: 'manhua', alt: ['妖神记', 'İblis ve Tanrıların Hikayesi'], desc: 'Nie Li, geçmişe dönerek şehrini yıkımdan kurtarmaya ve en güçlü iblis ruhu ustası olmaya çalışır.', author: 'Mad Snail', artist: 'Jiang Ruotai', year: 2015, age: '13+', genres: ['Aksiyon', 'Fantastik', 'Macera', 'Reenkarnasyon'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 20 },
  { title: 'Martial Peak', slug: 'martial-peak', type: 'manhua', alt: ['武炼巅峰', 'Dövüş Zirvesi'], desc: 'Yang Kai, sıradan bir hizmetçiden dövüş sanatlarının zirvesine tırmanır. Gizemli bir kitap onun kaderini sonsuza dek değiştirir.', author: 'Momo', artist: 'Pikapi', year: 2015, age: '16+', genres: ['Aksiyon', 'Dövüş Sanatları', 'Fantastik', 'Macera'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 20 },
  { title: 'Soul Land', slug: 'soul-land', type: 'manhua', alt: ['斗罗大陆', 'Ruh Diyarı'], desc: 'Tang San, zehir ustası olarak yeniden doğar ve ruh ustası olmak için eğitim alır. Ruh halkalarını toplayarak güçlenir.', author: 'Tang Jia San Shao', artist: 'Mu Fengchun', year: 2012, age: '13+', genres: ['Aksiyon', 'Fantastik', 'Macera', 'Reenkarnasyon'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 20 },
  { title: 'Battle Through the Heavens', slug: 'battle-through-the-heavens', type: 'manhua', alt: ['斗破苍穹', 'Göklere Meydan Okuyan Savaş'], desc: 'Xiao Yan, tüm güçlerini kaybettikten sonra yeniden yükselmeye and içer. Eski nişanlısını alt etmek ve ailesinin onurunu korumak için savaşır.', author: 'Tian Can Tu Dou', artist: 'Ren One', year: 2012, age: '13+', genres: ['Aksiyon', 'Fantastik', 'Dövüş Sanatları', 'Macera'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 20 },

  // NOVEL (3)
  { title: 'Mushoku Tensei', slug: 'mushoku-tensei', type: 'novel', alt: ['無職転生', 'İşsiz Yeniden Doğuş'], desc: '34 yaşında işsiz bir adam, fantastik bir dünyada yeniden doğar. Bu sefer hayatını boşa harcamamaya yemin eder ve büyücü olarak büyür.', author: 'Rifujin na Magonote', artist: '-', year: 2012, age: '18+', genres: ['Fantastik', 'Macera', 'Dram', 'Reenkarnasyon'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 80 },
  { title: 'Overlord', slug: 'overlord', type: 'novel', alt: ['オーバーロード'], desc: 'Bir MMORPG oyuncusu, oyun kapanırken içinde kalır ve iskelet lord Ainz Ooal Gown olarak yeni bir dünyayı fethetmeye başlar.', author: 'Kugane Maruyama', artist: 'so-bin', year: 2012, age: '16+', genres: ['Fantastik', 'Macera', 'Doğaüstü', 'Oyun'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 60 },
  { title: 'Re:Zero', slug: 're-zero', type: 'novel', alt: ['Re:ゼロから始める異世界生活', 'Sıfırdan Başlayan İsekai Yaşamı'], desc: 'Subaru Natsuki, bir fantezi dünyasına ışınlanır ve öldüğünde belirli bir noktaya geri döner. Bu acı döngüyü kırarak sevdiklerini kurtarmaya çalışır.', author: 'Tappei Nagatsuki', artist: 'Shinichirou Otsuka', year: 2014, age: '16+', genres: ['Fantastik', 'Dram', 'Psikolojik', 'Gerilim'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 50 },

  // WEBTOON (3)
  { title: 'Summer Season', slug: 'summer-season', type: 'webtoon', alt: ['여름 시즌'], desc: 'Sıcak bir yaz gününde başlayan beklenmedik bir aşk hikayesi.', author: 'Kim Soo-jin', artist: 'Kim Soo-jin', year: 2023, age: '13+', genres: ['Romantizm', 'Okul', 'Dram', 'Slice of Life'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 35 },
  { title: 'Lore Olympus', slug: 'lore-olympus', type: 'webtoon', alt: ['Olimpos Efsaneleri'], desc: 'Persephone ve Hades\'in modern bir yorumuyla anlatılan mitolojik aşk hikayesi. Olimpos tanrılarının karmaşık ilişkileri.', author: 'Rachel Smythe', artist: 'Rachel Smythe', year: 2018, age: '16+', genres: ['Romantizm', 'Fantastik', 'Dram', 'Mitoloji'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 10 },
  { title: 'UnOrdinary', slug: 'unordinary', type: 'webtoon', alt: ['언오디너리', 'Sıra Dışı'], desc: 'Süper güçlerin normal olduğu bir dünyada, güçsüz görünen John\'un karanlık bir geçmişi vardır. Okulundaki hiyerarşiyi alt üst eder.', author: 'uru-chan', artist: 'uru-chan', year: 2016, age: '16+', genres: ['Aksiyon', 'Okul', 'Doğaüstü', 'Dram'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 16 },

  // YENİ SERİLER (25)
  // MANGA (7)
  { title: 'My Hero Academia', slug: 'my-hero-academia', type: 'manga', alt: ['僕のヒーローアカデミア', 'Boku no Hero Academia'], desc: 'Süper güçlerin norm olduğu bir dünyada güçsüz doğan Izuku Midoriya, en büyük kahraman olma hayaliyle yanıp tutuşur. Efsanevi kahraman All Might\'tan güç devralarak kahraman akademisine katılır.', author: 'Kohei Horikoshi', artist: 'Kohei Horikoshi', year: 2014, age: '13+', genres: ['Aksiyon', 'Komedi', 'Shounen', 'Okul'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 18 },
  { title: 'Tokyo Ghoul', slug: 'tokyo-ghoul', type: 'manga', alt: ['東京喰種', 'Tokyo Gul'], desc: 'Ken Kaneki, bir ghoul saldırısından sonra yarı-ghoul\'a dönüşür. İnsan ve ghoul dünyası arasında sıkışıp kalır ve kimliğiyle yüzleşmek zorunda kalır.', author: 'Sui Ishida', artist: 'Sui Ishida', year: 2011, age: '18+', genres: ['Aksiyon', 'Korku', 'Psikolojik', 'Seinen'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 14 },
  { title: 'Spy x Family', slug: 'spy-x-family', type: 'manga', alt: ['スパイファミリー'], desc: 'Casus Twilight, görev için sahte bir aile kurar. Ancak evlat edindiği kız zihin okuyabilir, eşi ise gizli bir suikastçıdır. Hiçbiri diğerinin sırrını bilmez.', author: 'Tatsuya Endo', artist: 'Tatsuya Endo', year: 2019, age: '13+', genres: ['Aksiyon', 'Komedi', 'Aile', 'Shounen'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 11 },
  { title: 'Vinland Saga', slug: 'vinland-saga', type: 'manga', alt: ['ヴィンランド・サガ'], desc: 'Viking savaşçısı Thorfinn, babasının katili Askeladd\'a intikam yemini eder. Savaş ve barış arasında zorlu bir yolculuğa çıkar.', author: 'Makoto Yukimura', artist: 'Makoto Yukimura', year: 2005, age: '18+', genres: ['Aksiyon', 'Dram', 'Tarihi', 'Seinen'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 20 },
  { title: 'Hunter x Hunter', slug: 'hunter-x-hunter', type: 'manga', alt: ['ハンター×ハンター'], desc: 'Gon Freecss, babasını bulmak için Hunter sınavına girer. Arkadaşlarıyla birlikte tehlikeli maceralara atılır ve karanlık kıtayı keşfeder.', author: 'Yoshihiro Togashi', artist: 'Yoshihiro Togashi', year: 1998, age: '16+', genres: ['Aksiyon', 'Macera', 'Fantastik', 'Shounen'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 17 },
  { title: 'Fullmetal Alchemist', slug: 'fullmetal-alchemist', type: 'manga', alt: ['鋼の錬金術師', 'Çelik Simyacı'], desc: 'Edward ve Alphonse Elric kardeşler, annelerini diriltmek için yasak simya kullanırlar ve ağır bedeller öderler. Felsefe taşını arayarak bedenlerini geri kazanmaya çalışırlar.', author: 'Hiromu Arakawa', artist: 'Hiromu Arakawa', year: 2001, age: '16+', genres: ['Aksiyon', 'Macera', 'Dram', 'Fantastik'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 11 },
  { title: 'One Punch Man', slug: 'one-punch-man', type: 'manga', alt: ['ワンパンマン', 'Tek Yumruk Adam'], desc: 'Saitama, tek yumrukla her düşmanı yenebilen bir kahramandır. Ancak bu güç onu sıkmaktadır. Gerçek bir rakip arayışındadır.', author: 'ONE', artist: 'Yusuke Murata', year: 2012, age: '13+', genres: ['Aksiyon', 'Komedi', 'Parodİ', 'Seinen'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 19 },

  // MANHWA (6)
  { title: 'Nano Machine', slug: 'nano-machine', type: 'manhwa', alt: ['나노 머신', 'Nano Makine'], desc: 'Cheon Yeo-woon, geleceğinden gelen bir torun sayesinde vücuduna nano makineler enjekte edilir. Demonic Cult\'un en güçlü savaşçısı olmak için yola çıkar.', author: 'Han Joong Wueol Ya', artist: 'BKGL', year: 2020, age: '16+', genres: ['Aksiyon', 'Dövüş Sanatları', 'Fantastik', 'Bilim Kurgu'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 17 },
  { title: 'Eleceed', slug: 'eleceed', type: 'manhwa', alt: ['일렉시드'], desc: 'Hayvan sever Jiwoo, güçlü bir kediye dönüşmüş uyanıcı Kayden ile tanışır. İkisi birlikte uyanıcılar dünyasında güçlenmeye başlar.', author: 'Son Je-Ho', artist: 'ZHENA', year: 2018, age: '13+', genres: ['Aksiyon', 'Komedi', 'Doğaüstü', 'Okul'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 20 },
  { title: 'Tomb Raider King', slug: 'tomb-raider-king', type: 'manhwa', alt: ['도굴왕', 'Mezar Hırsızı Kral'], desc: 'Soo-il, gizemli kalıntıların dünyayı istila ettiği bir çağda geçmişe döner. Tüm güçlü kalıntıları toplamak ve dünyayı kontrol etmek ister.', author: 'SAN.G', artist: '3B2S', year: 2019, age: '16+', genres: ['Aksiyon', 'Fantastik', 'Macera', 'Oyun'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 15 },
  { title: 'Return of the Mount Hua Sect', slug: 'return-of-mount-hua-sect', type: 'manhwa', alt: ['화산귀환', 'Hua Dağı Tarikatının Dönüşü'], desc: 'Chung Myung, yüz yıl önce ölen efsanevi bir savaşçı olarak geri döner. Düşmüş Mount Hua tarikatını eski ihtişamına kavuşturmak için çalışır.', author: 'Biga', artist: 'LICO', year: 2021, age: '16+', genres: ['Aksiyon', 'Dövüş Sanatları', 'Komedi', 'Tarihi'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 16 },
  { title: 'The Breaker', slug: 'the-breaker', type: 'manhwa', alt: ['브레이커'], desc: 'Zorbalığa uğrayan lise öğrencisi Shi-woon, dövüş sanatları ustası Chun-woo ile tanışır. Murim dünyasının karanlık sırlarına adım atar.', author: 'Jeon Geuk-jin', artist: 'Park Jin-Hwan', year: 2007, age: '16+', genres: ['Aksiyon', 'Dövüş Sanatları', 'Dram', 'Okul'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 13 },
  { title: 'Weak Hero', slug: 'weak-hero', type: 'manhwa', alt: ['약한영웅', 'Zayıf Kahraman'], desc: 'Zayıf görünümlü Gray Yeon, aslında acımasız bir dövüşçüdür. Zekası ve stratejileriyle okuldaki zorbaları tek tek alt eder.', author: 'SEOPASS', artist: 'RAZEN', year: 2019, age: '16+', genres: ['Aksiyon', 'Okul', 'Dram', 'Gerilim'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 14 },

  // MANHUA (4)
  { title: 'The Great Ruler', slug: 'the-great-ruler', type: 'manhua', alt: ['大主宰', 'Büyük Hükümdar'], desc: 'Mu Chen, Kuzey Ruhani Akademiye girer ve güçlü ruh güçlerini ustalaşmaya çalışır. Annesi hakkındaki sırları çözmek için evrenin en güçlüsü olmayı hedefler.', author: 'Tian Can Tu Dou', artist: 'Unknown', year: 2017, age: '13+', genres: ['Aksiyon', 'Fantastik', 'Macera', 'Dövüş Sanatları'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 18 },
  { title: 'Apotheosis', slug: 'apotheosis', type: 'manhua', alt: ['百炼成神', 'Tanrılaşma'], desc: 'Luo Zheng, düşmüş bir ailenin köle olan oğludur. Babasının bıraktığı gizemli bir kitaptaki sırlar sayesinde dövüş sanatlarında zirveye tırmanır.', author: 'Ranzai Studio', artist: 'Ranzai Studio', year: 2015, age: '13+', genres: ['Aksiyon', 'Fantastik', 'Dövüş Sanatları', 'Macera'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 20 },
  { title: 'Versatile Mage', slug: 'versatile-mage', type: 'manhua', alt: ['全职法师', 'Çok Yönlü Büyücü'], desc: 'Mo Fan, büyünün bilim yerine geçtiği paralel bir dünyada uyanır. Çoklu element kontrolüyle tüm büyücüleri geride bırakmayı hedefler.', author: 'Luan', artist: 'Luan', year: 2017, age: '13+', genres: ['Aksiyon', 'Fantastik', 'Okul', 'Macera'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 19 },
  { title: 'Against the Gods', slug: 'against-the-gods', type: 'manhua', alt: ['逆天邪神', 'Tanrılara Karşı'], desc: 'Yun Che, Gözyaşı Tanrısının Mirası ile yeniden doğar. Geçmiş hayatının intikamını almak ve sevdiklerini korumak için güçlenir.', author: 'Mars Gravity', artist: 'Unknown', year: 2014, age: '16+', genres: ['Aksiyon', 'Fantastik', 'Dövüş Sanatları', 'Romantizm'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 20 },

  // NOVEL (3)
  { title: 'Sword Art Online', slug: 'sword-art-online', type: 'novel', alt: ['ソードアート・オンライン', 'SAO'], desc: 'Kirito, sanal gerçeklik oyunu SAO\'da hapsolur. Oyunda ölmek gerçek hayatta da ölmek demektir. 100 katı temizleyerek özgürlüklerini kazanmalıdır.', author: 'Reki Kawahara', artist: 'abec', year: 2009, age: '13+', genres: ['Aksiyon', 'Macera', 'Bilim Kurgu', 'Oyun'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 7 },
  { title: 'That Time I Got Reincarnated as a Slime', slug: 'tensei-slime', type: 'novel', alt: ['転生したらスライムだった件', 'Slime Olarak Yeniden Doğdum'], desc: 'Satoru Mikami, bıçaklanarak ölür ve bir slime olarak yeniden doğar. Rimuru Tempest adını alarak kendi ülkesini kurar ve canavarları birleştirir.', author: 'Fuse', artist: 'Mitz Vah', year: 2013, age: '13+', genres: ['Fantastik', 'Macera', 'Komedi', 'Reenkarnasyon'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 65 },
  { title: 'The Rising of the Shield Hero', slug: 'shield-hero', type: 'novel', alt: ['盾の勇者の成り上がり', 'Kalkan Kahramanın Yükselişi'], desc: 'Naofumi Iwatani, Kalkan Kahramanı olarak başka dünyaya çağrılır. İftiraya uğrayıp her şeyini kaybettikten sonra tek başına güçlenmeye çalışır.', author: 'Aneko Yusagi', artist: 'Seira Minami', year: 2012, age: '16+', genres: ['Aksiyon', 'Fantastik', 'Dram', 'Reenkarnasyon'], status: 'Devam Ediyor', tStatus: 'Aktif', featured: false, chapters: 55 },

  // WEBTOON (5)
  { title: 'Noblesse', slug: 'noblesse', type: 'webtoon', alt: ['노블레스'], desc: '820 yıl uykudan uyanan asil vampir Cadis Etrama Di Raizel, modern dünyada lise öğrencisi olmaya çalışır. Hizmetkarı Frankenstein ile birlikte gizli örgütlere karşı savaşır.', author: 'Son Je-Ho', artist: 'Lee Kwangsu', year: 2007, age: '16+', genres: ['Aksiyon', 'Komedi', 'Doğaüstü', 'Okul'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 14 },
  { title: 'God of High School', slug: 'god-of-high-school', type: 'webtoon', alt: ['갓 오브 하이스쿨', 'Lisenin Tanrısı'], desc: 'Jin Mo-Ri, Kore\'nin en güçlü lise öğrencisini belirleyecek turnuvaya katılır. Ancak turnuvanın arkasında tanrılar ve canavarlarla dolu bir sır gizlidir.', author: 'Yongje Park', artist: 'Yongje Park', year: 2011, age: '16+', genres: ['Aksiyon', 'Dövüş Sanatları', 'Doğaüstü', 'Komedi'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 17 },
  { title: 'Bastard', slug: 'bastard', type: 'webtoon', alt: ['배스터드', 'Piç'], desc: 'Jin Seon, seri katil babasının suçlarını örtbas etmek zorunda kalan bir lise öğrencisidir. Ancak bir kız hayatına girince her şey değişir.', author: 'Carnby Kim', artist: 'Youngchan Hwang', year: 2014, age: '18+', genres: ['Gerilim', 'Korku', 'Psikolojik', 'Dram'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 94 },
  { title: 'Windbreaker', slug: 'windbreaker-webtoon', type: 'webtoon', alt: ['윈드브레이커'], desc: 'Jay, bisiklet yarışı takımına katılarak yeni arkadaşlar edinir ve yarış dünyasının heyecanını keşfeder. Rüzgarı arkasına alarak zirveye koşar.', author: 'Jo Yongseok', artist: 'Jo Yongseok', year: 2013, age: '13+', genres: ['Spor', 'Komedi', 'Okul', 'Slice of Life'], status: 'Bırakıldı', tStatus: 'Bırakıldı', featured: false, chapters: 16 },
  { title: 'Hardcore Leveling Warrior', slug: 'hardcore-leveling-warrior', type: 'webtoon', alt: ['열렙전사', 'Sert Seviye Savaşçısı'], desc: 'Lucid Adventure oyununun 1 numaralı oyuncusu, hacklenerek tüm seviyelerini kaybeder. Sıfırdan başlayarak tekrar zirveye tırmanmaya çalışır.', author: 'Kim Sehoon', artist: 'Kim Sehoon', year: 2016, age: '16+', genres: ['Aksiyon', 'Fantastik', 'Oyun', 'Komedi'], status: 'Tamamlandı', tStatus: 'Tamamlandı', featured: false, chapters: 15 },
]

// ---------- HELPER FUNCTIONS (replicated from generate-data.mjs) ----------

const CHAPTER_TITLES: Record<string, string[]> = {
  action: ['Karanlık Başlangıç', 'Korkutucu Bir Gece', 'Yeni Düşman', 'Son Savaş', 'Kaçış Planı', 'İhanet', 'Güçlü Rakip', 'Gizli Güç', 'Uyanış', 'Antrenman Başlıyor', 'Ölüm Kalım Savaşı', 'Karanlık Orman', 'Geri Dönüş', 'Yüzleşme', 'Kayıp Hatıralar', 'Kan Bağı', 'İntikam Zamanı', 'Yeni İttifak', 'Beklenmedik Yardım', 'Final Dövüşü', 'Zincirleri Kır', 'Yenilmez', 'Geçmişin Gölgesi', 'Sonsuz Güç', 'Kaderine Meydan Oku', 'Alev ve Buz', 'Yeraltı Dünyası', 'Taht Oyunları', 'Kılıç Ustası', 'Ölümün Eşiğinde'],
  drama: ['Vedalar', 'Yalnızlık', 'Kırık Kalpler', 'Yağmurlu Gün', 'Mektup', 'Unutulan Söz', 'Son Bakış', 'Gözyaşları', 'Yeniden Başlamak', 'Güneşin Batışı', 'Sessiz Çığlık', 'Kayıp Zaman', 'Ayrılık Acısı', 'Umut Işığı', 'Kalpten Kalbe', 'Bitmemiş Hikaye', 'Gecenin Sonunda', 'Yürek Yarası', 'Dönüş Yolu', 'Son Şans'],
  fantasy: ['Büyü Uyanır', 'Ejderha\'nın Yuvası', 'Kristal Kule', 'Karanlık Büyü', 'Ruh Taşı', 'Elf Ormanı', 'Canavarlar Mağarası', 'Büyücü Savaşı', 'Gizli Portal', 'Efsane Kılıç', 'Lanetli Topraklar', 'Antik Güç', 'Rüzgar Büyüsü', 'Ateş Fırtınası', 'Işık ve Karanlık', 'Sihirli Yüzük', 'Cadı Ormanı', 'Buz Sarayı', 'Ölümsüzlük İksiri', 'Kadim Kehanet'],
  school: ['İlk Gün', 'Yeni Sınıf Arkadaşı', 'Sınav Haftası', 'Kulüp Etkinlikleri', 'Festival Hazırlığı', 'Okul Gezisi', 'Teneffüs Kavgası', 'Müdürün Odasında', 'Mezuniyet Töreni', 'Karne Günü'],
}

const ALL_TITLES = [
  ...CHAPTER_TITLES.action,
  ...CHAPTER_TITLES.drama,
  ...CHAPTER_TITLES.fantasy,
  ...CHAPTER_TITLES.school,
]

function getChapterTitle(index: number): string {
  return ALL_TITLES[index % ALL_TITLES.length]
}

function generateDate(baseYear: number, index: number, total: number): string {
  const today = new Date()
  const start = new Date(`${baseYear}-01-15`)
  const daySpread = Math.floor((365 * 2) / total)
  const d = new Date(start.getTime() + index * daySpread * 86400000)
  if (d > today)
    d.setTime(today.getTime() - (total - index) * 86400000 * 2)
  if (d > today) d.setTime(today.getTime())
  return d.toISOString().split('T')[0]
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// ---------- SVG GENERATION (replicated from generate-data.mjs) ----------

const COVER_COLORS = [
  ['#1a1a2e', '#16213e', '#e94560'],
  ['#0f0c29', '#302b63', '#f7d716'],
  ['#11998e', '#38ef7d', '#fff'],
  ['#2c003e', '#512b58', '#fe346e'],
  ['#1b262c', '#0f4c75', '#3282b8'],
  ['#0b0c10', '#1f2833', '#66fcf1'],
  ['#200f21', '#451952', '#f39189'],
  ['#1a1a40', '#270082', '#7a0bc0'],
  ['#0d1b2a', '#1b263b', '#e0e1dd'],
  ['#2d132c', '#801336', '#ee4540'],
  ['#1c0c1c', '#4a0e4e', '#c849d9'],
  ['#0a0a23', '#1a1a5e', '#4fc3f7'],
  ['#0d0d0d', '#1a1a1a', '#ff6b35'],
  ['#011627', '#023e8a', '#48cae4'],
  ['#1b0000', '#3d0000', '#e23e57'],
  ['#0b132b', '#1c2541', '#5bc0be'],
  ['#1a0000', '#4a1942', '#f56a79'],
  ['#0d1321', '#1d2d44', '#3e5c76'],
  ['#060930', '#141e61', '#787a91'],
  ['#120136', '#035aa6', '#40bad5'],
  ['#2b2024', '#694d3f', '#e8a87c'],
  ['#161616', '#333333', '#dc2f02'],
  ['#1a1423', '#372549', '#b75d69'],
  ['#0b0014', '#2e0249', '#f806cc'],
  ['#0c1618', '#004643', '#f9bc60'],
  ['#020202', '#1a1a2e', '#a12568'],
  ['#001219', '#005f73', '#94d2bd'],
  ['#03071e', '#370617', '#e85d04'],
]

function createCoverSVG(title: string, type: string, colors: string[], age: string | null): string {
  const [bg1, bg2, accent] = colors
  const initial = title.charAt(0)
  const typeColors: Record<string, string> = { manga: '#4a9ff5', manhwa: '#16c79a', manhua: '#ef4444', novel: '#a855f7', webtoon: '#f97316' }
  const tc = typeColors[type] || '#888'
  const ageBadge = age && (age.includes('18') || age.includes('16')) ? `<rect x="230" y="10" width="55" height="24" rx="4" fill="#dc2626" opacity="0.9"/><text x="258" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="white">${age}</text>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${bg1}"/><stop offset="100%" style="stop-color:${bg2}"/></linearGradient></defs>
  <rect width="300" height="400" fill="url(#bg)"/>
  <rect x="0" y="280" width="300" height="120" fill="rgba(0,0,0,0.6)"/>
  <text x="150" y="160" text-anchor="middle" font-family="Arial,sans-serif" font-size="72" font-weight="bold" fill="${accent}" opacity="0.3">${initial}</text>
  <text x="150" y="200" text-anchor="middle" font-family="Arial,sans-serif" font-size="64" font-weight="bold" fill="${accent}">${initial}</text>
  <text x="150" y="320" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="#eee">${title.length > 20 ? title.substring(0, 18) + '...' : title}</text>
  <text x="150" y="345" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="${tc}">${type.charAt(0).toUpperCase() + type.slice(1)}</text>
  ${ageBadge}
</svg>`
}

function createBannerSVG(title: string, _desc: string, colors: string[]): string {
  const [bg1, bg2, accent] = colors
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">
  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${bg1}"/><stop offset="50%" style="stop-color:${bg2}"/><stop offset="100%" style="stop-color:${bg1}"/></linearGradient></defs>
  <rect width="1200" height="400" fill="url(#bg)"/>
  <rect width="1200" height="400" fill="rgba(0,0,0,0.3)"/>
  <text x="600" y="170" text-anchor="middle" font-family="Arial,sans-serif" font-size="96" font-weight="bold" fill="${accent}" opacity="0.15">${title.charAt(0)}</text>
  <text x="600" y="220" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="bold" fill="white" opacity="0.1">${title}</text>
  <circle cx="200" cy="300" r="80" fill="${accent}" opacity="0.05"/>
  <circle cx="1000" cy="100" r="120" fill="${accent}" opacity="0.05"/>
</svg>`
}

const PANEL_TEXTS = [
  'Kahramanımız karanlık bir ortamda beliriyor...',
  'Güçlü bir çarpışma yaşanıyor!',
  '"Bu sefer kaçış yok!" diye haykırıyor.',
  'Şehrin silüeti gökyüzüne yansıyor.',
  'Gizemli bir güç ortaya çıkıyor!',
  'İki karakter karşı karşıya geliyor.',
  'Hızlı bir saldırı! Darbe efektleri...',
  'Geçmişten bir hatıra beliriyor...',
  'Karanlıkta bir gölge beliriyor.',
  '"Devam edecek..." gizemli bir kapanış.',
  'Düşüncelere dalan karakterimiz...',
  'Komik bir sahne yaşanıyor!',
  'Yeni bir teknik öğreniliyor.',
  'Stratejik plan yapılıyor.',
  'Büyük bir sır ortaya çıkıyor!',
]

function createPageSVG(
  s: (typeof SERIES_DATA)[0],
  chapterNum: number,
  pageNum: number,
  pageCount: number,
  seriesIndex: number,
  chTitle: string
): string {
  const chColors = COVER_COLORS[(seriesIndex + chapterNum) % COVER_COLORS.length]
  const [bg1, bg2, accent] = chColors
  const panelText = PANEL_TEXTS[(chapterNum + pageNum) % PANEL_TEXTS.length]
  const isFirst = pageNum === 1
  const isLast = pageNum === pageCount
  const layoutSeed = (chapterNum * 31 + pageNum * 7) % 5

  let panelsContent = ''

  if (isFirst) {
    panelsContent = `
      <rect x="20" y="20" width="680" height="260" rx="8" fill="${bg2}" stroke="${accent}" stroke-width="2" opacity="0.8"/>
      <text x="360" y="100" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="${accent}">${s.title}</text>
      <text x="360" y="145" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#ccc">Bölüm ${chapterNum}</text>
      <text x="360" y="180" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#888">${chTitle}</text>
      <line x1="200" y1="210" x2="520" y2="210" stroke="${accent}" stroke-width="1" opacity="0.5"/>
      <text x="360" y="250" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#666">MangaHub Türkçe Çeviri</text>
      <rect x="20" y="310" width="330" height="340" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="185" y="490" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#aaa">${panelText}</text>
      <rect x="370" y="310" width="330" height="340" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="535" y="490" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#aaa">Hikaye başlıyor...</text>`
  } else if (isLast) {
    panelsContent = `
      <rect x="20" y="20" width="680" height="480" rx="8" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="360" y="230" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#aaa">${panelText}</text>
      <rect x="20" y="520" width="680" height="180" rx="8" fill="rgba(0,0,0,0.5)" stroke="${accent}" stroke-width="1"/>
      <text x="360" y="600" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="${accent}">Devam Edecek...</text>
      <text x="360" y="650" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#666">Bir sonraki bölümde neler olacak?</text>`
  } else if (layoutSeed === 0) {
    panelsContent = `
      <rect x="20" y="20" width="340" height="680" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="190" y="360" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#aaa">${panelText}</text>
      <rect x="370" y="20" width="330" height="680" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="535" y="360" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#aaa">${PANEL_TEXTS[(chapterNum + pageNum + 3) % PANEL_TEXTS.length]}</text>`
  } else if (layoutSeed === 1) {
    panelsContent = `
      <rect x="20" y="20" width="680" height="215" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="360" y="130" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#aaa">${panelText}</text>
      <rect x="20" y="250" width="680" height="215" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="360" y="360" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#aaa">${PANEL_TEXTS[(chapterNum + pageNum + 1) % PANEL_TEXTS.length]}</text>
      <rect x="20" y="480" width="680" height="220" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="360" y="595" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#aaa">${PANEL_TEXTS[(chapterNum + pageNum + 5) % PANEL_TEXTS.length]}</text>`
  } else if (layoutSeed === 2) {
    panelsContent = `
      <rect x="20" y="20" width="680" height="400" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="360" y="220" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#aaa">${panelText}</text>
      <rect x="20" y="440" width="335" height="260" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="187" y="570" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#aaa">${PANEL_TEXTS[(chapterNum + pageNum + 2) % PANEL_TEXTS.length]}</text>
      <rect x="370" y="440" width="330" height="260" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="535" y="570" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#aaa">${PANEL_TEXTS[(chapterNum + pageNum + 4) % PANEL_TEXTS.length]}</text>`
  } else if (layoutSeed === 3) {
    panelsContent = `
      <rect x="20" y="20" width="680" height="680" rx="8" fill="${bg2}" stroke="${accent}" stroke-width="1"/>
      <circle cx="360" cy="320" r="120" fill="${accent}" opacity="0.08"/>
      <circle cx="360" cy="320" r="60" fill="${accent}" opacity="0.12"/>
      <text x="360" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#ddd">${panelText}</text>
      <text x="360" y="340" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#666">[Tam sayfa sahne]</text>`
  } else {
    panelsContent = `
      <rect x="20" y="20" width="340" height="335" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="190" y="190" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#aaa">${panelText}</text>
      <rect x="370" y="20" width="330" height="335" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="535" y="190" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#aaa">${PANEL_TEXTS[(chapterNum + pageNum + 1) % PANEL_TEXTS.length]}</text>
      <rect x="20" y="370" width="340" height="330" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="190" y="540" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#aaa">${PANEL_TEXTS[(chapterNum + pageNum + 2) % PANEL_TEXTS.length]}</text>
      <rect x="370" y="370" width="330" height="330" rx="6" fill="${bg2}" stroke="#333" stroke-width="1"/>
      <text x="535" y="540" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#aaa">${PANEL_TEXTS[(chapterNum + pageNum + 3) % PANEL_TEXTS.length]}</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1024" viewBox="0 0 720 1024">
  <defs><linearGradient id="pbg${pageNum}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:${bg1}"/><stop offset="100%" style="stop-color:${bg2}"/></linearGradient></defs>
  <rect width="720" height="1024" fill="url(#pbg${pageNum})"/>
  ${panelsContent}
  <rect x="0" y="980" width="720" height="44" fill="rgba(0,0,0,0.7)"/>
  <text x="20" y="1008" font-family="Arial,sans-serif" font-size="11" fill="#555">${s.title} - Bölüm ${chapterNum}</text>
  <text x="700" y="1008" text-anchor="end" font-family="Arial,sans-serif" font-size="11" fill="#555">${pageNum}/${pageCount}</text>
</svg>`
}

// ---------- SEEDER ----------

export default class SeriesSeeder extends BaseSeeder {
  async run() {
    const basePath = join(app.publicPath(), 'content')

    // 1. Seed content types
    const contentTypeMap = new Map<string, ContentType>()
    for (const name of ['manga', 'manhwa', 'manhua', 'novel', 'webtoon']) {
      const ct = await ContentType.firstOrCreate(
        { name },
        { name, slug: name }
      )
      contentTypeMap.set(name, ct)
    }

    // 2. Collect and seed all unique genres
    const genreMap = new Map<string, Genre>()
    const allGenres = new Set<string>()
    for (const s of SERIES_DATA) {
      for (const g of s.genres) allGenres.add(g)
    }
    for (const name of allGenres) {
      const genre = await Genre.firstOrCreate(
        { name },
        { name, slug: slugify(name) || name.toLowerCase() }
      )
      genreMap.set(name, genre)
    }

    // 3. Collect and seed all unique authors
    const authorMap = new Map<string, Author>()
    for (const s of SERIES_DATA) {
      if (!authorMap.has(s.author)) {
        const author = await Author.firstOrCreate(
          { name: s.author },
          { name: s.author, slug: slugify(s.author) || s.author.toLowerCase() }
        )
        authorMap.set(s.author, author)
      }
    }

    // 4. Collect and seed all unique artists
    const artistMap = new Map<string, Artist>()
    for (const s of SERIES_DATA) {
      if (!artistMap.has(s.artist)) {
        const artist = await Artist.firstOrCreate(
          { name: s.artist },
          { name: s.artist, slug: slugify(s.artist) || s.artist.toLowerCase() }
        )
        artistMap.set(s.artist, artist)
      }
    }

    // 5. Seed each series with chapters and SVGs
    // Clean old content first
    const { rmSync } = await import('node:fs')
    try { rmSync(basePath, { recursive: true, force: true }) } catch {}

    let seriesIndex = 0
    for (const s of SERIES_DATA) {
      // Keep-alive ping to prevent MySQL timeout
      await db.rawQuery('SELECT 1')

      const contentType = contentTypeMap.get(s.type)!
      const colors = COVER_COLORS[seriesIndex % COVER_COLORS.length]

      // Create series record
      const seriesRecord = await SeriesModel.firstOrCreate(
        { slug: s.slug },
        {
          title: s.title,
          slug: s.slug,
          description: s.desc,
          alternativeTitles: s.alt,
          contentTypeId: contentType.id,
          status: s.status,
          translationStatus: s.tStatus,
          publicationYear: s.year,
          ageRating: s.age || null,
          coverImage: `/content/${s.type}/${s.slug}/cover.svg`,
          bannerImage: s.featured ? `/content/${s.type}/${s.slug}/banner.svg` : null,
          keywords: [
            `${s.slug.replace(/-/g, ' ')} turkce oku`,
            `${s.slug.replace(/-/g, ' ')} ${s.type}`,
            `${s.title.toLowerCase()} oku`,
          ],
          featured: s.featured,
          featuredDescription: s.featuredDesc || null,
        }
      )

      // Force set timestamps to match original data (capped to today)
      const today = new Date().toISOString().split('T')[0]
      const rawCreatedAt = `${s.year + 10}-01-01`
      seriesRecord.createdAt = (rawCreatedAt > today ? today : rawCreatedAt) as any
      const rawUpdatedAt = generateDate(2025, s.chapters - 1, s.chapters)
      seriesRecord.updatedAt = (rawUpdatedAt > today ? today : rawUpdatedAt) as any
      await seriesRecord.save()

      // Attach genres
      const genreIds = s.genres.map((g) => genreMap.get(g)!.id)
      if (genreIds.length > 0) {
        await db.table('series_genres').multiInsert(
          genreIds.map((gid) => ({ series_id: seriesRecord.id, genre_id: gid }))
        )
      }

      // Attach author
      const author = authorMap.get(s.author)!
      await db.table('series_authors').insert({ series_id: seriesRecord.id, author_id: author.id })

      // Attach artist
      const artist = artistMap.get(s.artist)!
      await db.table('series_artists').insert({ series_id: seriesRecord.id, artist_id: artist.id })

      // Create directory structure for SVGs
      const dir = join(basePath, s.type, s.slug)
      mkdirSync(dir, { recursive: true })

      // Write cover SVG
      writeFileSync(join(dir, 'cover.svg'), createCoverSVG(s.title, s.type, colors, s.age || null))

      // Write banner SVG for featured
      if (s.featured) {
        writeFileSync(join(dir, 'banner.svg'), createBannerSVG(s.title, s.featuredDesc || s.desc, colors))
      }

      // Create chapters in batches
      const chapterRows: any[] = []
      for (let i = 1; i <= s.chapters; i++) {
        const chTitle = getChapterTitle(i - 1)
        const publishedAt = generateDate(2025, i - 1, s.chapters)

        let content: any

        if (s.type === 'novel') {
          const novelText = `${s.title} - Bölüm ${i}: ${chTitle}\n\n${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(3)}Bu bölümde kahramanımız yeni bir maceraya atılır. ${s.desc}\n\n${'Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae. '.repeat(2)}Hikayenin devamında beklenmedik gelişmeler yaşanır.\n\n${'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(3)}Karakterlerin kaderi bu bölümle birlikte tamamen değişir.\n\nDevamı bir sonraki bölümde...`
          content = { type: 'text', text: novelText }
        } else {
          const chDir = join(dir, 'chapters', String(i))
          mkdirSync(chDir, { recursive: true })

          const pageCount = Math.floor(Math.random() * 8) + 8
          const pages: string[] = []

          for (let p = 1; p <= pageCount; p++) {
            const pageNumStr = String(p).padStart(2, '0')
            const pageSvg = createPageSVG(s, i, p, pageCount, seriesIndex, chTitle)
            writeFileSync(join(chDir, `page-${pageNumStr}.svg`), pageSvg)
            pages.push(`/content/${s.type}/${s.slug}/chapters/${i}/page-${pageNumStr}.svg`)
          }

          content = { type: 'images', pages }
        }

        chapterRows.push({
          series_id: seriesRecord.id,
          number: i,
          title: chTitle,
          content: JSON.stringify(content),
          published_at: publishedAt,
          created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
          updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        })

        // Keep-alive every 10 chapters during SVG generation
        if (i % 10 === 0) {
          await db.rawQuery('SELECT 1')
        }
      }

      // Keep-alive before chapter inserts
      await db.rawQuery('SELECT 1')

      // Insert chapters in batches of 50
      for (let b = 0; b < chapterRows.length; b += 50) {
        const batch = chapterRows.slice(b, b + 50)
        await db.table('chapters').multiInsert(batch)
      }

      seriesIndex++
      console.log(`✓ ${s.title} seeded (${s.chapters} bölüm)`)
    }

    console.log(`\n✓ Toplam ${SERIES_DATA.length} seri seed edildi`)
    console.log(`✓ Toplam bölüm: ${SERIES_DATA.reduce((a, s) => a + s.chapters, 0)}`)
    console.log(`✓ Featured: ${SERIES_DATA.filter((s) => s.featured).length}`)
    console.log(`✓ Novel: ${SERIES_DATA.filter((s) => s.type === 'novel').length}`)
  }
}
