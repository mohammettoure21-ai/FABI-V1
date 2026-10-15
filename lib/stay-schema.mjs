export const staySchema = `
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS agreed_total BIGINT CHECK(agreed_total>=0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS expected_commission BIGINT CHECK(expected_commission>=0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS local_dates_override BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS calendar_arrival DATE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS calendar_departure DATE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS local_reservation_override BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_reviewed_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS payment_received_at TIMESTAMPTZ;
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS reservation_id INTEGER REFERENCES reservations(id);
CREATE UNIQUE INDEX IF NOT EXISTS finance_stay_receipt ON finance_entries(reservation_id,kind) WHERE reservation_id IS NOT NULL;
UPDATE reservations SET calendar_arrival=arrival,calendar_departure=departure WHERE calendar_connection_id IS NOT NULL AND calendar_arrival IS NULL;
`;
