/**
 * Scheduled publishing and the release calendar (/takvim).
 * Times are entered and shown in the site time zone (config/site.ts → timezone) and stored as UTC.
 */
const calendar = {
  /** Weekday keys stored in `series.release_days`, Monday first (key → name). */
  weekdays: {
    pzt: 'Pazartesi',
    sal: 'Salı',
    car: 'Çarşamba',
    per: 'Perşembe',
    cum: 'Cuma',
    cmt: 'Cumartesi',
    paz: 'Pazar',
  } as Record<string, string>,
  /** Short names for the weekday picker of the series form. */
  shortWeekdays: {
    pzt: 'Pzt',
    sal: 'Sal',
    car: 'Çar',
    per: 'Per',
    cum: 'Cum',
    cmt: 'Cmt',
    paz: 'Paz',
  } as Record<string, string>,
  /** How often the scheduler looks for due drafts (web server only, start/scheduler.ts). */
  intervalMs: 60_000,
  /** Days ahead in the week and month views; days back for "Son 7 gün". */
  weekDays: 7,
  monthDays: 30,
  recentDays: 7,
  /** Limits so one page never lists an unbounded number of rows. */
  maxUpcoming: 200,
  maxRecent: 300,
  /** Longest free-text note ("Her cuma 20.00'de"). */
  noteLength: 80,
}

export const weekdayKeys = Object.keys(calendar.weekdays)

export default calendar
