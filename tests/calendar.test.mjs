import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {parseICalendar,validateCalendarUrl,downloadCalendar} from '../lib/ical.mjs';
import {applyCalendarSnapshot} from '../lib/calendar-sync.mjs';
const feed=events=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+events.join('\r\n')+'\r\nEND:VCALENDAR';
const event=(uid,start,end,summary='Reserved')=>`BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nSUMMARY:${summary}\r\nEND:VEVENT`;

test('iCal : dates exclusives, texte replié, indisponibilités et rejets des flux incomplets',()=>{
 const parsed=parseICalendar(feed([event('a','20261101','20261104','Réservation\\, test\r\n  fictif'),event('b','20261105','20261107','Airbnb (Not available)')]));
 assert.equal(parsed[0].arrival,'2026-11-01');assert.equal(parsed[0].departure,'2026-11-04');assert.equal(parsed[0].title,'Réservation, test fictif');assert.equal(parsed[1].kind,'blocked');
 assert.deepEqual(parseICalendar(feed([])),[]);
 for(const invalid of ['<html>Login</html>',feed([event('a','20260230','20260301')]),feed([event('a','20261101','20261104'),event('a','20261107','20261109')]),feed([event('a','20261101','20261104').replace('SUMMARY:Reserved','RRULE:FREQ=DAILY')]),feed([event('a','20261101T100000Z','20261104T100000Z')])])assert.throws(()=>parseICalendar(invalid));
});

test('Seuls les liens HTTPS d’export officiels sont acceptés, y compris après redirection',async()=>{
 assert.ok(validateCalendarUrl('https://www.airbnb.fr/calendar/ical/123.ics?s=fictif','Airbnb'));
 assert.ok(validateCalendarUrl('https://admin.booking.com/hotel/hoteladmin/ical.html?t=fictif','Booking'));
 assert.ok(validateCalendarUrl('https://ical.booking.com/v1/export?t=fictif','Booking'));
 for(const url of ['http://www.airbnb.com/calendar/ical/1.ics','https://127.0.0.1/calendar/ical/1.ics','https://www.airbnb.com.evil.test/calendar/ical/a','https://user:password@www.airbnb.com/calendar/ical/a','https://www.airbnb.com:444/calendar/ical/a','https://www.airbnb.com/rooms/123'])assert.throws(()=>validateCalendarUrl(url,'Airbnb'));
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://169.254.169.254/calendar/ical/a'}});};await assert.rejects(downloadCalendar('https://www.airbnb.com/calendar/ical/test.ics','Airbnb'));assert.equal(calls,1);}
 finally{globalThis.fetch=original;}
});

test('Import : dédoublonnage, dates modifiées, annulations et conflits ; aucune recette inventée',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role) VALUES('Test','calendar@example.test','test','admin');
   INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('TEST','Test','Test','F2',1,40000,'Disponible');
   INSERT INTO calendar_connections(property_id,provider,calendar_url,url_hash,assigned_to) VALUES(1,'Airbnb','https://www.airbnb.com/calendar/ical/test.ics','fictif',1);
   INSERT INTO reservations(property_id,arrival,departure,guests,nightly,status,source,assigned_to) VALUES(1,'2026-11-15','2026-11-17',2,40000,'Confirmée','Direct',1);`);
  const connection=(await db.query('SELECT * FROM calendar_connections')).rows[0];
  const sync=async events=>{await db.exec('BEGIN');try{const result=await applyCalendarSnapshot(db,connection,parseICalendar(feed(events)),'2026-10-15');await db.exec('COMMIT');return result;}catch(error){await db.exec('ROLLBACK');throw error;}};
  await sync([event('a','20261101','20261104')]);await sync([event('a','20261101','20261104')]);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit WHERE action LIKE 'Mise à jour des séjours par calendrier %'")).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n,2);
  let imported=(await db.query("SELECT * FROM reservations WHERE external_uid='a'")).rows[0];assert.equal(imported.nightly,null);assert.equal(imported.guests,null);
  await db.exec("UPDATE reservations SET agreed_total=100000,expected_commission=10000,arrival='2026-11-02',departure='2026-11-05',local_dates_override=TRUE WHERE external_uid='a'");
  await sync([event('a','20261101','20261104')]);
  const edited=(await db.query("SELECT * FROM reservations WHERE external_uid='a'")).rows[0];
  assert.equal(new Date(edited.arrival).toISOString().slice(0,10),'2026-11-02');assert.equal(Number(edited.agreed_total),100000);assert.equal(new Date(edited.calendar_arrival).toISOString().slice(0,10),'2026-11-01');
  await db.exec("UPDATE reservations SET local_dates_override=FALSE WHERE external_uid='a'");
  const result=await sync([event('a','20261102','20261105'),event('b','20261116','20261118')]);
  assert.equal(result.conflicts,1);
  assert.equal((await db.query("SELECT status FROM reservations WHERE external_uid='b'")).rows[0].status,'En attente');
  assert.equal((await db.query('SELECT status FROM reservations WHERE id=1')).rows[0].status,'Confirmée');
  await sync([event('a','20261103','20261106'),event('c','20261108','20261110','Not available')]);
  assert.equal((await db.query("SELECT status FROM reservations WHERE external_uid='b'")).rows[0].status,'Annulée');
  assert.equal((await db.query("SELECT calendar_event_kind FROM reservations WHERE external_uid='c'")).rows[0].calendar_event_kind,'blocked');
  await db.exec("UPDATE reservations SET local_reservation_override=TRUE,calendar_event_kind='reservation',agreed_total=80000 WHERE external_uid='c'");
  await sync([event('a','20261103','20261106'),event('c','20261108','20261110','Not available')]);
  const converted=(await db.query("SELECT calendar_event_kind,agreed_total FROM reservations WHERE external_uid='c'")).rows[0];
  assert.equal(converted.calendar_event_kind,'reservation');assert.equal(Number(converted.agreed_total),80000);
  await db.exec("UPDATE reservations SET local_reservation_override=FALSE,calendar_event_kind='blocked',agreed_total=NULL WHERE external_uid='c'");
  // Advisory platform blocks never prevent manual bookings, in either sync order.
  await db.exec("INSERT INTO reservations(property_id,arrival,departure,guests,nightly,status,source,assigned_to) VALUES(1,'2026-11-08','2026-11-10',2,40000,'Confirmée','Direct',1)");
  assert.equal((await sync([event('a','20261103','20261106'),event('c','20261108','20261110','Not available')])).conflicts,0);
  assert.equal((await db.query("SELECT status FROM reservations WHERE external_uid='c'")).rows[0].status,'Confirmée');
  await assert.rejects(db.exec("INSERT INTO reservations(property_id,arrival,departure,guests,nightly,status,source,assigned_to) VALUES(1,'2026-11-08','2026-11-09',2,40000,'Confirmée','Direct',1)"),error=>error.code==='23P01');
  await db.exec("DELETE FROM reservations WHERE source='Direct' AND arrival='2026-11-08'");
  // Swapping dates within one source must not create conflicts against its own old snapshot.
  assert.equal((await sync([event('a','20261108','20261110'),event('c','20261103','20261106','Not available')])).conflicts,0);
  await sync([]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM reservations WHERE calendar_connection_id=1 AND status<>'Annulée'")).rows[0].n,0);
  assert.equal((await db.query('SELECT status FROM reservations WHERE id=1')).rows[0].status,'Confirmée');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,0);
  assert.ok((await db.query('SELECT last_sync_at FROM calendar_connections')).rows[0].last_sync_at);
 }finally{await db.close();}
});
