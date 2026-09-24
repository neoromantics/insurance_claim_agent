// Nitro plugin — seed database on first boot if empty
import { getDb } from '../db/index'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

export default defineNitroPlugin(() => {
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) AS n FROM policyholders').get() as any).n
  if (count > 0) return // already seeded

  const dir = resolve(process.cwd(), 'fixtures')
  if (!existsSync(dir)) {
    console.warn('⚠ fixtures/ dir not found — skipping auto-seed')
    return
  }

  const load = (f: string) => JSON.parse(readFileSync(resolve(dir, f), 'utf-8'))

  // Policyholders
  const insertPH = db.prepare(`INSERT INTO policyholders (party_id,name,name_aliases,policy_number,dob,id_type,id_last4,phone,phone_aliases,email,email_aliases) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  for (const ph of load('policyholders.json')) {
    insertPH.run(ph.party_id, ph.name, ph.name_aliases ? JSON.stringify(ph.name_aliases) : null, ph.policy_number, ph.dob, ph.id_type, ph.id_last4, ph.phone, ph.phone_aliases ? JSON.stringify(ph.phone_aliases) : null, ph.email, ph.email_aliases ? JSON.stringify(ph.email_aliases) : null)
  }

  // Claims
  const insertCL = db.prepare(`INSERT INTO claims (case_id,party_id,case_type,created_at,status,summary,denial_reason,documents_needed,appeal_deadline,expected_reimbursement_amount,allowed_max_amount,net_pay,net_fee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  for (const c of load('claims.json')) {
    insertCL.run(c.case_id, c.party_id, c.case_type, c.created_at, c.status, c.summary||null, c.denial_reason||null, c.documents_needed ? JSON.stringify(c.documents_needed) : null, c.appeal_deadline||null, c.expected_reimbursement_amount, c.allowed_max_amount, c.net_pay, c.net_fee)
  }

  // Representatives
  const insertR = db.prepare(`INSERT INTO representatives (rep_name,relationship,buyer_name,buyer_party_id) VALUES (?,?,?,?)`)
  for (const r of load('representatives.json')) {
    insertR.run(r.rep_name, r.relationship, r.buyer_name, r.buyer_party_id)
  }

  // Document guidelines
  const insertDG = db.prepare(`INSERT OR REPLACE INTO document_guidelines (category,key,content) VALUES (?,?,?)`)
  const g = load('required_document_guideline.json')
  if (g.default_guidance) insertDG.run('default', 'default_guidance', JSON.stringify(g.default_guidance))
  for (const [k, v] of Object.entries(g.case_type_guidance || {})) insertDG.run('case_type', k, JSON.stringify(v))
  for (const [k, v] of Object.entries(g.document_guidance || {})) insertDG.run('document_guidance', k, JSON.stringify(v))
  for (const [k, v] of Object.entries(g.document_alternative_guidance || {})) insertDG.run('document_alternative', k, JSON.stringify(v))
  for (const gu of (g.claim_followup_guidance || [])) insertDG.run('followup', (gu as any).topic || '', JSON.stringify(gu))
  if (g.claim_followup_settings) insertDG.run('settings', 'claim_followup_settings', JSON.stringify(g.claim_followup_settings))
  if (g.claim_followup_fallback) insertDG.run('fallback', 'claim_followup_fallback', JSON.stringify(g.claim_followup_fallback))

  console.log('✅ Auto-seeded database from fixtures/')
})
