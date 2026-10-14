export const financeSchema = `
ALTER TABLE properties ALTER COLUMN bedrooms DROP NOT NULL;
ALTER TABLE properties ALTER COLUMN nightly DROP NOT NULL;
CREATE TABLE IF NOT EXISTS finance_imports (
 id SERIAL PRIMARY KEY,
 fingerprint TEXT UNIQUE NOT NULL,
 filename TEXT NOT NULL,
 reporting_year INTEGER NOT NULL CHECK(reporting_year BETWEEN 2000 AND 2200),
 source_data JSONB NOT NULL,
 notes JSONB NOT NULL DEFAULT '[]',
 imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS finance_entries (
 id SERIAL PRIMARY KEY,
 import_id INTEGER NOT NULL REFERENCES finance_imports(id),
 property_id INTEGER REFERENCES properties(id),
 company TEXT NOT NULL DEFAULT 'FABI Conciergerie',
 kind TEXT NOT NULL CHECK(kind IN ('recette','depense','commission','loyer')),
 reporting_year INTEGER NOT NULL CHECK(reporting_year BETWEEN 2000 AND 2200),
 reporting_month INTEGER NOT NULL CHECK(reporting_month BETWEEN 1 AND 12),
 original_date TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT '',
 amount BIGINT NOT NULL CHECK(amount > 0),
 comment TEXT NOT NULL DEFAULT '',
 warnings JSONB NOT NULL DEFAULT '[]',
 source_sheet TEXT NOT NULL,
 source_row INTEGER NOT NULL CHECK(source_row > 0),
 UNIQUE(import_id,source_sheet,source_row,kind)
);
CREATE INDEX IF NOT EXISTS finance_entries_period ON finance_entries(reporting_year,reporting_month);
CREATE TABLE IF NOT EXISTS property_monthly_rents (
 property_id INTEGER PRIMARY KEY REFERENCES properties(id),
 amount BIGINT NOT NULL CHECK(amount >= 0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE finance_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_monthly_rents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON finance_imports,finance_entries,property_monthly_rents FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON finance_imports,finance_entries,property_monthly_rents FROM authenticated;
 END IF;
END $$;
`;
