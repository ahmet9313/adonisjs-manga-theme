import env from '#start/env'
import { defineConfig, drivers } from '@adonisjs/core/encryption'

/**
 * The encryption configuration. The "legacy" driver is compatible with the
 * AdonisJS v6 encryption format (AES-256-CBC + HMAC SHA-256), so existing
 * encrypted cookies, sessions and signed URLs keep working after the upgrade.
 *
 * The encryption module will fail to decrypt data if the key is lost or
 * changed. Therefore it is recommended to keep the app key secure.
 */
const encryptionConfig = defineConfig({
  default: 'legacy',
  list: {
    legacy: drivers.legacy({
      keys: [env.get('APP_KEY')],
    }),
  },
})

export default encryptionConfig
