CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('student','event_coordinator','coordinator','teacher','admin')),
  roll_no TEXT UNIQUE,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  department TEXT,
  year TEXT,
  section TEXT,
  class_name TEXT,
  gender TEXT,
  club TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id DOUBLE PRECISION PRIMARY KEY,
  name TEXT NOT NULL,
  club TEXT,
  description TEXT,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  venue TEXT NOT NULL,
  deadline DATE,
  max_participants INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'OPEN',
  attendance_completed BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS registrations (
  id DOUBLE PRECISION PRIMARY KEY,
  event_id DOUBLE PRECISION NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, student_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id DOUBLE PRECISION PRIMARY KEY,
  event_id DOUBLE PRECISION NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT TRUE,
  marked_by TEXT REFERENCES users(id),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, student_id)
);

CREATE TABLE IF NOT EXISTS permission_requests (
  id DOUBLE PRECISION PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  letter_text TEXT NOT NULL,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_at TIMESTAMPTZ,
  saved_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id DOUBLE PRECISION PRIMARY KEY,
  time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL,
  role TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  detail TEXT NOT NULL,
  event_id DOUBLE PRECISION,
  student_id TEXT,
  account_id TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id DOUBLE PRECISION PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  event_id DOUBLE PRECISION,
  permission_id DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(date, time);
CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_student ON registrations(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_event ON attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_permissions_student ON permission_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(time DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
