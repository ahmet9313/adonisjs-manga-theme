/**
 * Translation (fansub) teams: who worked on a series or chapter, team pages and recruitment
 * (app/services/team_service.ts, Admin → Topluluk → Ekipler).
 */
const teams = {
  /**
   * Member roles in display order. A member may hold several roles in one team; the key is
   * stored (`team_members.role`) so labels can be renamed here.
   */
  roles: {
    lead: {
      label: 'Yönetici',
      plural: 'Yöneticiler',
      hint: 'Ekibi ve yayın takvimini yönetir, yeni üyeleri karşılar.',
    },
    translator: {
      label: 'Çevirmen',
      plural: 'Çevirmenler',
      hint: 'Bölümleri İngilizce, Korece, Japonca veya Çinceden Türkçeye çevirir.',
    },
    proofreader: {
      label: 'Redaktör',
      plural: 'Redaktörler',
      hint: 'Çeviriyi yazım, anlatım ve tutarlılık için okur, düzeltir.',
    },
    editor: {
      label: 'Editör',
      plural: 'Editörler',
      hint: 'Sayfaları baştan sona hazırlar: temizlik, dizgi ve son kontrol.',
    },
    cleaner: {
      label: 'Temizleyici',
      plural: 'Temizleyiciler',
      hint: 'Konuşma balonlarındaki ve efektlerdeki özgün yazıları siler.',
    },
    typesetter: {
      label: 'Dizgici',
      plural: 'Dizgiciler',
      hint: 'Türkçe metni balonlara uygun yazı tipi ve boyutla yerleştirir.',
    },
  },
  /** People per role in the admin form (usernames). */
  maxMembersPerRole: 30,
  /** Teams credited on one series or chapter. */
  maxPerItem: 5,
  /** Links a team can show; each must be an http(s) address. */
  links: {
    discord_url: { label: 'Discord', icon: 'chat' },
    website_url: { label: 'Web sitesi', icon: 'globe' },
    other_url: { label: 'Diğer bağlantı', icon: 'external' },
  },
  /** Logo upload: same formats as series images, smaller limit. */
  logoOptions: { size: '2mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] },
  /** Team page: latest chapters credited to the team. */
  latestChapters: 12,
}

export type TeamRole = keyof typeof teams.roles
export const teamRoleKeys = Object.keys(teams.roles) as TeamRole[]
export type TeamLinkField = keyof typeof teams.links
export const teamLinkFields = Object.keys(teams.links) as TeamLinkField[]

export default teams
