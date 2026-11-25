-- Anonymous pastes per UTC day, for the global MAX_ANON_PER_DAY ceiling. The cron keeps 7 days.
CREATE TABLE IF NOT EXISTS anon_usage (
  day   TEXT PRIMARY KEY,  -- YYYY-MM-DD (UTC)
  count INTEGER NOT NULL
);
