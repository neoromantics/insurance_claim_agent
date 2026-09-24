// =============================================================================
// Database — SQLite via better-sqlite3
// =============================================================================

import Database from 'better-sqlite3'
import { resolve } from 'path'

const DB_PATH = process.env.DATABASE_PATH || resolve(process.cwd(), 'data.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    migrate(_db)
  }
  return _db
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS policyholders (
      party_id       TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      name_aliases   TEXT,          -- JSON array
      policy_number  TEXT NOT NULL UNIQUE,
      dob            TEXT NOT NULL,
      id_type        TEXT NOT NULL,
      id_last4       TEXT NOT NULL,
      phone          TEXT NOT NULL,
      phone_aliases  TEXT,          -- JSON array
      email          TEXT NOT NULL,
      email_aliases  TEXT           -- JSON array
    );

    CREATE TABLE IF NOT EXISTS claims (
      case_id                      TEXT PRIMARY KEY,
      party_id                     TEXT NOT NULL REFERENCES policyholders(party_id),
      case_type                    TEXT NOT NULL,
      created_at                   TEXT NOT NULL,
      status                       TEXT NOT NULL,
      summary                      TEXT,
      denial_reason                TEXT,
      documents_needed             TEXT,  -- JSON array
      appeal_deadline              TEXT,
      expected_reimbursement_amount TEXT,
      allowed_max_amount           TEXT,
      net_pay                      TEXT,
      net_fee                      TEXT
    );

    CREATE TABLE IF NOT EXISTS representatives (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      rep_name         TEXT NOT NULL,
      relationship     TEXT NOT NULL,
      buyer_name       TEXT NOT NULL,
      buyer_party_id   TEXT NOT NULL REFERENCES policyholders(party_id)
    );

    CREATE TABLE IF NOT EXISTS document_guidelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT NOT NULL,   -- 'document_guidance' | 'document_alternative' | 'case_type' | 'followup' | 'settings' | 'default' | 'fallback'
      key         TEXT NOT NULL,
      content     TEXT NOT NULL,   -- JSON
      UNIQUE(category, key)
    );
  `)
}
