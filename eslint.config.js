import { configApp } from '@adonisjs/eslint-config'
export default configApp(
  { ignores: ['.tools/**', '.claude/**', 'tmp/**', 'public/content/**'] },
  {
    files: ['resources/js/**/*.js', 'scripts/**/*.mjs'],
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'valid-typeof': 'error',
    },
  }
)
