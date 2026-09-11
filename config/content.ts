import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { resolve } from 'node:path'

/** In production the launcher points this at the persistent project content directory. */
const content = {
  root:
    app.getEnvironment() === 'test'
      ? app.tmpPath('test-uploads/content')
      : resolve(env.get('CONTENT_ROOT') || app.publicPath('content')),
}

export default content
