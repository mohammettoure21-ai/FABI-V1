// Notification metadata only. Does not edit messages, accounts or finances.
export const notificationSchema=`
DO $$ BEGIN
 IF to_regclass('public.team_messages') IS NOT NULL THEN
  ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS email_paused BOOLEAN NOT NULL DEFAULT FALSE;
 END IF;
 IF to_regclass('public.team_message_observers') IS NOT NULL THEN
  ALTER TABLE team_message_observers ADD COLUMN IF NOT EXISTS email_paused BOOLEAN NOT NULL DEFAULT FALSE;
 END IF;
END $$;
`;
