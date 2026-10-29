import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {recordActivity,deliverActivityEmails} from '../lib/activity-email.mjs';
import {insertMessages,unreadMessageCount,employeeThread} from '../lib/messages.mjs';
import {deliverPendingMessageEmails,notifyMessageEmail,notifyObserverEmail} from '../lib/message-email.mjs';
import {queueArrivalReminders} from '../lib/reservation-reminders.mjs';
import {migrateIntegration} from '../lib/integration/migrate.mjs';
const env={GMAIL_USER:'fictif@gmail.com',GMAIL_APP_PASSWORD:'fake-only'},now=new Date('2026-10-21T04:00:00Z');
async function fixture(){
 const db=new PGlite({extensions:{btree_gist}});await db.exec(schema);
 await db.exec(`INSERT INTO users(name,email,password,role) VALUES('Fondateur','founder@example.test','fake','admin'),('Employé','employee@example.test','fake','employee'),('Responsable','manager@example.test','fake','manager'),('Autre administrateur','other-admin@example.test','fake','admin');
 INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('FAKE','Appartement fictif','Fictif','F2',1,0,'Disponible');
 INSERT INTO users(name,email,password,role,owner_property_id) VALUES('Propriétaire','owner@example.test','fake','owner',1);`);
 return db;
}
const send=(db,id,role,recipient,body)=>db.transaction(tx=>insertMessages(tx,{id,role},{recipients:[recipient]},body,randomUUID()));
const mailSink=sent=>async mail=>{sent.push(mail);return {accepted:[mail.to]};};

test('Pause par défaut : activités, finances et rappels J−2 uniquement au fondateur, anciennes files comprises',async()=>{
 const db=await fixture();try{
  await db.transaction(tx=>recordActivity(tx,2,'Création réservation'));
  await db.transaction(tx=>recordActivity(tx,1,'Création écriture financière 123'));
  await db.exec("INSERT INTO reservations(arrival,departure,status,source,assigned_to,calendar_event_kind,property_label) VALUES('2026-10-23','2026-10-25','Confirmée','Direct',1,'reservation','Appartement fictif')");
  await db.transaction(tx=>queueArrivalReminders(tx,now));
  assert.equal((await db.query("SELECT count(*)::int n FROM activity_email_deliveries WHERE recipient_id<>1 AND status='pending'")).rows[0].n,0);
  // Simulate a queue produced by an older deployment before the pause.
  await db.exec("UPDATE activity_email_deliveries SET status='pending' WHERE recipient_id<>1");
  const reservation=JSON.stringify((await db.query('SELECT * FROM reservations')).rows);
  const sent=[];await deliverActivityEmails(db,{env,sendMail:mailSink(sent),now});
  assert.equal(sent.length,3);assert.ok(sent.every(mail=>mail.to==='founder@example.test'&&!mail.cc&&!mail.bcc));
  assert.equal(sent.filter(mail=>mail.subject.includes('Arrivée à préparer')).length,1);
  assert.equal((await db.query("SELECT count(*)::int n FROM activity_email_deliveries WHERE recipient_id<>1 AND status IN ('pending','failed','sent')")).rows[0].n,0);
  await deliverActivityEmails(db,{env:{...env,FABI_TEAM_EMAILS_ENABLED:'true'},sendMail:mailSink(sent),now});assert.equal(sent.length,3,'Aucune rafale des e-mails suspendus après reprise');
  assert.equal(JSON.stringify((await db.query('SELECT * FROM reservations')).rows),reservation);assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
 }finally{await db.close();}
});
test('Pause messages : destinataires et suivi conservés, e-mails directs et copies uniquement au fondateur',async()=>{
 const db=await fixture();try{
  const incoming=(await send(db,2,'employee',1,'Demande privée'))[0].id;
  const outgoing=(await send(db,1,'admin',2,'Réponse privée'))[0].id;
  const observed=(await send(db,2,'employee',3,'Question responsable'))[0].id;
  await send(db,3,'manager',4,'Discussion privée entre autres encadrants');
  await send(db,1,'admin',5,'Message au propriétaire');
  assert.equal((await db.query('SELECT email_paused FROM team_messages WHERE id=$1',[outgoing])).rows[0].email_paused,true);
  // Old queued messages must be blocked too, including manual retries.
  await db.exec('UPDATE team_messages SET email_paused=FALSE; UPDATE team_message_observers SET email_paused=FALSE');
  const unread=await unreadMessageCount(db,{id:3,role:'manager'});
  const original=JSON.stringify((await db.query('SELECT id,sender_id,recipient_id,body,read_at FROM team_messages ORDER BY id')).rows);
  const sent=[];
  await deliverPendingMessageEmails(db,{env,sendMail:mailSink(sent)});
  assert.equal(sent.length,2);assert.ok(sent.every(mail=>mail.to==='founder@example.test'));
  assert.ok(sent.some(mail=>mail.text.includes('/messages?employee=2&peer=3')));
  assert.ok(sent.every(mail=>!mail.text.includes('Demande privée')&&!mail.text.includes('Discussion privée')));
  const direct=(await db.query('SELECT email_paused,email_attempts FROM team_messages WHERE id=$1',[outgoing])).rows[0];assert.equal(direct.email_paused,true);assert.equal(direct.email_attempts,0);
  assert.equal((await db.query('SELECT email_paused FROM team_message_observers WHERE message_id=$1 AND user_id=3',[incoming])).rows[0].email_paused,true);
  await notifyMessageEmail(db,outgoing,1,{env,sendMail:mailSink(sent)});await notifyObserverEmail(db,incoming,3,{env,sendMail:mailSink(sent)});assert.equal(sent.length,2,'Une relance manuelle ne contourne pas la pause');
  assert.equal(await unreadMessageCount(db,{id:3,role:'manager'}),unread);
  assert.equal(JSON.stringify((await db.query('SELECT id,sender_id,recipient_id,body,read_at FROM team_messages ORDER BY id')).rows),original);
  assert.ok(await employeeThread(db,{id:3,role:'manager'},2,1));
  await deliverPendingMessageEmails(db,{env:{...env,FABI_TEAM_EMAILS_ENABLED:'true'},sendMail:mailSink(sent)});assert.equal(sent.length,2);
  await db.transaction(tx=>insertMessages(tx,{id:1,role:'admin'},{recipients:[2]},'Nouvelle notification après reprise explicite',randomUUID(),{env:{FABI_TEAM_EMAILS_ENABLED:'true'}}));
  await deliverPendingMessageEmails(db,{env:{...env,FABI_TEAM_EMAILS_ENABLED:'true'},sendMail:mailSink(sent)});assert.ok(sent.some(mail=>mail.to==='employee@example.test'));
  assert.equal((await db.query('SELECT email_paused FROM team_messages WHERE id=$1',[outgoing])).rows[0].email_paused,true);
  assert.equal((await db.query('SELECT email_paused FROM team_message_observers WHERE message_id=$1 AND user_id=1',[observed])).rows[0].email_paused,false);
 }finally{await db.close();}
});
test('Pause : bloque aussi sans Gmail, sans bascule vers un autre admin et respecte l’historique SMTP',async()=>{
 const db=await fixture();try{
  const m=(await send(db,1,'admin',2,'Attente ancienne'))[0].id;
  await db.transaction(tx=>recordActivity(tx,2,'Création client'));
  await deliverPendingMessageEmails(db,{env:{}});await deliverActivityEmails(db,{env:{}});
  assert.equal((await db.query('SELECT email_paused FROM team_messages WHERE id=$1',[m])).rows[0].email_paused,true);
  await send(db,1,'admin',3,'Déjà transmis');await send(db,1,'admin',4,'Envoi incertain');
  await db.exec("UPDATE team_messages SET email_status=CASE WHEN recipient_id=3 THEN 'sent' ELSE 'sending' END WHERE recipient_id IN (3,4)");
  const prior=JSON.stringify((await db.query('SELECT id,email_status,email_paused FROM team_messages WHERE recipient_id IN (3,4) ORDER BY id')).rows);
  await db.exec('UPDATE users SET active=FALSE WHERE id=1');
  await send(db,2,'employee',3,'Pas de remplaçant automatique');
  await db.transaction(tx=>recordActivity(tx,2,'Création appartement'));
  const sent=[];await deliverActivityEmails(db,{env,sendMail:mailSink(sent)});await deliverPendingMessageEmails(db,{env,sendMail:mailSink(sent)});assert.equal(sent.length,0);
  assert.equal(JSON.stringify((await db.query('SELECT id,email_status,email_paused FROM team_messages WHERE body IN (\'Déjà transmis\',\'Envoi incertain\') ORDER BY id')).rows),prior);
 }finally{await db.close();}
});
test('Migration pause : métadonnées seules et migration répétable, sans édition de messages ni finances',async()=>{
 const db=await fixture();try{
  await send(db,1,'admin',2,'Message conservé');
  await db.exec("INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,description,amount,source_sheet,activity) VALUES(1,'depense',2026,1,'Original conservé',9900,'Original fictif','Autre'); ALTER TABLE team_messages DROP COLUMN email_paused; ALTER TABLE team_message_observers DROP COLUMN email_paused");
  const before=JSON.stringify((await db.query('SELECT * FROM finance_entries')).rows),messages=JSON.stringify((await db.query('SELECT id,body,read_at FROM team_messages')).rows);
  await db.transaction(migrateIntegration);await db.transaction(migrateIntegration);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM finance_entries')).rows),before);assert.equal(JSON.stringify((await db.query('SELECT id,body,read_at FROM team_messages')).rows),messages);
  assert.equal((await db.query('SELECT email_paused FROM team_messages')).rows[0].email_paused,true);
 }finally{await db.close();}
});
