import {dakarDate} from './reminder-format.mjs';
export {dakarDate} from './reminder-format.mjs';
import {recordActivity} from './activity-email.mjs';
export const reservationReminderSchema=`
CREATE TABLE IF NOT EXISTS reservation_reminders (
 id SERIAL PRIMARY KEY,
 reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
 arrival DATE NOT NULL,
 audit_id INTEGER REFERENCES audit(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(reservation_id,arrival)
);
ALTER TABLE reservation_reminders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON reservation_reminders FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON reservation_reminders FROM authenticated; END IF;
END $$;
`;
export function reminderAction(reservationId,arrival){return `Rappel arrivée J-2 · séjour ${reservationId} · arrivée ${arrival}`;}
// Transaction required: marker, audit event and recipient deliveries commit together.
export async function queueArrivalReminders(db,now=new Date(),{env=process.env}={}){
 const today=dakarDate(now);
 await db.query("SELECT pg_advisory_xact_lock(hashtext('fabi-arrival-reminders'))");
 const {rows}=await db.query(`SELECT id,arrival::text FROM reservations WHERE status='Confirmée' AND calendar_event_kind='reservation'
  AND arrival BETWEEN $1::date AND $1::date+2 ORDER BY arrival,id FOR SHARE`,[today]);
 let queued=0;
 for(const stay of rows){
  const added=await db.query('INSERT INTO reservation_reminders(reservation_id,arrival) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id',[stay.id,stay.arrival]);
  if(!added.rows.length)continue;
  const auditId=await recordActivity(db,null,reminderAction(stay.id,stay.arrival),{env});
  await db.query('UPDATE reservation_reminders SET audit_id=$1 WHERE id=$2',[auditId,added.rows[0].id]);queued++;
 }
 return {queued};
}
export async function upcomingArrivals(db,now=new Date()){
 const {rows}=await db.query(`SELECT r.id,r.arrival::text,p.name AS property_name,r.property_label FROM reservations r LEFT JOIN properties p ON p.id=r.property_id
 WHERE r.status='Confirmée' AND r.calendar_event_kind='reservation' AND r.arrival BETWEEN $1::date AND $1::date+2 ORDER BY r.arrival,r.id`,[dakarDate(now)]);
 return rows;
}
