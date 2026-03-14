import webSearch from '@/skills/web_search.json'
import readUrl from '@/skills/read_url.json'
import weather from '@/skills/weather.json'
import newsHeadlines from '@/skills/news_headlines.json'
import youtubeSummary from '@/skills/youtube_summary.json'
import currencyConvert from '@/skills/currency_convert.json'
import telegramSend from '@/skills/telegram_send.json'
import setReminder from '@/skills/set_reminder.json'
import googleCalendar from '@/skills/google_calendar.json'
import gmailRead from '@/skills/gmail_read.json'
import googleDrive from '@/skills/google_drive.json'
import updateMemory from '@/skills/update_memory.json'
import correctMemory from '@/skills/correct_memory.json'

export const SKILLS = [
  webSearch,
  readUrl,
  weather,
  newsHeadlines,
  youtubeSummary,
  currencyConvert,
  telegramSend,
  setReminder,
  googleCalendar,
  gmailRead,
  googleDrive,
  updateMemory,
  correctMemory,
] as const
