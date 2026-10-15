import {staySchema} from './stay-schema.mjs';
import {calendarSchema} from './calendar-schema.mjs';
import {operationsSchema} from './operations-schema.mjs';
import {financeSchema} from './finance-schema.mjs';
export const schema = `
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','employee')), active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, expires TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (id SERIAL PRIMARY KEY, email TEXT NOT NULL, at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS attempts_email ON login_attempts(email,at);
CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('Nouveau','Contacté','Qualifié','Devis envoyé','Confirmé','Perdu')), notes TEXT NOT NULL DEFAULT '', assigned_to INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS properties (id SERIAL PRIMARY KEY, reference TEXT UNIQUE NOT NULL, name TEXT NOT NULL, neighborhood TEXT NOT NULL, category TEXT NOT NULL, bedrooms INTEGER NOT NULL CHECK(bedrooms>=0), nightly INTEGER NOT NULL CHECK(nightly>=0), status TEXT NOT NULL CHECK(status IN ('Disponible','Maintenance','Inactive')));
CREATE TABLE IF NOT EXISTS reservations (id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), property_id INTEGER NOT NULL REFERENCES properties(id), arrival DATE NOT NULL, departure DATE NOT NULL, guests INTEGER NOT NULL CHECK(guests>0), nightly INTEGER NOT NULL CHECK(nightly>=0), status TEXT NOT NULL CHECK(status IN ('En attente','Confirmée','Annulée')), source TEXT NOT NULL CHECK(source IN ('Direct','Airbnb','Booking','Autre')), assigned_to INTEGER NOT NULL REFERENCES users(id), CHECK(departure>arrival), CONSTRAINT no_overlap EXCLUDE USING gist (property_id WITH =, daterange(arrival,departure,'[)') WITH &&) WHERE (status='Confirmée'));
CREATE TABLE IF NOT EXISTS audit (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), action TEXT NOT NULL, at TIMESTAMPTZ DEFAULT NOW());

-- These tables are used only by the trusted server, never by the public Data API.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON users,sessions,login_attempts,clients,properties,reservations,audit FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON users,sessions,login_attempts,clients,properties,reservations,audit FROM authenticated;
  END IF;
END $$;
` + financeSchema + operationsSchema + calendarSchema + staySchema;

