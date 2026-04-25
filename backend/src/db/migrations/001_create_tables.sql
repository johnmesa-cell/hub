-- Proyectos del portal
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  url         TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  active      INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0
);

-- Audit log: firebase_uid en lugar de FK a users
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT,
  action      TEXT NOT NULL,
  ip          TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
