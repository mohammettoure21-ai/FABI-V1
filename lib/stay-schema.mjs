export const staySchema = `
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS agreed_total BIGINT CHECK(agreed_total>=0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS expected_commission BIGINT CHECK(expected_commission>=0);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS local_dates_override BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS calendar_arrival DATE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS calendar_departure DATE;
UPDATE reservations SET calendar_arrival=arrival,calendar_departure=departure WHERE calendar_connection_id IS NOT NULL AND calendar_arrival IS NULL;
`;
