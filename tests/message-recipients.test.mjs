import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {insertMessages} from '../lib/messages.mjs';
import {deliverPendingMessageEmails} from '../lib/message-email.mjs';

test('Destinataires multiples : tous rôles, équipe active, copies de suivi, atomicité et doublons',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role,active) VALUES
   ('Admin','admin@example.test','test','admin',TRUE),
   ('Responsable','manager@example.test','test','manager',TRUE),
   ('Employé A','a@example.test','test','employee',TRUE),
   ('Employé B','b@example.test','test','employee',TRUE),
   ('Inactif','inactive@example.test','test','employee',FALSE),
   ('Non choisi','other@example.test','test','employee',TRUE);`);
  const send=(user,audience,body,key=randomUUID())=>db.transaction(tx=>insertMessages(tx,user,audience,body,key));
  const key=randomUUID();
  const sent=await send({id:3,role:'employee'},{recipients:[4,4]},'Entre employés',key);
  assert.deepEqual(sent.map(r=>r.recipient_id).sort(),[4]);
  const observers=(await db.query('SELECT user_id FROM team_message_observers ORDER BY user_id')).rows;
  assert.deepEqual(observers,[{user_id:1},{user_id:2}]);
  assert.equal((await db.query('SELECT id FROM team_messages WHERE recipient_id=6')).rows.length,0);
  // Same request key must not turn an individual send into a new broadcast.
  assert.deepEqual(await send({id:3,role:'employee'},{all:true},'Autre contenu',key),[]);
  assert.equal((await db.query('SELECT count(*)::int n FROM team_messages')).rows[0].n,1);
  await assert.rejects(send({id:3,role:'employee'},{recipients:[4,5]},'Doit échouer entièrement'));
  await assert.rejects(send({id:3,role:'employee'},{recipients:[3]},'Soi-même'));
  await assert.rejects(send({id:3,role:'employee'},{recipients:[]},'Personne'));
  await assert.rejects(send({id:3,role:'employee'},{recipients:[999]},'Inconnu'));
  assert.equal((await db.query('SELECT count(*)::int n FROM team_messages')).rows[0].n,1);
  const broadcast=await send({id:2,role:'manager'},{all:true},'Annonce responsable');
  assert.deepEqual(broadcast.map(r=>r.recipient_id),[1,3,4,6]);
  const selected=await send({id:2,role:'manager'},{recipients:[3,4]},'Deux destinataires');
  assert.deepEqual(selected.map(r=>r.recipient_id),[3,4]);
  assert.equal((await db.query("SELECT id FROM team_messages WHERE recipient_id=1 AND body='Deux destinataires'")).rows.length,0);
  const everyone=await send({id:3,role:'employee'},{all:true},'Annonce employé');
  assert.deepEqual(everyone.map(r=>r.recipient_id),[1,2,4,6]);
  assert.equal((await db.query('SELECT id FROM team_messages WHERE recipient_id=5 OR sender_id=recipient_id')).rows.length,0);
 }finally{await db.close();}
});

test('Notifications de chaque copie : destinataires autorisés, secret absent, reprises limitées',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role) VALUES('Admin','admin@example.test','test','admin'),('Responsable','manager@example.test','test','manager'),('Employé','employee@example.test','test','employee');`);
  await db.transaction(tx=>insertMessages(tx,{id:3,role:'employee'},{recipients:[1]},'Contenu confidentiel',randomUUID()));
  assert.equal((await deliverPendingMessageEmails(db,{env:{}})).configured,false);
  assert.equal((await db.query('SELECT max(email_attempts)::int n FROM team_messages')).rows[0].n,0);
  const recipients=[];const env={GMAIL_USER:'fictif@gmail.com',GMAIL_APP_PASSWORD:'test-only'};
  const sendMail=async mail=>{recipients.push(mail.to);assert.doesNotMatch(mail.text,/Contenu confidentiel/);return {accepted:[mail.to]};};
  assert.equal((await deliverPendingMessageEmails(db,{env,sendMail})).sent,2);
  assert.deepEqual(recipients.sort(),['admin@example.test','manager@example.test']);
  assert.equal((await deliverPendingMessageEmails(db,{env,sendMail})).sent,0);
  await db.transaction(tx=>insertMessages(tx,{id:1,role:'admin'},{recipients:[2]},'Autre message',randomUUID()));
  const failing=async()=>{throw Object.assign(new Error('SMTP failure'),{code:'EAUTH'});};
  for(let i=0;i<3;i++)assert.equal((await deliverPendingMessageEmails(db,{env,sendMail:failing})).failed,1);
  assert.equal((await deliverPendingMessageEmails(db,{env,sendMail})).sent,0);
  assert.equal((await db.query("SELECT email_attempts FROM team_messages WHERE body='Autre message'")).rows[0].email_attempts,3);
 }finally{await db.close();}
});
