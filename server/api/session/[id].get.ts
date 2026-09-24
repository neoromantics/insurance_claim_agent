import { getChatSession } from '../../utils/session'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing session ID' })

  const session = getChatSession(id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Session not found' })

  return {
    sessionId: session.sessionId,
    phase: session.currentPhase,
    verificationStatus: session.verificationStatus,
    history: session.conversationHistory
  }
})
