import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'
import env from '#start/env'

export default class AdminSeeder extends BaseSeeder {
  async run() {
    if (env.get('NODE_ENV') === 'production')
      throw new Error('Demo yönetici seed işlemi üretimde kullanılamaz.')
    await User.firstOrCreate(
      { email: 'admin@admin.com' },
      {
        fullName: 'Admin',
        email: 'admin@admin.com',
        password: 'admin',
      }
    )
  }
}
