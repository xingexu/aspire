CREATE TABLE users (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('student', 'club', 'admin')),
  club text,
  approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE posts (
  id bigserial PRIMARY KEY,
  club text NOT NULL,
  author_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  title text NOT NULL,
  date_text text NOT NULL,
  place text NOT NULL,
  ends_at timestamptz NOT NULL,
  post_url text NOT NULL DEFAULT '',
  img text NOT NULL DEFAULT '',
  cat text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  funding_amount numeric(10, 2),
  funding_purpose text,
  funding_status text CHECK (funding_status IN ('pending', 'approved', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A conversation between one person (owner) and an inbox: 'usc' or a club id. Everyone who staffs the inbox can answer.
CREATE TABLE threads (
  id bigserial PRIMARY KEY,
  owner_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  inbox text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, inbox)
);

CREATE TABLE messages (
  id bigserial PRIMARY KEY,
  thread_id bigint NOT NULL REFERENCES threads ON DELETE CASCADE,
  sender_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_thread ON messages (thread_id, id);

CREATE TABLE thread_reads (
  user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  thread_id bigint NOT NULL REFERENCES threads ON DELETE CASCADE,
  last_read_id bigint NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);
