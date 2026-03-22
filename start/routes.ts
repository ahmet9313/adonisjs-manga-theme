/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const HomeController = () => import('#controllers/home_controller')
const SeriesController = () => import('#controllers/series_controller')
const ChapterController = () => import('#controllers/chapter_controller')

// Public routes
router.get('/', [HomeController, 'index']).as('home')
router.get('/seriler', [SeriesController, 'index']).as('series.index')
router.get('/ara', [SeriesController, 'search']).as('series.search')
router.get('/series/:type/:slug', [SeriesController, 'show']).as('series.show')
router.get('/series/:type/:slug/:chapter', [ChapterController, 'show']).as('chapter.show')
router.on('/kaydedilenler').render('pages/bookmarks').as('bookmarks')

// Admin auth routes (no auth middleware)
const AdminAuthController = () => import('#controllers/admin/auth_controller')
router.get('/admin/giris', [AdminAuthController, 'showLogin']).as('admin.login')
router.post('/admin/giris', [AdminAuthController, 'login']).as('admin.login.post')
router.post('/admin/cikis', [AdminAuthController, 'logout']).as('admin.logout')

// Admin protected routes
const AdminDashboardController = () => import('#controllers/admin/dashboard_controller')
const AdminProfileController = () => import('#controllers/admin/profile_controller')
const AdminSeriesController = () => import('#controllers/admin/series_controller')
const AdminChapterController = () => import('#controllers/admin/chapter_controller')
const AdminGenreController = () => import('#controllers/admin/genre_controller')
const AdminAuthorController = () => import('#controllers/admin/author_controller')
const AdminArtistController = () => import('#controllers/admin/artist_controller')
const AdminContentTypeController = () => import('#controllers/admin/content_type_controller')

router
  .group(() => {
    // Dashboard
    router.get('/', [AdminDashboardController, 'index']).as('admin.dashboard')

    // Profile
    router.get('/profil', [AdminProfileController, 'show']).as('admin.profile')
    router.post('/profil', [AdminProfileController, 'update']).as('admin.profile.update')

    // Series CRUD
    router.get('/seriler', [AdminSeriesController, 'index']).as('admin.series.index')
    router.get('/seriler/ekle', [AdminSeriesController, 'create']).as('admin.series.create')
    router.post('/seriler/ekle', [AdminSeriesController, 'store']).as('admin.series.store')
    router.get('/seriler/:id/duzenle', [AdminSeriesController, 'edit']).as('admin.series.edit')
    router.post('/seriler/:id/duzenle', [AdminSeriesController, 'update']).as('admin.series.update')
    router.post('/seriler/:id/sil', [AdminSeriesController, 'destroy']).as('admin.series.destroy')

    // Chapters CRUD
    router.get('/bolumler', [AdminChapterController, 'index']).as('admin.chapters.index')
    router.get('/bolumler/ekle', [AdminChapterController, 'create']).as('admin.chapters.create')
    router.post('/bolumler/ekle', [AdminChapterController, 'store']).as('admin.chapters.store')
    router.get('/bolumler/:id/duzenle', [AdminChapterController, 'edit']).as('admin.chapters.edit')
    router.post('/bolumler/:id/duzenle', [AdminChapterController, 'update']).as('admin.chapters.update')
    router.post('/bolumler/:id/sil', [AdminChapterController, 'destroy']).as('admin.chapters.destroy')

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
    router.post('/yazarlar/:id/duzenle', [AdminAuthorController, 'update']).as('admin.authors.update')
    router.post('/yazarlar/:id/sil', [AdminAuthorController, 'destroy']).as('admin.authors.destroy')

    // Artists CRUD
    router.get('/cizerler', [AdminArtistController, 'index']).as('admin.artists.index')
    router.get('/cizerler/ekle', [AdminArtistController, 'create']).as('admin.artists.create')
    router.post('/cizerler/ekle', [AdminArtistController, 'store']).as('admin.artists.store')
    router.get('/cizerler/:id/duzenle', [AdminArtistController, 'edit']).as('admin.artists.edit')
    router.post('/cizerler/:id/duzenle', [AdminArtistController, 'update']).as('admin.artists.update')
    router.post('/cizerler/:id/sil', [AdminArtistController, 'destroy']).as('admin.artists.destroy')

    // Content Types CRUD
    router.get('/icerik-turleri', [AdminContentTypeController, 'index']).as('admin.content_types.index')
    router.get('/icerik-turleri/ekle', [AdminContentTypeController, 'create']).as('admin.content_types.create')
    router.post('/icerik-turleri/ekle', [AdminContentTypeController, 'store']).as('admin.content_types.store')
    router.get('/icerik-turleri/:id/duzenle', [AdminContentTypeController, 'edit']).as('admin.content_types.edit')
    router.post('/icerik-turleri/:id/duzenle', [AdminContentTypeController, 'update']).as('admin.content_types.update')
    router.post('/icerik-turleri/:id/sil', [AdminContentTypeController, 'destroy']).as('admin.content_types.destroy')
  })
  .prefix('/admin')
  .use(middleware.auth())
