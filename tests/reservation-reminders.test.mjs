import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {queueArrivalReminders,upcomingArrivals,dakarDate} from '../lib/reservation-reminders.mjs';
import {deliverActivityEmails} from '../lib/activity-email.mjs';
const now=new Date('2026-10-21T04:00:00Z');
const env={GMAIL_USER:'fictif@gmail.com',GMAIL_APP_PASSWORD:'fake-not-a-secret'};
async function fixture(){
 const db=new PGlite({extensions:{btree_gist}});await db.exec(schema);
 await db.exec(`INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('TEST','Appartement de test','Fictif','F2',1,40000,'Disponible');
 INSERT INTO users(name,email,password,role,active) VALUES('Admin','admin@example.test','test','admin',TRUE),('Employé','employee@example.test','test','employee',TRUE),('Responsable','manager@example.test','test','manager',TRUE),('Inactif','inactive@example.test','test','employee',FALSE);
 INSERT INTO users(name,email,password,role,owner_property_id) VALUES('Propriétaire','owner@example.test','test','owner',1);`);
 return db;
}
async function booking(db,arrival,status='Confirmée',kind='reservation'){
 return (await db.query(`INSERT INTO reservations(arrival,departure,status,source,assigned_to,calendar_event_kind,property_label,guest_label,agreed_total) VALUES($1::date,$1::date+1,$2,'Direct',1,$3,'Appartement de test','Voyageur privé',123456) RETURNING id`,[arrival,status,kind])).rows[0].id;
}
test('Rappels J−2 : tous les employés/encadrants actifs, blocages exclus, dédoublonnage et rollback',async()=>{
 const db=await fixture();
 try{
  assert.equal(dakarDate(new Date('2026-10-20T23:30:00-02:00')),'2026-10-21');
  await booking(db,'2026-10-23');await booking(db,'2026-10-22');await booking(db,'2026-10-21');
  await booking(db,'2026-10-24');await booking(db,'2026-10-20');await booking(db,'2026-10-23','En attente');await booking(db,'2026-10-23','Annulée');await booking(db,'2026-10-23','Confirmée','blocked');
  assert.equal((await upcomingArrivals(db,now)).length,3);
  await assert.rejects(db.transaction(async tx=>{await queueArrivalReminders(tx,now);throw new Error('rollback');}));
  assert.equal((await db.query('SELECT count(*)::int n FROM reservation_reminders')).rows[0].n,0);
  assert.deepEqual(await db.transaction(tx=>queueArrivalReminders(tx,now)),{queued:3});
  assert.deepEqual(await db.transaction(tx=>queueArrivalReminders(tx,now)),{queued:0});
  assert.equal((await db.query('SELECT count(*)::int n FROM activity_email_deliveries')).rows[0].n,9);
  assert.equal((await deliverActivityEmails(db,{env:{},now})).configured,false);
  const sent=[],sendMail=async mail=>{sent.push(mail);return {accepted:[mail.to]};};
  await Promise.all([deliverActivityEmails(db,{env,sendMail,now}),deliverActivityEmails(db,{env,sendMail,now})]);
  assert.equal(sent.length,9);
  assert.deepEqual([...new Set(sent.map(m=>m.to))].sort(),['admin@example.test','employee@example.test','manager@example.test']);
  assert.ok(sent.every(m=>m.subject.includes('Arrivée à préparer')&&m.text.includes('Appartement de test')));
  assert.ok(sent.every(m=>!m.cc&&!m.bcc&&!/Voyageur privé|123456/.test(m.text)));
  await deliverActivityEmails(db,{env,sendMail,now});assert.equal(sent.length,9);
  // Delivery metadata retention must not recreate a reminder.
  await db.exec("DELETE FROM activity_email_deliveries");
  assert.deepEqual(await db.transaction(tx=>queueArrivalReminders(tx,now)),{queued:0});
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
 }finally{await db.close();}
});
test('Rappels J−2 : annulation/déplacement avant envoi, nouvelle date, comptes désactivés et reprise SMTP',async()=>{
 const db=await fixture();
 try{
  const cancelled=await booking(db,'2026-10-23'),moved=await booking(db,'2026-10-23');
  await db.transaction(tx=>queueArrivalReminders(tx,now));
  await db.query("UPDATE reservations SET status='Annulée' WHERE id=$1",[cancelled]);
  await db.query("UPDATE reservations SET arrival='2026-10-24',departure='2026-10-25' WHERE id=$1",[moved]);
  const sent=[],sendMail=async mail=>{sent.push(mail);return {accepted:[mail.to]};};
  await deliverActivityEmails(db,{env,sendMail,now});assert.equal(sent.length,0);
  assert.equal((await db.query("SELECT count(*)::int n FROM activity_email_deliveries WHERE status='skipped'")).rows[0].n,6);
  const tomorrow=new Date('2026-10-22T04:00:00Z');
  assert.deepEqual(await db.transaction(tx=>queueArrivalReminders(tx,tomorrow)),{queued:1});
  await db.exec("UPDATE users SET active=FALSE WHERE role='employee'");
  await deliverActivityEmails(db,{env,now:tomorrow,limit:1,sendMail:async()=>{throw new Error('SMTP');}});
  await deliverActivityEmails(db,{env,now:tomorrow,sendMail});
  assert.deepEqual(sent.map(m=>m.to).sort(),['admin@example.test','manager@example.test']);
  assert.ok(sent.every(m=>m.text.includes('24/10/2026')));
  // Old queued mail is not sent after the arrival has passed.
  await db.exec("UPDATE activity_email_deliveries SET status='pending',attempts=0");
  await deliverActivityEmails(db,{env,now:new Date('2026-10-25T04:00:00Z'),sendMail});
  assert.equal(sent.length,2);
 }finally{await db.close();}
});
