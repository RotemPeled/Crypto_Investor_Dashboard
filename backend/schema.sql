-- users
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT unique_email UNIQUE (email)
);

-- user_preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  crypto_assets JSONB NOT NULL,
  investor_type TEXT NOT NULL,
  content_type  JSONB NOT NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_preferences_user_id_key UNIQUE (user_id)
);

-- daily_dashboard
-- IMPORTANT CHANGE:
-- 1) removed UNIQUE(user_id, day) so we can store multiple snapshots per day (history)
CREATE TABLE IF NOT EXISTS daily_dashboard (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  day         DATE NOT NULL DEFAULT CURRENT_DATE,
  sections    JSONB NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT fk_daily_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- useful index: quickly fetch latest snapshot for a user/day
CREATE INDEX IF NOT EXISTS idx_daily_dashboard_user_day_created
  ON daily_dashboard (user_id, day, created_at DESC);

-- user_votes
-- IMPORTANT CHANGE:
-- 1) added dashboard_id to link vote -> exact dashboard snapshot
-- 2) uniqueness is per snapshot (user_id, dashboard_id, section, item)
CREATE TABLE IF NOT EXISTS user_votes (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  dashboard_id BIGINT NOT NULL,
  day          DATE NOT NULL DEFAULT CURRENT_DATE,
  section      TEXT NOT NULL,
  item         TEXT NOT NULL,
  value        SMALLINT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT fk_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_dashboard FOREIGN KEY (dashboard_id) REFERENCES daily_dashboard(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_vote_per_dashboard UNIQUE (user_id, dashboard_id, section, item),
  CONSTRAINT value_check CHECK (value = ANY (ARRAY[-1, 1]))
);

CREATE INDEX IF NOT EXISTS idx_user_votes_user_day
  ON user_votes (user_id, day);

CREATE INDEX IF NOT EXISTS idx_user_votes_dashboard
  ON user_votes (dashboard_id);
