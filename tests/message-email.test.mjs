import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {notifyMessageEmail} from '../lib/message-email.mjs';
test('Notifications Gmail : absence de secret, échec, reprise et concurrence sans double envoi',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role) VALUES('Admin','admin@example.test','test','admin'),('Employé','employee@example.test','test','employee');
  INSERT INTO team_messages(sender_id,recipient_id,body,request_key) VALUES(1,2,'Contenu confidentiel à lire dans FABI','00000000-0000-4000-8000-000000000001');`);
  const env={GMAIL_USER:'fictif@gmail.com',GMAIL_APP_PASSWORD:'test-only-not-real'};
  let sent=0;
  const sendMail=async mail=>{sent++;assert.equal(mail.to,'employee@example.test');assert.doesNotMatch(mail.text,/Contenu confidentiel/);assert.match(mail.text,/https:\/\/fabi-v1.vercel.app\/messages/);return {accepted:[mail.to]};};
  assert.equal(await notifyMessageEmail(db,1,1,{env:{},sendMail}),'not_configured');assert.equal(sent,0);
  assert.equal(await notifyMessageEmail(db,1,2,{env,sendMail}),'unchanged');
  assert.equal(await notifyMessageEmail(db,1,1,{env,sendMail:async()=>{throw new Error('SMTP failure');}}),'failed');
  const results=await Promise.all([notifyMessageEmail(db,1,1,{env,sendMail}),notifyMessageEmail(db,1,1,{env,sendMail})]);
  assert.ok(results.includes('sent'));assert.equal(sent,1);
  assert.equal(await notifyMessageEmail(db,1,1,{env,sendMail}),'unchanged');
  const row=(await db.query('SELECT * FROM team_messages')).rows[0];assert.equal(row.email_status,'sent');assert.ok(row.email_sent_at);
 }finally{await db.close();}
});
