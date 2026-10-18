/**
 * Video ("izle") series: episodes of content types whose format is `video` (Admin → İçerik
 * Türleri, config/site.ts → contentFormats) hold video sources instead of pages.
 * A source is either a file hosted on this site (the local player, shown under `localHost`), an
 * embedded player from another site (iframe) or a direct video link.
 */
const watch = {
  /** Display name of videos uploaded to this site. */
  localHost: 'maouwach',
  /** Uploaded video formats (checked by file signature, not only the extension). */
  videoExtensions: ['mp4', 'webm', 'm4v'],
  /** Largest single video upload, in bytes (4 GB). */
  maxUploadBytes: 4 * 1024 ** 3,
  /** Upper bound of sources per episode and of a host/label name. */
  maxSources: 40,
  maxNameLength: 60,
  maxLabelLength: 30,
}

export type VideoSourceKind = 'local' | 'embed' | 'file'

/**
 * One playable source as stored in `chapters.content` (`{ type: 'video', sources }`).
 * - `local`: `url` is `/content/videos/<series id>/<uuid>.<ext>`; `host` is always `localHost`.
 * - `embed`: `url` is an https player address loaded in an iframe.
 * - `file`: `url` is an https .mp4/.webm/.m4v address played with <video>.
 */
export interface VideoSource {
  host: string
  kind: VideoSourceKind
  url: string
  label: string | null
}

export default watch
