import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {recordActivity,deliverActivityEmails,activitySummary} from '../lib/activity-email.mjs';
test('Activité : tous les comptes actifs, confidentialité, transaction, reprises et concurrence',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role,active) VALUES('Admin','admin@example.test','test','admin',TRUE),('Employé','employee@example.test','test','employee',TRUE),('Inactif','inactive@example.test','test','employee',FALSE);`);
  await db.transaction(tx=>recordActivity(tx,1,'Création compte prive@example.test'));
  assert.equal((await db.query('SELECT count(*)::int n FROM activity_email_deliveries')).rows[0].n,2);
  assert.equal((await deliverActivityEmails(db,{env:{}})).configured,false);
  const env={GMAIL_USER:'fictif@gmail.com',GMAIL_APP_PASSWORD:'fake-not-a-secret'},sent=[];
  const sendMail=async mail=>{assert.doesNotMatch(mail.text,/prive@example.test|mot de passe/);sent.push(mail);return {accepted:[mail.to]};};
  await Promise.all([deliverActivityEmails(db,{env,sendMail}),deliverActivityEmails(db,{env,sendMail})]);
  assert.deepEqual(sent.map(m=>m.to).sort(),['admin@example.test','employee@example.test']);
  assert.ok(sent.every(m=>!m.cc&&!m.bcc));
  assert.match(sent.find(m=>m.to==='employee@example.test').text,/https:\/\/fabi-v1.vercel.app\/\n/);
  await deliverActivityEmails(db,{env,sendMail});assert.equal(sent.length,2);
  await assert.rejects(db.transaction(async tx=>{await recordActivity(tx,1,'Création client');throw new Error('rollback');}));
  assert.equal((await db.query('SELECT count(*)::int n FROM activity_email_deliveries')).rows[0].n,2);
  await db.transaction(tx=>recordActivity(tx,1,'Message envoyé #1'));await db.transaction(tx=>recordActivity(tx,1,'Connexion'));
  assert.equal((await db.query('SELECT count(*)::int n FROM activity_email_deliveries')).rows[0].n,2);
  await db.transaction(tx=>recordActivity(tx,1,'Création écriture financière 1'));
  await deliverActivityEmails(db,{env,limit:1,sendMail:async()=>{throw new Error('SMTP');}});
  assert.equal((await db.query("SELECT count(*)::int n FROM activity_email_deliveries WHERE status='failed'")).rows[0].n,1);
  await db.exec('UPDATE users SET active=FALSE WHERE id=2');
  await deliverActivityEmails(db,{env,sendMail});
  assert.equal((await db.query("SELECT count(*)::int n FROM activity_email_deliveries WHERE status='skipped'")).rows[0].n,1);
  assert.equal(sent.length,3);
  await db.exec("UPDATE activity_email_deliveries SET created_at=NOW()-INTERVAL '8 days'");
  await deliverActivityEmails(db,{env,sendMail});assert.equal((await db.query('SELECT count(*)::int n FROM activity_email_deliveries')).rows[0].n,0);
  assert.ok(activitySummary('Suppression client 3'));assert.equal(activitySummary('Journal interne privé'),null);
 }finally{await db.close();}
});
