import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {insertMessages,employeeThread,employeeThreads,unreadMessageCount,readObservedMessage} from '../lib/messages.mjs';
import {deliverPendingMessageEmails,notifyObserverEmail} from '../lib/message-email.mjs';

test('Suivi employé : historique complet dans les deux sens, échanges encadrants privés et lectures séparées',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role,active) VALUES
   ('Mohammet','admin@example.test','test','admin',TRUE),
   ('Mbagnick','employee@example.test','test','employee',TRUE),
   ('Responsable','manager@example.test','test','manager',TRUE),
   ('Autre employé','other@example.test','test','employee',TRUE),
   ('Autre admin','second@example.test','test','admin',TRUE),
   ('Inactif','inactive@example.test','test','manager',FALSE);`);
  const admin={id:1,role:'admin'},employee={id:2,role:'employee'},manager={id:3,role:'manager'};
  const seed=async(s,r,body,copy=false)=>db.query('INSERT INTO team_messages(sender_id,recipient_id,body,request_key,is_supervision) VALUES($1,$2,$3,$4,$5)',[s,r,body,randomUUID(),copy]);
  await seed(2,1,'Ancienne demande de Mbagnick');await seed(1,2,'Ancienne réponse de Mohammet');
  await seed(2,3,'Ancienne copie fragmentée',true);
  const send=(actor,recipient,body)=>db.transaction(tx=>insertMessages(tx,actor,{recipients:[recipient]},body,randomUUID(),{env:{FABI_TEAM_EMAILS_ENABLED:'true'}}));
  await send(employee,1,'Nouvelle demande');await send(admin,2,'Nouvelle réponse');
  await send(admin,3,'Discussion privée entre encadrants');
  const threads=await employeeThreads(db,manager);
  assert.equal(threads.length,1);assert.equal(threads[0].employee,'Mbagnick');assert.equal(threads[0].partner,'Mohammet');
  const shared=await employeeThread(db,manager,2,1);
  assert.deepEqual(shared.messages.map(m=>m.body).reverse(),['Ancienne demande de Mbagnick','Ancienne réponse de Mohammet','Nouvelle demande','Nouvelle réponse']);
  assert.equal(await employeeThread(db,employee,2,1),null);
  assert.equal(await employeeThread(db,{id:4,role:'admin'},2,1),null);
  assert.equal(await employeeThread(db,manager,1,3),null);
  assert.deepEqual(await employeeThreads(db,employee),[]);
  assert.equal((await db.query('SELECT count(*)::int n FROM team_message_observers')).rows[0].n,4);
  assert.equal(await unreadMessageCount(db,manager),3); // two observed + their private incoming
  const observed=shared.messages.find(m=>m.body==='Nouvelle réponse');
  assert.equal(observed.recipient_id,2);assert.equal(observed.observer_id,3);
  await readObservedMessage(db,employee,observed.id);
  assert.equal((await db.query('SELECT read_at FROM team_message_observers WHERE message_id=$1 AND user_id=3',[observed.id])).rows[0].read_at,null);
  await readObservedMessage(db,manager,observed.id);
  assert.equal(await unreadMessageCount(db,manager),2);
  assert.equal((await db.query('SELECT read_at FROM team_messages WHERE id=$1',[observed.id])).rows[0].read_at,null);
  assert.equal((await db.query('SELECT read_at FROM team_message_observers WHERE message_id=$1 AND user_id=5',[observed.id])).rows[0].read_at,null);
  // Being deactivated or losing a supervisory role removes access immediately.
  await db.exec("UPDATE users SET active=FALSE WHERE id=3");
  assert.equal(await employeeThread(db,manager,2,1),null);
 }finally{await db.close();}
});

test('Notifications : demande et réponse employé notifient l’encadrement ; échange privé sans copie',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role) VALUES('Admin','admin@example.test','test','admin'),('Mbagnick','employee@example.test','test','employee'),('Responsable','manager@example.test','test','manager');`);
  const send=(id,role,recipient,body)=>db.transaction(tx=>insertMessages(tx,{id,role},{recipients:[recipient]},body,randomUUID(),{env:{FABI_TEAM_EMAILS_ENABLED:'true'}}));
  const first=(await send(2,'employee',1,'Demande confidentielle'))[0].id;
  await send(1,'admin',2,'Réponse confidentielle');
  const privateId=(await send(1,'admin',3,'Discussion privée'))[0].id;
  assert.equal((await db.query('SELECT message_id FROM team_message_observers WHERE message_id=$1',[privateId])).rows.length,0);
  const emails=[];
  const env={FABI_TEAM_EMAILS_ENABLED:'true',GMAIL_USER:'fictif@gmail.com',GMAIL_APP_PASSWORD:'test-only'};
  const sendMail=async mail=>{emails.push(mail);assert.doesNotMatch(mail.text,/Demande confidentielle|Réponse confidentielle|Discussion privée/);return {accepted:[mail.to]};};
  const result=await deliverPendingMessageEmails(db,{env,sendMail});
  assert.equal(result.sent,5);
  const managerEmails=emails.filter(m=>m.to==='manager@example.test');
  assert.equal(managerEmails.length,3); // 2 supervision notifications, 1 own private message
  assert.equal(managerEmails.filter(m=>m.text.includes('/messages?employee=2&peer=1')).length,2);
  assert.equal(await notifyObserverEmail(db,first,2,{env,sendMail}),'unchanged');
  assert.equal((await deliverPendingMessageEmails(db,{env,sendMail})).sent,0);
 }finally{await db.close();}
});
