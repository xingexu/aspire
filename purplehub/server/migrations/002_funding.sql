-- Funding becomes its own request with a budget, so it no longer has to be tied to a post.
CREATE TABLE funding_requests (
  id bigserial PRIMARY KEY,
  club text NOT NULL,
  author_id bigint NOT NULL REFERENCES users ON DELETE CASCADE,
  event text NOT NULL,
  items jsonb NOT NULL,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  attendance integer NOT NULL CHECK (attendance > 0),
  purpose text NOT NULL,
  needed_by date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO funding_requests (club, author_id, event, items, amount, attendance, purpose, needed_by, status)
SELECT club, author_id, title, jsonb_build_array(jsonb_build_object('what', funding_purpose, 'cost', funding_amount)), funding_amount, 1, funding_purpose, ends_at::date, funding_status
FROM posts WHERE funding_status IS NOT NULL;

ALTER TABLE posts DROP COLUMN funding_amount, DROP COLUMN funding_purpose, DROP COLUMN funding_status;
ALTER TABLE posts ADD COLUMN note text NOT NULL DEFAULT '';
