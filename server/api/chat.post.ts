// POST /api/chat
import OpenAI from 'openai'
import { getDb } from '../db/index'

let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = new OpenAI({
      apiKey: config.ollamaApiKey,
      baseURL: config.ollamaBaseUrl,
    })
  }
  return _client
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { sessionId, message } = body || {}

  if (!message || typeof message !== 'string' || !message.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Message is required' })
  }

  // Ensure DB is initialised (lazy)
  getDb()

  let session
  if (sessionId) {
    session = getChatSession(sessionId)
    if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  } else {
    session = createSession()
  }

  const config = useRuntimeConfig()
  const model = config.ollamaModel || 'nemotron-3-ultra'

  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await processMessageStreamLangChain(getClient(), model, session, message.trim(), controller)
      } catch (err) {
        console.error('SOP engine error:', err)
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk: '\n[System Error: Failed to process request]' })}\n\n`))
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ done: true, phase: session.currentPhase, verificationStatus: session.verificationStatus, sessionId: session.sessionId })}\n\n`))
      } finally {
        controller.close()
      }
    }
  })

  return sendStream(event, stream)
})
