import { defineConfig } from '@adonisjs/core/bodyparser'

const bodyParserConfig = defineConfig({
  /**
   * The bodyparser middleware will parse the request body
   * for the following HTTP methods.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Config for the "application/x-www-form-urlencoded"
   * content-type parser
   */
  form: {
    convertEmptyStringsToNull: true,
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * Config for the JSON parser
   */
  json: {
    convertEmptyStringsToNull: true,
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /**
   * Config for the "multipart/form-data" content-type parser.
   * File uploads are handled by the multipart parser.
   */
  multipart: {
    /**
     * Enabling auto process allows bodyparser middleware to
     * move all uploaded files inside the tmp folder of your
     * operating system
     */
    autoProcess: true,
    convertEmptyStringsToNull: true,
    /**
     * Episode videos (up to `watch.maxUploadBytes`) are streamed straight to the content
     * directory by the controller instead of the tmp folder, outside the limit below; bulk
     * chapter ZIPs (`adminTools.bulk.maxZipBytes`) likewise to their temporary folder.
     */
    processManually: ['/admin/bolumler/video', '/admin/toplu-yukle/arsiv'],

    /**
     * Maximum limit of data to parse including all files
     * and fields
     */
    limit: '200mb',
    types: ['multipart/form-data'],
  },
})

export default bodyParserConfig
