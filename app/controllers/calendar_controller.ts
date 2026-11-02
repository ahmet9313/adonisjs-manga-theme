import type { HttpContext } from '@adonisjs/core/http'
import calendarData from '#services/calendar_service'
import calendar from '#config/calendar'
import { localDay } from '#services/level'
import { addDays } from '#services/publishing_service'

export default class CalendarController {
  /** "Yayın Takvimi": planned chapters ahead (week, or month with ?gorunum=ay), release days, last 7 days. */
  async index({ view, request }: HttpContext) {
    const mode = request.input('gorunum') === 'ay' ? 'month' : 'week'
    const at = new Date()
    const today = localDay(at)
    const [days, recent] = await Promise.all([
      calendarData.upcoming(mode, at),
      calendarData.recent(at),
    ])
    return view.render('pages/calendar', {
      title: 'Yayın Takvimi',
      description:
        'Planlanan bölümler, serilerin yayın günleri ve son 7 günde çıkan bölümler tek sayfada.',
      mode,
      days,
      recent,
      today,
      tomorrow: addDays(today, 1),
      yesterday: addDays(today, -1),
      weekdays: calendar.weekdays,
      length: mode === 'month' ? calendar.monthDays : calendar.weekDays,
    })
  }
}
