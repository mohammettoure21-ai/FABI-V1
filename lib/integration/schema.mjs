export const integrationSchema=`
CREATE TABLE IF NOT EXISTS integration_credentials (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
 scopes JSONB NOT NULL, property_ids JSONB, created_by INTEGER NOT NULL REFERENCES users(id),
 expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS integration_access_log (
 id BIGSERIAL PRIMARY KEY, credential_id INTEGER REFERENCES integration_credentials(id),
 operation TEXT NOT NULL, outcome TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS integration_log_recent ON integration_access_log(credential_id,at);
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_access_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON integration_credentials,integration_access_log FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON integration_credentials,integration_access_log FROM authenticated; END IF;
END $$;
`;
export const dashboardGrantSchema=`
CREATE TABLE IF NOT EXISTS integration_dashboard_grants (
 id UUID PRIMARY KEY, credential_id INTEGER NOT NULL REFERENCES integration_credentials(id), task TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '15 minutes',
 approved_by INTEGER REFERENCES users(id), approved_at TIMESTAMPTZ, redeemed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS integration_credential_id INTEGER REFERENCES integration_credentials(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS integration_grant_id UUID REFERENCES integration_dashboard_grants(id);
ALTER TABLE audit ADD COLUMN IF NOT EXISTS integration_credential_id INTEGER REFERENCES integration_credentials(id);
ALTER TABLE integration_dashboard_grants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON integration_dashboard_grants FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON integration_dashboard_grants FROM authenticated; END IF;
END $$;
`;
