/**
 * Image chapter reader (resources/js/components/reader.js keeps the same lists): reading modes,
 * page sizes and directions accepted from the `reader` cookie and the account settings.
 */
const reader = {
  modes: ['webtoon', 'paged'] as const,
  /** Page width in percent of the reading column, the same steps as the − / + buttons. */
  zoomSteps: [30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200],
  defaultZoom: 100,
  /** Reading direction of paged mode: `rtl` turns forward with the left side (manga). */
  directions: ['ltr', 'rtl'] as const,
  /** Novel text size steps (index into reader.js `fontSizes`) and the default step. */
  fontSteps: 6,
  defaultFont: 2,
  /** Account endpoints: settings changes and reading position saves per user and minute. */
  prefsPerMinute: 30,
  positionsPerMinute: 40,
}

export type ReaderMode = (typeof reader.modes)[number]
export type ReaderDirection = (typeof reader.directions)[number]

export default reader
