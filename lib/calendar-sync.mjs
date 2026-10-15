import {query,transaction} from './db.mjs';
import {downloadCalendar} from './ical.mjs';

export async function applyCalendarSnapshot(db,connection,events,today=new Date().toISOString().slice(0,10)) {
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['calendar-property-'+connection.property_id]);
 const latest=await db.query('SELECT id,url_hash,active FROM calendar_connections WHERE id=$1 FOR UPDATE',[connection.id]);
 if(!latest.rows[0]?.active||latest.rows[0].url_hash!==connection.url_hash)throw new Error('CALENDAR_CHANGED');
 await db.query("UPDATE reservations SET status='En attente',calendar_conflict=FALSE WHERE calendar_connection_id=$1 AND departure>=$2::date AND status='Confirmée'",[connection.id,today]);
 let conflicts=0,imported=0;
 for(const event of events) {
  if(event.cancelled){await db.query("UPDATE reservations SET status='Annulée',calendar_conflict=FALSE WHERE calendar_connection_id=$1 AND external_uid=$2",[connection.id,event.uid]);continue;}
  const local=(await db.query('SELECT arrival,departure,local_dates_override FROM reservations WHERE calendar_connection_id=$1 AND external_uid=$2',[connection.id,event.uid])).rows[0];
  const effectiveArrival=local?.local_dates_override?local.arrival:event.arrival,effectiveDeparture=local?.local_dates_override?local.departure:event.departure;
  const values=[connection.property_id,effectiveArrival,effectiveDeparture,connection.provider,connection.assigned_to,event.title||(event.kind==='blocked'?'Dates indisponibles':'Réservation '+connection.provider),connection.id,event.uid,event.kind];
  const sql=`INSERT INTO reservations(property_id,arrival,departure,guests,nightly,status,source,assigned_to,guest_label,calendar_connection_id,external_uid,calendar_event_kind,calendar_conflict,calendar_arrival,calendar_departure)
   VALUES($1,$2,$3,NULL,NULL,$10,$4,$5,$6,$7,$8,$9,$11,$12,$13)
   ON CONFLICT(calendar_connection_id,external_uid) DO UPDATE SET arrival=EXCLUDED.arrival,departure=EXCLUDED.departure,status=EXCLUDED.status,guest_label=EXCLUDED.guest_label,calendar_event_kind=EXCLUDED.calendar_event_kind,calendar_conflict=EXCLUDED.calendar_conflict,calendar_arrival=EXCLUDED.calendar_arrival,calendar_departure=EXCLUDED.calendar_departure`;
  await db.query('SAVEPOINT calendar_event');
  try{await db.query(sql,[...values,'Confirmée',false,event.arrival,event.departure]);await db.query('RELEASE SAVEPOINT calendar_event');}
  catch(error){await db.query('ROLLBACK TO SAVEPOINT calendar_event');await db.query('RELEASE SAVEPOINT calendar_event');if(error.code!=='23P01')throw error;await db.query(sql,[...values,'En attente',true,event.arrival,event.departure]);conflicts++;}
  imported++;
 }
 // A complete, valid feed is authoritative only for upcoming events from this connection.
 await db.query("UPDATE reservations SET status='Annulée',calendar_conflict=FALSE WHERE calendar_connection_id=$1 AND departure>=$3::date AND NOT(external_uid=ANY($2::text[])) AND status<>'Annulée'",[connection.id,events.map(e=>e.uid),today]);
 await db.query("UPDATE calendar_connections SET last_sync_at=NOW(),last_attempt_at=NOW(),last_error='',last_event_count=$2,last_conflict_count=$3 WHERE id=$1",[connection.id,imported,conflicts]);
 await db.query('INSERT INTO audit(action) VALUES($1)',['Synchronisation calendrier '+connection.id+' : '+imported+' événements, '+conflicts+' chevauchements à vérifier']);
 return {imported,conflicts};
}

export async function syncCalendar(id) {
 const {rows}=await query('SELECT * FROM calendar_connections WHERE id=$1 AND active=TRUE',[id]);
 const connection=rows[0];if(!connection)return {ok:false,message:'Connexion désactivée ou introuvable.'};
 try {
  const events=await downloadCalendar(connection.calendar_url,connection.provider);
  const result=await transaction(db=>applyCalendarSnapshot(db,connection,events));
  return {ok:true,...result};
 }catch(error){
  // Never persist URLs, remote response bodies, SQL errors or traveler details in error messages.
  const messages=['Lien calendrier invalide.','Utilisez un lien calendrier HTTPS officiel.','Collez le lien d’export iCal Airbnb ou Booking, pas l’adresse de l’annonce.','Calendrier inaccessible ou trop lent. Réessayez plus tard.','Le lien calendrier ne répond pas. Vérifiez son export sur la plateforme.','Réponse non reconnue comme calendrier iCal complet.','Ce calendrier doit fournir des dates de séjour à la journée.','Les événements récurrents ne sont pas pris en charge pour ce calendrier.'];
  const message=messages.includes(error.message)?error.message:'Synchronisation impossible : aucune modification de ce calendrier n’a été conservée.';
  await query('UPDATE calendar_connections SET last_attempt_at=NOW(),last_error=$2 WHERE id=$1',[id,message]);
  console.error('FABI_CALENDAR_SYNC_FAILED',id,error.code==='23P01'?'OVERLAP':'SYNC_FAILED');
  return {ok:false,message};
 }
}
