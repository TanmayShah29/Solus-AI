import { env } from '@/lib/env'
import { googleFetch } from '@/lib/google/client'
import { traceable } from 'langsmith/traceable'

export const POST = traceable(
  async (req: Request) => {
    const start = Date.now()
    try {
      const authHeader = req.headers.get('Authorization')
      if (authHeader !== `Bearer ${env.API_SECRET_TOKEN}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { args } = await req.json()
      const action = args.action as 'list_events' | 'create_event' | 'check_free_busy'

      if (action === 'list_events') {
        const timeMin = args.time_min && new Date(args.time_min) > new Date('2025-01-01')
          ? args.time_min
          : new Date().toISOString()

        const timeMax = args.time_max && new Date(args.time_max) > new Date('2025-01-01')
          ? args.time_max
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

        const params = new URLSearchParams({
          timeMin,
          timeMax,
          maxResults: String(args.max_results ?? 10),
          singleEvents: 'true',
          orderBy: 'startTime',
        })

        const res = await googleFetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`
        )
        const data = await res.json()

        if (!res.ok) {
          throw new Error(`Google Calendar API error: ${data.error?.message || res.statusText}`);
        }

        const events = (data.items ?? []).map((e: any) => ({
          id: e.id,
          title: e.summary,
          start: e.start?.dateTime ?? e.start?.date,
          end: e.end?.dateTime ?? e.end?.date,
          location: e.location,
          description: e.description,
          attendees: e.attendees?.map((a: any) => a.email),
        }))

        return Response.json({
          success: true,
          result: events,
          summary: `Found ${events.length} events. Next: ${events[0]?.title ?? 'none'} at ${events[0]?.start ?? 'N/A'}`,
          duration_ms: Date.now() - start,
        })
      }

      if (action === 'create_event') {
        const body = {
          summary: args.title,
          description: args.description,
          start: { dateTime: args.start_time, timeZone: 'Asia/Kolkata' },
          end: { dateTime: args.end_time, timeZone: 'Asia/Kolkata' },
          location: args.location,
        }

        const res = await googleFetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          { method: 'POST', body: JSON.stringify(body) }
        )
        const event = await res.json()

        if (!res.ok) {
          throw new Error(`Google Calendar API error: ${event.error?.message || res.statusText}`);
        }

        return Response.json({
          success: true,
          result: { id: event.id, title: event.summary, start: event.start?.dateTime },
          summary: `Created: ${event.summary} at ${event.start?.dateTime}`,
          duration_ms: Date.now() - start,
        })
      }

      if (action === 'check_free_busy') {
        const body = {
          timeMin: args.time_min ?? new Date().toISOString(),
          timeMax: args.time_max ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          items: [{ id: 'primary' }],
        }

        const res = await googleFetch(
          'https://www.googleapis.com/calendar/v3/freeBusy',
          { method: 'POST', body: JSON.stringify(body) }
        )
        const data = await res.json()

        if (!res.ok) {
          throw new Error(`Google Calendar API error: ${data.error?.message || res.statusText}`);
        }

        const busy = data.calendars?.primary?.busy ?? []

        return Response.json({
          success: true,
          result: { busy_slots: busy },
          summary: busy.length === 0 ? 'You are free during this period.' : `${busy.length} busy slot(s).`,
          duration_ms: Date.now() - start,
        })
      }

      return Response.json({ error: 'Unknown action' }, { status: 400 })
    } catch (error) {
      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - start,
      }, { status: 500 })
    }
  },
  { name: 'tool_google_calendar' }
)
