export const propertySchema = `
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS managed_by_fabi BOOLEAN NOT NULL DEFAULT FALSE;
`;
