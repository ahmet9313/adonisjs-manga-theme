/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const HomeController = () => import('#controllers/home_controller')
const SeriesController = () => import('#controllers/series_controller')
const AgeController = () => import('#controllers/age_controller')
const ChapterController = () => import('#controllers/chapter_controller')
const MediaController = () => import('#controllers/media_controller')

// Public routes
router.get('/content/*', [MediaController, 'show']).as('content.show')
router.get('/', [HomeController, 'index']).as('home')
router.get('/seriler', [SeriesController, 'index']).as('series.index')
router.get('/ara', [SeriesController, 'search']).as('series.search')
const BrowseController = () => import('#controllers/browse_controller')
router.get('/seriler/a-z', [BrowseController, 'az']).as('series.az')
router.get('/rastgele', [BrowseController, 'random']).as('series.random')
router.get('/series/:type/:slug', [SeriesController, 'show']).as('series.show')
router.post('/yas-onayi', [AgeController, 'confirm']).as('age.confirm')
// Search engines and feeds (config/seo.ts); the series feed comes before the chapter route.
const SeoController = () => import('#controllers/seo_controller')
router.get('/robots.txt', [SeoController, 'robots']).as('seo.robots')
router.get('/sitemap.xml', [SeoController, 'sitemap']).as('seo.sitemap')
router.get('/sitemaps/:file', [SeoController, 'sitemapPart']).as('seo.sitemap_part')
router.get('/rss.xml', [SeoController, 'feed']).as('seo.feed')
router.get('/series/:type/:slug/rss.xml', [SeoController, 'seriesFeed']).as('seo.series_feed')
router.get('/series/:type/:slug/:chapter', [ChapterController, 'show']).as('chapter.show')
const LibraryController = () => import('#controllers/library_controller')
router.get('/kaydedilenler', [LibraryController, 'index']).as('bookmarks')
router.get('/kutuphane/kapaklar', [LibraryController, 'saved']).as('library.saved')
router
  .group(() => {
    router.post('/kaydet', [LibraryController, 'toggle']).as('library.toggle')
    router.post('/kaldir', [LibraryController, 'remove']).as('library.remove')
    router.post('/aktar', [LibraryController, 'import']).as('library.import')
  })
  .prefix('/kutuphane')
  .use(middleware.auth())

// Reader settings and reading position for accounts (guests keep them in the browser)
const ReaderController = () => import('#controllers/reader_controller')
router
  .group(() => {
    router.post('/tercihler', [ReaderController, 'prefs']).as('reader.prefs')
    router.post('/konum', [ReaderController, 'position']).as('reader.position')
  })
  .prefix('/okuyucu')
  .use(middleware.auth())

// Comments: reading is public, writing requires an account
const CommentController = () => import('#controllers/comment_controller')
router.get('/yorumlar', [CommentController, 'index']).as('comments.index')
router.get('/yorumlar/:id/yanitlar', [CommentController, 'replies']).as('comments.replies')
router
  .group(() => {
    router.post('/', [CommentController, 'store']).as('comments.store')
    router.post('/:id/oy', [CommentController, 'vote']).as('comments.vote')
    router.post('/:id/sil', [CommentController, 'destroy']).as('comments.destroy')
    router.post('/:id/duzenle', [CommentController, 'update']).as('comments.update')
  })
  .prefix('/yorumlar')
  .use(middleware.auth())

// Chapter reactions ("Bölüm nasıldı?") and the @mention picker (members)
const ReactionController = () => import('#controllers/reaction_controller')
const MemberController = () => import('#controllers/member_controller')
router
  .group(() => {
    router.post('/bolumler/:id/tepki', [ReactionController, 'store']).as('reactions.store')
    router.get('/uyeler/ara', [MemberController, 'search']).as('members.search')
  })
  .use(middleware.auth())

// Ratings and reviews: reading is public, rating requires an account
const ReviewController = () => import('#controllers/review_controller')
router.get('/incelemeler', [ReviewController, 'index']).as('reviews.index')
router
  .group(() => {
    router.post('/', [ReviewController, 'store']).as('reviews.store')
    router.post('/:id/faydali', [ReviewController, 'vote']).as('reviews.vote')
    router.post('/:id/sil', [ReviewController, 'destroy']).as('reviews.destroy')
  })
  .prefix('/incelemeler')
  .use(middleware.auth())

// Translation teams (config/teams.ts)
const TeamController = () => import('#controllers/team_controller')
router.get('/ekipler', [TeamController, 'index']).as('teams.index')
router.get('/ekip/:slug', [TeamController, 'show']).as('teams.show')
router.get('/ekibe-katil', [TeamController, 'recruit']).as('teams.recruit')
// Reports: chapter errors (guests too, throttled per address) and comment / review complaints
const ReportController = () => import('#controllers/report_controller')
router.post('/bildir', [ReportController, 'store']).as('reports.store')

// Accounts: sign in, registration and member profiles
const AuthController = () => import('#controllers/auth_controller')
const AccountController = () => import('#controllers/account_controller')
router.get('/giris', [AuthController, 'showLogin']).as('auth.login')
router.post('/giris', [AuthController, 'login']).as('auth.login.post')
router.get('/kayit', [AuthController, 'showRegister']).as('auth.register')
router.post('/kayit', [AuthController, 'register']).as('auth.register.post')
router.post('/cikis', [AuthController, 'logout']).as('auth.logout')
router.get('/uye/:username', [AccountController, 'show']).as('profile.show')
router
  .post('/uye/:username/begen', [AccountController, 'like'])
  .as('profile.like')
  .use(middleware.auth())

// Community: discovery, inbox, rewards, cards and cosmetics (earned, never bought)
const DiscoverController = () => import('#controllers/discover_controller')
const NotificationController = () => import('#controllers/notification_controller')
const RewardController = () => import('#controllers/reward_controller')
const CardController = () => import('#controllers/card_controller')
const CosmeticController = () => import('#controllers/cosmetic_controller')
router.get('/oneriler', [DiscoverController, 'recommendations']).as('discover.recommendations')
router.get('/kozmetik/:kind', [CosmeticController, 'index']).as('cosmetics.index')
router
  .group(() => {
    router.get('/gecmis', [DiscoverController, 'history']).as('discover.history')
    router.get('/oduller', [RewardController, 'index']).as('rewards.index')
    router.post('/gunluk-giris', [RewardController, 'checkin']).as('rewards.checkin')
    router.get('/rozetler', [RewardController, 'badges']).as('rewards.badges')
    router.get('/kartlar', [CardController, 'index']).as('cards.index')
    router.post('/kartlar/uret', [CardController, 'craft']).as('cards.craft')
    router.post('/kartlar/:id/parcala', [CardController, 'disassemble']).as('cards.disassemble')
    router.get('/envanter', [CosmeticController, 'inventory']).as('cosmetics.inventory')
    router.post('/kozmetik/:id/kusan', [CosmeticController, 'equip']).as('cosmetics.equip')
    router.post('/kozmetik/cikar/:kind', [CosmeticController, 'unequip']).as('cosmetics.unequip')
    router.get('/bildirimler', [NotificationController, 'index']).as('notifications.index')
    router
      .post('/bildirimler/tumu-okundu', [NotificationController, 'readAll'])
      .as('notifications.readAll')
    router
      .post('/bildirimler/tumunu-sil', [NotificationController, 'destroyAll'])
      .as('notifications.destroyAll')
    router
      .post('/bildirimler/:id/okundu', [NotificationController, 'read'])
      .as('notifications.read')
    router
      .post('/bildirimler/:id/sil', [NotificationController, 'destroy'])
      .as('notifications.destroy')
  })
  .use(middleware.auth())

router
  .group(() => {
    router.get('/', [AccountController, 'settings']).as('account.settings')
    router.post('/profil', [AccountController, 'updateProfile']).as('account.profile')
    router.post('/hesap', [AccountController, 'updateAccount']).as('account.email')
    router.post('/parola', [AccountController, 'updatePassword']).as('account.password')
    router.post('/avatar', [AccountController, 'uploadAvatar']).as('account.avatar')
    router.post('/avatar/sil', [AccountController, 'removeAvatar']).as('account.avatar.remove')
    router.post('/banner', [AccountController, 'uploadBanner']).as('account.banner')
    router.post('/banner/sil', [AccountController, 'removeBanner']).as('account.banner.remove')
  })
  .prefix('/ayarlar')
  .use(middleware.auth())

// Legacy administration sign-in URLs
router.get('/admin/giris', ({ response }) => response.redirect('/giris?next=/admin'))
router.post('/admin/cikis', [AuthController, 'logout']).as('admin.logout')

// Admin protected routes
const AdminDashboardController = () => import('#controllers/admin/dashboard_controller')
const AdminUserController = () => import('#controllers/admin/user_controller')
const AdminSeriesController = () => import('#controllers/admin/series_controller')
const AdminChapterController = () => import('#controllers/admin/chapter_controller')
const AdminCoverController = () => import('#controllers/admin/cover_controller')
const AdminGenreController = () => import('#controllers/admin/genre_controller')
const AdminAuthorController = () => import('#controllers/admin/author_controller')
const AdminArtistController = () => import('#controllers/admin/artist_controller')
const AdminContentTypeController = () => import('#controllers/admin/content_type_controller')
const AdminCosmeticController = () => import('#controllers/admin/cosmetic_controller')
const AdminCardController = () => import('#controllers/admin/card_controller')
const AdminRoleController = () => import('#controllers/admin/role_controller')
const AdminThemeController = () => import('#controllers/admin/theme_controller')
const AdminTeamController = () => import('#controllers/admin/team_controller')
const AdminModerationController = () => import('#controllers/admin/moderation_controller')

router
  .group(() => {
    // Dashboard
    router.get('/', [AdminDashboardController, 'index']).as('admin.dashboard')

    // Profile settings live under /ayarlar for every account
    router.get('/profil', ({ response }) => response.redirect('/ayarlar'))

    // Users and roles (administrators only)
    router
      .get('/kullanicilar', [AdminUserController, 'index'])
      .as('admin.users.index')
      .use(middleware.role(['admin']))
    router
      .get('/kullanicilar/:id/duzenle', [AdminUserController, 'edit'])
      .as('admin.users.edit')
      .use(middleware.role(['admin']))
    router
      .post('/kullanicilar/:id/duzenle', [AdminUserController, 'update'])
      .as('admin.users.update')
      .use(middleware.role(['admin']))

    // Discord-style roles and theme settings (administrators only)
    router
      .group(() => {
        router.get('/roller', [AdminRoleController, 'index']).as('admin.roles.index')
        router.post('/roller/:role', [AdminRoleController, 'update']).as('admin.roles.update')
        router.get('/tema', ({ response }) => response.redirect('/admin/tema/genel'))
        router.get('/tema/disa-aktar', [AdminThemeController, 'export']).as('admin.theme.export')
        router.post('/tema/ice-aktar', [AdminThemeController, 'import']).as('admin.theme.import')
        router.post('/tema/sifirla', [AdminThemeController, 'reset']).as('admin.theme.reset')
        router.post('/tema/gorsel', [AdminThemeController, 'uploadImage']).as('admin.theme.image')
        router.get('/tema/:section', [AdminThemeController, 'show']).as('admin.theme.show')
        router.post('/tema/:section', [AdminThemeController, 'update']).as('admin.theme.update')
      })
      .use(middleware.role(['admin']))

    // Earned cosmetics and collectible cards (administrators only)
    router
      .group(() => {
        router.get('/kozmetikler', [AdminCosmeticController, 'index']).as('admin.cosmetics.index')
        router
          .get('/kozmetikler/ekle', [AdminCosmeticController, 'create'])
          .as('admin.cosmetics.create')
        router
          .post('/kozmetikler/ekle', [AdminCosmeticController, 'store'])
          .as('admin.cosmetics.store')
        router
          .get('/kozmetikler/:id/duzenle', [AdminCosmeticController, 'edit'])
          .as('admin.cosmetics.edit')
        router
          .post('/kozmetikler/:id/duzenle', [AdminCosmeticController, 'update'])
          .as('admin.cosmetics.update')
        router
          .post('/kozmetikler/:id/sil', [AdminCosmeticController, 'destroy'])
          .as('admin.cosmetics.destroy')
        router
          .post('/kozmetikler/:id/hediye', [AdminCosmeticController, 'grant'])
          .as('admin.cosmetics.grant')
        router.get('/kartlar', [AdminCardController, 'index']).as('admin.cards.index')
        router.get('/kartlar/ekle', [AdminCardController, 'create']).as('admin.cards.create')
        router.post('/kartlar/ekle', [AdminCardController, 'store']).as('admin.cards.store')
        router
          .post('/kartlar/seri-kapaklari', [AdminCardController, 'generate'])
          .as('admin.cards.generate')
        router.get('/kartlar/:id/duzenle', [AdminCardController, 'edit']).as('admin.cards.edit')
        router
          .post('/kartlar/:id/duzenle', [AdminCardController, 'update'])
          .as('admin.cards.update')
        router.post('/kartlar/:id/sil', [AdminCardController, 'destroy']).as('admin.cards.destroy')
      })
      .use(middleware.role(['admin']))

    // Translation teams (administrators only; editors pick teams on the series/chapter forms)
    router
      .group(() => {
        router.get('/ekipler', [AdminTeamController, 'index']).as('admin.teams.index')
        router.get('/ekipler/ekle', [AdminTeamController, 'create']).as('admin.teams.create')
        router.post('/ekipler/ekle', [AdminTeamController, 'store']).as('admin.teams.store')
        router.get('/ekipler/:id/duzenle', [AdminTeamController, 'edit']).as('admin.teams.edit')
        router
          .post('/ekipler/:id/duzenle', [AdminTeamController, 'update'])
          .as('admin.teams.update')
        router.post('/ekipler/:id/sil', [AdminTeamController, 'destroy']).as('admin.teams.destroy')
      })
      .use(middleware.role(['admin']))

    // Moderation queue, mutes and blocked words (administrators and editors)
    router.get('/moderasyon', [AdminModerationController, 'index']).as('admin.moderation.index')
    router
      .post('/moderasyon/kelimeler', [AdminModerationController, 'words'])
      .as('admin.moderation.words')
    router
      .post('/moderasyon/uye/:id/sustur', [AdminModerationController, 'mute'])
      .as('admin.moderation.mute')
    router
      .post('/moderasyon/uye/:id/susturma-kaldir', [AdminModerationController, 'unmute'])
      .as('admin.moderation.unmute')
    router
      .post('/moderasyon/:type/:id/coz', [AdminModerationController, 'resolve'])
      .as('admin.moderation.resolve')
    router
      .post('/moderasyon/:type/:id/reddet', [AdminModerationController, 'dismiss'])
      .as('admin.moderation.dismiss')
    router
      .post('/moderasyon/:type/:id/sil', [AdminModerationController, 'destroy'])
      .as('admin.moderation.destroy')

    // Series CRUD
    router.get('/seriler', [AdminSeriesController, 'index']).as('admin.series.index')
    router.get('/seriler/ekle', [AdminSeriesController, 'create']).as('admin.series.create')
    router.post('/seriler/ekle', [AdminSeriesController, 'store']).as('admin.series.store')
    router.get('/seriler/:id/duzenle', [AdminSeriesController, 'edit']).as('admin.series.edit')
    router.post('/seriler/:id/duzenle', [AdminSeriesController, 'update']).as('admin.series.update')
    router.post('/seriler/:id/sil', [AdminSeriesController, 'destroy']).as('admin.series.destroy')
    // "Otomatik doldur" in the series form (config/covers.ts)
    router.get('/seriler/kapak-ara', [AdminCoverController, 'search']).as('admin.covers.search')
    router.get('/seriler/kapak-gorsel', [AdminCoverController, 'image']).as('admin.covers.image')
    router.get('/seriler/kapak-bilgi', [AdminCoverController, 'details']).as('admin.covers.details')
    router.post('/seriler/kapak-kayit', [AdminCoverController, 'record']).as('admin.covers.record')

    // Chapters CRUD
    router.get('/bolumler', [AdminChapterController, 'index']).as('admin.chapters.index')
    router.get('/bolumler/ekle', [AdminChapterController, 'create']).as('admin.chapters.create')
    router.post('/bolumler/ekle', [AdminChapterController, 'store']).as('admin.chapters.store')
    // Episode video upload (streamed; see config/bodyparser.ts `processManually`)
    router
      .post('/bolumler/video', [AdminChapterController, 'uploadVideo'])
      .as('admin.chapters.upload_video')
    router.get('/bolumler/:id/duzenle', [AdminChapterController, 'edit']).as('admin.chapters.edit')
    router
      .post('/bolumler/:id/duzenle', [AdminChapterController, 'update'])
      .as('admin.chapters.update')
    router
      .post('/bolumler/:id/sil', [AdminChapterController, 'destroy'])
      .as('admin.chapters.destroy')

    // Genres CRUD
    router.get('/turler', [AdminGenreController, 'index']).as('admin.genres.index')
    router.get('/turler/ekle', [AdminGenreController, 'create']).as('admin.genres.create')
    router.post('/turler/ekle', [AdminGenreController, 'store']).as('admin.genres.store')
    router.get('/turler/:id/duzenle', [AdminGenreController, 'edit']).as('admin.genres.edit')
    router.post('/turler/:id/duzenle', [AdminGenreController, 'update']).as('admin.genres.update')
    router.post('/turler/:id/sil', [AdminGenreController, 'destroy']).as('admin.genres.destroy')

    // Authors CRUD
    router.get('/yazarlar', [AdminAuthorController, 'index']).as('admin.authors.index')
    router.get('/yazarlar/ekle', [AdminAuthorController, 'create']).as('admin.authors.create')
    router.post('/yazarlar/ekle', [AdminAuthorController, 'store']).as('admin.authors.store')
    router.get('/yazarlar/:id/duzenle', [AdminAuthorController, 'edit']).as('admin.authors.edit')
    router
      .post('/yazarlar/:id/duzenle', [AdminAuthorController, 'update'])
      .as('admin.authors.update')
    router.post('/yazarlar/:id/sil', [AdminAuthorController, 'destroy']).as('admin.authors.destroy')

    // Artists CRUD
    router.get('/cizerler', [AdminArtistController, 'index']).as('admin.artists.index')
    router.get('/cizerler/ekle', [AdminArtistController, 'create']).as('admin.artists.create')
    router.post('/cizerler/ekle', [AdminArtistController, 'store']).as('admin.artists.store')
    router.get('/cizerler/:id/duzenle', [AdminArtistController, 'edit']).as('admin.artists.edit')
    router
      .post('/cizerler/:id/duzenle', [AdminArtistController, 'update'])
      .as('admin.artists.update')
    router.post('/cizerler/:id/sil', [AdminArtistController, 'destroy']).as('admin.artists.destroy')

    // Content Types CRUD
    router
      .get('/icerik-turleri', [AdminContentTypeController, 'index'])
      .as('admin.content_types.index')
    router
      .get('/icerik-turleri/ekle', [AdminContentTypeController, 'create'])
      .as('admin.content_types.create')
    router
      .post('/icerik-turleri/ekle', [AdminContentTypeController, 'store'])
      .as('admin.content_types.store')
    router
      .get('/icerik-turleri/:id/duzenle', [AdminContentTypeController, 'edit'])
      .as('admin.content_types.edit')
    router
      .post('/icerik-turleri/:id/duzenle', [AdminContentTypeController, 'update'])
      .as('admin.content_types.update')
    router
      .post('/icerik-turleri/:id/sil', [AdminContentTypeController, 'destroy'])
      .as('admin.content_types.destroy')
  })
  .prefix('/admin')
  .use([middleware.auth(), middleware.role(['admin', 'editor'])])
