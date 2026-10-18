/**
 * Account roles. `staff` roles may open the administration panel. The label and colour are
 * defaults; administrators can restyle them under Admin → Roller (see settings_service).
 */
export const roles = {
  admin: { label: 'Yönetici', color: '#fca5a5' },
  editor: { label: 'Editör', color: '#fcd34d' },
  vip: { label: 'VIP', color: '#f0abfc' },
  member: { label: 'Üye', color: '#6ee7b7' },
} as const

export type Role = keyof typeof roles
export const roleNames = Object.keys(roles) as Role[]
export const staffRoles: Role[] = ['admin', 'editor']

export const isRole = (value: unknown): value is Role => typeof value === 'string' && value in roles

/** What each role may do. Shown read-only on the roles page; routes enforce it with `role()`. */
export const permissions: { label: string; roles: Role[] }[] = [
  { label: 'Okuma, yorum yapma ve kaydetme', roles: ['admin', 'editor', 'vip', 'member'] },
  { label: 'Üyelere özel içerik', roles: ['admin', 'editor', 'vip', 'member'] },
  { label: "VIP'lere özel içerik", roles: ['admin', 'editor', 'vip'] },
  { label: 'Yönetim paneline erişim', roles: ['admin', 'editor'] },
  { label: 'Seri, bölüm ve sözlük yönetimi', roles: ['admin', 'editor'] },
  { label: 'Başkalarının yorumlarını silme', roles: ['admin', 'editor'] },
  { label: 'Kozmetik ve kart yönetimi', roles: ['admin'] },
  { label: 'Tema ayarları', roles: ['admin'] },
  { label: 'Kullanıcı ve rol yönetimi', roles: ['admin'] },
]
