export const calendarSchema = `
CREATE TABLE IF NOT EXISTS calendar_connections (
 id SERIAL PRIMARY KEY,
 property_id INTEGER NOT NULL REFERENCES properties(id),
 provider TEXT NOT NULL CHECK(provider IN ('Airbnb','Booking')),
 calendar_url TEXT NOT NULL,
 url_hash TEXT UNIQUE NOT NULL,
 assigned_to INTEGER NOT NULL REFERENCES users(id),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 last_sync_at TIMESTAMPTZ,
 last_attempt_at TIMESTAMPTZ,
 last_error TEXT NOT NULL DEFAULT '',
 last_event_count INTEGER NOT NULL DEFAULT 0,
 last_conflict_count INTEGER NOT NULL DEFAULT 0,
 UNIQUE(property_id,provider)
);
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON calendar_connections FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON calendar_connections FROM authenticated; END IF;
END $$;
ALTER TABLE reservations ALTER COLUMN nightly DROP NOT NULL;
ALTER TABLE reservations ALTER COLUMN guests DROP NOT NULL;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS calendar_connection_id INTEGER REFERENCES calendar_connections(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_uid TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS calendar_event_kind TEXT NOT NULL DEFAULT 'reservation' CHECK(calendar_event_kind IN ('reservation','blocked'));
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS calendar_conflict BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS reservation_calendar_uid ON reservations(calendar_connection_id,external_uid);
CREATE INDEX IF NOT EXISTS calendar_connections_active ON calendar_connections(id) WHERE active=TRUE;
`;
