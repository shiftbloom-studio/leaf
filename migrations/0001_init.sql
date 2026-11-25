-- leaf: D1 schema. Paste text lives in R2 under p/<id>; this table holds everything else.
CREATE TABLE IF NOT EXISTS pastes (
  id          TEXT PRIMARY KEY,          -- 12 random characters, the link
  title       TEXT,
  lang        TEXT NOT NULL,             -- highlight.js language id, "plaintext" when none
  size        INTEGER NOT NULL,          -- bytes (UTF-8)
  lines       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,          -- unix seconds
  expires_at  INTEGER,                   -- unix seconds, NULL = kept (master token only)
  burn        INTEGER NOT NULL DEFAULT 0, -- 1 = deleted on first read
  delete_hash TEXT NOT NULL,             -- hex SHA-256 of the delete key; the key itself is shown once
  owner       TEXT,                      -- 'master' or api_tokens.id; NULL for anonymous pastes
  views       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pastes_expires ON pastes (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pastes_owner ON pastes (owner, created_at DESC) WHERE owner IS NOT NULL;

-- Named API tokens, issued from an admin hub (for example field) that writes to this table directly.
-- Only the SHA-256 of a token is stored; the plain token is shown once when it is created.
CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  prefix       TEXT NOT NULL,          -- first characters of the token, to recognise it in lists
  hash         TEXT NOT NULL UNIQUE,   -- hex SHA-256 of the full token
  created_at   INTEGER NOT NULL,       -- unix seconds
  created_by   TEXT,
  expires_at   INTEGER,                -- unix seconds, NULL = never
  last_used_at INTEGER,
  revoked_at   INTEGER
);
