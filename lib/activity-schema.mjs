export const activitySchema=`
CREATE TABLE IF NOT EXISTS activity_email_deliveries (
 id SERIAL PRIMARY KEY,
 audit_id INTEGER NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
 recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','skipped')),
 attempts INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(audit_id,recipient_id)
);
CREATE INDEX IF NOT EXISTS activity_email_pending ON activity_email_deliveries(id) WHERE status IN ('pending','failed');
ALTER TABLE activity_email_deliveries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON activity_email_deliveries FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON activity_email_deliveries FROM authenticated; END IF;
END $$;
`;
