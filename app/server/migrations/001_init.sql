-- FoodLink schema, version 1.
-- Applied once by the migration runner in server/store.js (recorded in schema_migrations).

-- Small key/value settings. Holds the pilot start time under the key 'pilotStart'.
CREATE TABLE meta (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

-- The event log: one row per restock, empty-shelf report, surplus drop, reservation and pickup.
-- Current state (shelf counts, open reports, live drops, impact numbers) is always recomputed
-- from these rows by the shared domain module, so this table is the audit trail.
CREATE TABLE events (
  id         text PRIMARY KEY,                     -- event id from the domain module, e.g. rp_k3x9q1
  type       text NOT NULL
             CHECK (type IN ('restock', 'report', 'drop_post', 'reserve', 'pickup')),
  at         bigint NOT NULL,                      -- event time, ms since 1970 (server clock)
  payload    jsonb NOT NULL,                       -- the whole event exactly as the domain module built it
  created_at timestamptz NOT NULL DEFAULT now(),   -- when the row was written
  seq        bigint GENERATED ALWAYS AS IDENTITY UNIQUE  -- write order; breaks ties between equal `at`
);
CREATE INDEX events_at_idx ON events (at);

-- Append-only: rows can be added but never edited or deleted one at a time.
-- POST /api/reset (admin) starts over with TRUNCATE, which is the one deliberate way to clear the log.
CREATE FUNCTION events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER events_append_only
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_append_only();
