export const messageSchema=`
CREATE TABLE IF NOT EXISTS team_messages (
 id SERIAL PRIMARY KEY,
 sender_id INTEGER NOT NULL REFERENCES users(id),
 recipient_id INTEGER NOT NULL REFERENCES users(id),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 request_key UUID UNIQUE NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 read_at TIMESTAMPTZ,
 CHECK(sender_id<>recipient_id)
);
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'not_requested' CHECK(email_status IN ('not_requested','not_configured','sending','sent','failed'));
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS dispatch_key UUID;
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS is_supervision BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS email_attempts INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS team_messages_dispatch_recipient ON team_messages(dispatch_key,recipient_id) WHERE dispatch_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS team_messages_inbox ON team_messages(recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS team_messages_pair ON team_messages(LEAST(sender_id,recipient_id),GREATEST(sender_id,recipient_id),created_at DESC);
ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON team_messages FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON team_messages FROM authenticated; END IF;
END $$;
`;
