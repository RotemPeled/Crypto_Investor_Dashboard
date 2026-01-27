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

-- user_votes (per-day feedback)
CREATE TABLE IF NOT EXISTS user_votes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  day        DATE NOT NULL DEFAULT CURRENT_DATE,
  section    TEXT NOT NULL,
  item       TEXT NOT NULL,
  value      SMALLINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT fk_votes FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_vote UNIQUE (user_id, day, section, item),
  CONSTRAINT value_check CHECK (value = ANY (ARRAY[-1, 1]))
);

-- daily_dashboard (daily snapshot per user)
CREATE TABLE IF NOT EXISTS daily_dashboard (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  day         DATE NOT NULL,
  sections    JSONB NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT fk_daily_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT unique_daily_dashboard UNIQUE (user_id, day)
);
