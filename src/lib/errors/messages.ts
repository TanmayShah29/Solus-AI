export function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  if (message.includes('rate_limit') || message.includes('429')) {
    return "Groq is rate-limiting us. Give me ten minutes, sir."
  }
  if (message.includes('quota') || message.includes('100k') || message.includes('token')) {
    return "Daily token limit hit. Resets at midnight IST."
  }
  if (message.includes('google') && message.includes('token')) {
    return "Google's token has expired. You'll need to re-authorize at /api/auth/google."
  }
  if (message.includes('google') && (message.includes('401') || message.includes('403'))) {
    return "Google is rejecting the credentials. Re-authorization required."
  }
  if (message.includes('tavily') || message.includes('search')) {
    return "Search is unavailable right now. I'll work from memory."
  }
  if (message.includes('supabase') || message.includes('database') || message.includes('postgres')) {
    return "Database is unreachable. Running without memory for now."
  }
  if (message.includes('econnrefused') || message.includes('fetch failed') || message.includes('network')) {
    return "Can't reach the server. Check your connection."
  }
  if (message.includes('timeout') || message.includes('abort')) {
    return "That took too long. I've cut it off — try again."
  }
  if (message.includes('whisper') || message.includes('transcri')) {
    return "Couldn't process the voice note. Send it as text."
  }
  if (message.includes('github')) {
    return "GitHub is unreachable. Memory updates are paused."
  }
  if (message.includes('inngest')) {
    return "Background jobs are offline. Reminders won't fire until this resolves."
  }

  return "Something went wrong, sir. I'm looking into it."
}
