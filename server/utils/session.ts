// =============================================================================
// Session manager — in-memory session store
// =============================================================================

import { nanoid } from 'nanoid'
import type { SessionState, SOPPhase } from './types'

const sessions = new Map<string, SessionState>()

export const INITIAL_GREETING = "Hello! I'm your claims support assistant. To protect your privacy, could you please verify your identity by providing three of the following: Full name, Date of birth, Phone number, Email, Policy number, or the last four digits of your SSN?"

export function createSession(): SessionState {
  const s: SessionState = {
    sessionId: nanoid(12),
    currentPhase: 'VERIFY_ID',
    verificationStatus: 'pending',
    collectedPII: {},
    verifiedFieldCount: 0,
    matchedPolicyholder: null,
    resolvedIntent: null,
    resolvedClaim: null,
    memory: { intentHints: [], caseHints: [], emotionalState: 'neutral', outOfScopeAttempts: 0 },
    conversationHistory: [],
    emailOffered: false,
    emailSent: false,
    escalatedToHuman: false,
    caseProcessed: false,
  }
  sessions.set(s.sessionId, s)
  addMessage(s.sessionId, 'assistant', INITIAL_GREETING, 'VERIFY_ID')
  return s
}

export function getChatSession(id: string): SessionState | undefined {
  return sessions.get(id)
}

export function transitionPhase(id: string, newPhase: SOPPhase): SessionState | undefined {
  const s = sessions.get(id)
  if (!s) return undefined
  const valid: Record<SOPPhase, SOPPhase[]> = {
    VERIFY_ID: ['RESOLVE_INTENT'],
    RESOLVE_INTENT: ['PROCESS_CASE'],
    PROCESS_CASE: ['POST_PROCESS'],
    POST_PROCESS: [],
  }
  if (!valid[s.currentPhase].includes(newPhase)) throw new Error(`Bad transition ${s.currentPhase} → ${newPhase}`)
  s.currentPhase = newPhase
  return s
}

export function addMessage(id: string, role: 'user'|'assistant', content: string, phase: SOPPhase) {
  const s = sessions.get(id)
  if (!s) return
  s.conversationHistory.push({ role, content, timestamp: new Date().toISOString(), phase })
}
