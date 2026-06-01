-- ============================================================
-- integritybuilds-intakes · initial schema
-- ------------------------------------------------------------
-- One table, one purpose: every form submission lands here.
-- Apply: wrangler d1 migrations apply integritybuilds-intakes
-- ============================================================

CREATE TABLE intakes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  -- visitor identity
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  -- project intent
  project_type  TEXT,         -- "landing" | "small-business" | "creator-hub" | "other"
  project_brief TEXT NOT NULL,
  -- timing
  slot_1        TEXT NOT NULL,
  slot_2        TEXT,
  timezone      TEXT,
  -- request context
  referrer      TEXT,
  ip            TEXT,
  user_agent    TEXT,
  -- workflow state (so future admin can mark replied / scheduled / declined)
  status        TEXT NOT NULL DEFAULT 'new',
  notes         TEXT
);

CREATE INDEX idx_intakes_created_at ON intakes(created_at DESC);
CREATE INDEX idx_intakes_status     ON intakes(status);
