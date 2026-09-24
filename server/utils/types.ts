// =============================================================================
// Types
// =============================================================================

export type SOPPhase = 'VERIFY_ID' | 'RESOLVE_INTENT' | 'PROCESS_CASE' | 'POST_PROCESS'

export interface CollectedPII {
  name?: string
  dob?: string
  phone?: string
  email?: string
  ssn_last4?: string
  national_id_last4?: string
  policy_number?: string
}

export interface CrossPhaseMemory {
  intentHints: string[]
  caseHints: string[]
  emotionalState: 'neutral' | 'frustrated' | 'angry' | 'anxious' | 'confused'
  outOfScopeAttempts: number
}

export interface Policyholder {
  party_id: string
  name: string
  name_aliases: string[] | null
  policy_number: string
  dob: string
  id_type: string
  id_last4: string
  phone: string
  phone_aliases: string[] | null
  email: string
  email_aliases: string[] | null
}

export interface Claim {
  case_id: string
  party_id: string
  case_type: string
  created_at: string
  status: string
  summary: string | null
  denial_reason: string | null
  documents_needed: string[] | null
  appeal_deadline: string | null
  expected_reimbursement_amount: string
  allowed_max_amount: string
  net_pay: string
  net_fee: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  phase: SOPPhase
}

export interface SessionState {
  sessionId: string
  currentPhase: SOPPhase
  verificationStatus: 'pending' | 'verified' | 'failed'
  collectedPII: CollectedPII
  verifiedFieldCount: number
  matchedPolicyholder: Policyholder | null
  resolvedIntent: string | null
  resolvedClaim: Claim | null
  memory: CrossPhaseMemory
  conversationHistory: ConversationMessage[]
  emailOffered: boolean
  emailSent: boolean
  escalatedToHuman: boolean
  caseProcessed: boolean
}

export interface ChatRequest {
  sessionId?: string
  message: string
}

export interface ChatResponse {
  sessionId: string
  response: string
  phase: SOPPhase
  verificationStatus: 'pending' | 'verified' | 'failed'
  metadata: {
    verifiedFields: number
    requiredFields: number
    matchedPolicyholder: string | null
    resolvedIntent: string | null
    resolvedClaim: string | null
    emailSent: boolean
    escalated: boolean
  }
}
