-- One row per blind-mode vote. Ratings are recomputed from this table.
CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- JSON array of the 2-4 model ids that answered the round.
  models TEXT NOT NULL,
  -- A model id from `models`, or NULL for a tie.
  winner TEXT,
  reasoning TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX votes_created_at ON votes (created_at);
