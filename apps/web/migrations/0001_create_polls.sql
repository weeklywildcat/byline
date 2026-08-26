CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  opens_at TEXT,
  closes_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  voter_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (poll_id, voter_key),
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO polls (id, question, status)
VALUES ('website-coverage', 'What should Weekly Wildcat cover more of next?', 'open');

INSERT OR IGNORE INTO poll_options (id, poll_id, label, position)
VALUES
  ('news', 'website-coverage', 'More school news', 0),
  ('sports', 'website-coverage', 'More sports coverage', 1),
  ('features', 'website-coverage', 'More student features', 2);
