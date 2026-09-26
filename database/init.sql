CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_metadata (key, value)
VALUES ('project', 'gb-138')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;

-- 床位台账：每次联系单独留痕
CREATE TABLE IF NOT EXISTS contact_logs (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL,
  caller TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL CHECK (result IN ('available', 'unavailable', 'no_answer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_logs_institution
  ON contact_logs (institution_id, created_at DESC);

-- 床位台账：机构「已谈好」标记
CREATE TABLE IF NOT EXISTS institution_marks (
  institution_id INTEGER PRIMARY KEY,
  agreed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
