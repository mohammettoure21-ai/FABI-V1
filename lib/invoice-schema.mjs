// Private PDF archive only: no change to the accounting ledgers or balances.
export const invoiceSchema=`
CREATE TABLE IF NOT EXISTS invoice_documents (
 id SERIAL PRIMARY KEY,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 reference TEXT NOT NULL DEFAULT '',
 issued_on DATE,
 property_id INTEGER REFERENCES properties(id),
 client_id INTEGER REFERENCES clients(id),
 notes TEXT NOT NULL DEFAULT '',
 filename TEXT NOT NULL,
 pdf BYTEA NOT NULL CHECK(octet_length(pdf) BETWEEN 1 AND 2097152),
 sha256 TEXT NOT NULL UNIQUE,
 size_bytes INTEGER NOT NULL CHECK(size_bytes=octet_length(pdf)),
 created_by INTEGER NOT NULL REFERENCES users(id),
 integration_credential_id INTEGER REFERENCES integration_credentials(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invoice_documents_recent ON invoice_documents(created_at DESC,id DESC);
ALTER TABLE invoice_documents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON invoice_documents FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON invoice_documents FROM authenticated; END IF;
END $$;
`;
