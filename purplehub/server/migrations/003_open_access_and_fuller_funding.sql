-- Everyone who signs up can use their role straight away.
UPDATE users SET approved = true WHERE NOT approved;

-- The fuller application, and the USC's decision on it.
ALTER TABLE funding_requests
  ADD COLUMN details jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN approved_amount numeric(10, 2),
  ADD COLUMN reviewer_id bigint REFERENCES users ON DELETE SET NULL,
  ADD COLUMN decided_at timestamptz;
UPDATE funding_requests SET approved_amount = amount WHERE status = 'approved';
