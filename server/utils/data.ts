// =============================================================================
// Data queries — thin wrappers around the DB
// =============================================================================

import { getDb } from '../db/index'
import type { Policyholder, Claim, CollectedPII } from './types'

// ---------------------------------------------------------------------------
// Row → typed object helpers
// ---------------------------------------------------------------------------

function toPolicyholder(row: any): Policyholder {
  return {
    ...row,
    name_aliases: row.name_aliases ? JSON.parse(row.name_aliases) : null,
    phone_aliases: row.phone_aliases ? JSON.parse(row.phone_aliases) : null,
    email_aliases: row.email_aliases ? JSON.parse(row.email_aliases) : null,
  }
}

function toClaim(row: any): Claim {
  return {
    ...row,
    documents_needed: row.documents_needed ? JSON.parse(row.documents_needed) : null,
  }
}

// ---------------------------------------------------------------------------
// Policyholder lookups
// ---------------------------------------------------------------------------

export function findPolicyholderByName(name: string): Policyholder | null {
  const db = getDb()
  const norm = name.toLowerCase().trim()

  // Exact match on name
  let row = db.prepare('SELECT * FROM policyholders WHERE LOWER(name) = ?').get(norm)
  if (row) return toPolicyholder(row)

  // Alias match
  const all = db.prepare('SELECT * FROM policyholders WHERE name_aliases IS NOT NULL').all()
  for (const r of all) {
    const aliases: string[] = JSON.parse((r as any).name_aliases)
    if (aliases.some(a => a.toLowerCase() === norm)) return toPolicyholder(r)
  }
  return null
}

export function findPolicyholderByPolicy(policyNumber: string): Policyholder | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM policyholders WHERE UPPER(policy_number) = ?')
    .get(policyNumber.toUpperCase().trim())
  return row ? toPolicyholder(row) : null
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export function getClaimsForPolicyholder(partyId: string): Claim[] {
  return getDb().prepare('SELECT * FROM claims WHERE party_id = ? ORDER BY created_at DESC')
    .all(partyId)
    .map(toClaim)
}

export function findClaimById(caseId: string): Claim | null {
  const row = getDb().prepare('SELECT * FROM claims WHERE case_id = ?').get(caseId)
  return row ? toClaim(row) : null
}

export function findClaimsByHints(partyId: string, hints: string[]): Claim[] {
  const partyClaims = getClaimsForPolicyholder(partyId)
  if (!partyClaims.length) return []

  const hintText = hints.join(' ').toLowerCase()

  return partyClaims.filter(c => {
    let score = 0
    if (hintText.includes(c.status.toLowerCase())) score++
    if (hintText.includes(c.case_type.toLowerCase())) score++
    
    // Check if any month name matches the created_at date
    const dateStr = new Date(c.created_at).toLocaleString('en-US', { month: 'long' }).toLowerCase()
    if (hintText.includes(dateStr)) score++
    
    // Check for exact claim ID match
    if (hintText.includes(c.case_id.toLowerCase())) score += 5
    
    return score > 0
  }).sort((a, b) => {
    if (a.status === 'denied' && b.status !== 'denied') return -1
    if (b.status === 'denied' && a.status !== 'denied') return 1
    return b.created_at.localeCompare(a.created_at)
  })
}

// ---------------------------------------------------------------------------
// Document guidance
// ---------------------------------------------------------------------------

function getGuideline(category: string, key: string): any | null {
  const row = getDb()
    .prepare('SELECT content FROM document_guidelines WHERE category = ? AND key = ?')
    .get(category, key) as { content: string } | undefined
  return row ? JSON.parse(row.content) : null
}

export function getDocumentGuidance(docType: string): string {
  const g = getGuideline('document_guidance', docType.toLowerCase())
  if (g?.en) return g.en
  const def = getGuideline('default', 'default_guidance')
  return def?.en || 'Please submit the required document via the member portal.'
}

export function getDocumentAlternativeGuidance(docType: string): string {
  const g = getGuideline('document_alternative', docType.toLowerCase())
  if (g?.en) return g.en
  const def = getGuideline('document_alternative', 'default')
  return def?.en || ''
}

export function getCaseTypeGuidance(caseType: string): string {
  const g = getGuideline('case_type', caseType.toLowerCase())
  return g?.en || ''
}

// ---------------------------------------------------------------------------
// PII verification
// ---------------------------------------------------------------------------

function normalizeDate(dateStr: string): string {
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return dateStr

  const us = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`

  const months: Record<string, string> = {
    january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
    july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',
    jan:'01',feb:'02',mar:'03',apr:'04',jun:'06',jul:'07',aug:'08',
    sep:'09',oct:'10',nov:'11',dec:'12',
  }
  const named = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i)
  if (named) {
    const m = months[named[1].toLowerCase()]
    if (m) return `${named[3]}-${m}-${named[2].padStart(2, '0')}`
  }

  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  return dateStr
}

export function verifyPII(
  collected: Record<string, string | undefined>,
  ph: Policyholder,
): { matchedFields: string[], unmatchedFields: string[] } {
  const matched: string[] = []
  const unmatched: string[] = []

  if (collected.name) {
    const n = collected.name.toLowerCase().trim()
    const ok = ph.name.toLowerCase() === n || (ph.name_aliases || []).some(a => a.toLowerCase() === n)
    ok ? matched.push('name') : unmatched.push('name')
  }
  if (collected.dob) {
    normalizeDate(collected.dob) === ph.dob ? matched.push('dob') : unmatched.push('dob')
  }
  if (collected.phone) {
    const pn = collected.phone.replace(/\D/g, '')
    const ok = ph.phone.replace(/\D/g, '') === pn || (ph.phone_aliases || []).some(a => a.replace(/\D/g, '') === pn)
    ok ? matched.push('phone') : unmatched.push('phone')
  }
  if (collected.email) {
    const e = collected.email.toLowerCase().trim()
    const ok = ph.email.toLowerCase() === e || (ph.email_aliases || []).some(a => a.toLowerCase() === e)
    ok ? matched.push('email') : unmatched.push('email')
  }
  if (collected.ssn_last4) {
    const s = collected.ssn_last4.replace(/\D/g, '')
    ph.id_type === 'ssn_last4' && ph.id_last4 === s ? matched.push('ssn_last4') : unmatched.push('ssn_last4')
  }
  if (collected.national_id_last4) {
    const s = collected.national_id_last4.replace(/\D/g, '')
    ph.id_type === 'national_id_last4' && ph.id_last4 === s ? matched.push('national_id_last4') : unmatched.push('national_id_last4')
  }

  return { matchedFields: matched, unmatchedFields: unmatched }
}
