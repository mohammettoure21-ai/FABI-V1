import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {ownerData} from '../lib/owner.mjs';
import {insertMessages,employeeThread} from '../lib/messages.mjs';
import {recordActivity,deliverActivityEmails} from '../lib/activity-email.mjs';

test('Propriétaire : appartement attribué seulement, finances séparées et messagerie administrateur seulement',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec(`INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES
   ('ECRIN','ÉCRIN','Mamelles','F2',1,40000,'Disponible'),('OCEAN','OCÉAN','Ngor','F2',1,40000,'Disponible');
   INSERT INTO users(name,email,password,role,owner_property_id) VALUES
   ('Admin','admin@example.test','test','admin',NULL),('Responsable','manager@example.test','test','manager',NULL),
   ('Employé','employee@example.test','test','employee',NULL),('Propriétaire','owner@example.test','test','owner',1);
   INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,description,amount) VALUES
   (1,'recette',2026,10,'Recette ÉCRIN',100000),(1,'depense',2026,10,'Charge ÉCRIN',10000),
   (1,'commission',2026,10,'Commission privée FABI',5000),(2,'recette',2026,10,'Recette OCÉAN',900000),
   (NULL,'commission',2026,10,'Commission globale FABI',1000000);
   INSERT INTO reservations(property_id,arrival,departure,guests,nightly,status,source,assigned_to,guest_label) VALUES
   (1,'2026-10-01','2026-10-03',2,40000,'Confirmée','Direct',1,'Client privé ÉCRIN'),
   (2,'2026-10-04','2026-10-06',2,40000,'Confirmée','Direct',1,'Client privé OCÉAN');`);
  await db.exec(schema);
  const data=await ownerData(db,4,2026);
  assert.equal(data.property.name,'ÉCRIN');assert.deepEqual(data.entries.map(e=>e.kind).sort(),['depense','recette']);
  assert.doesNotMatch(JSON.stringify(data),/OCÉAN|Commission privée|Commission globale|Client privé/);
  assert.equal(data.stays.length,1);assert.equal(data.stays[0].property_id,1);
  assert.equal(await ownerData(db,1,2026),null);
  const send=(id,role,recipient)=>db.transaction(tx=>insertMessages(tx,{id,role},{recipients:[recipient]},'Test privé',randomUUID()));
  await send(4,'owner',1);await send(1,'admin',4);
  assert.equal((await db.query('SELECT count(*)::int n FROM team_message_observers')).rows[0].n,0);
  await assert.rejects(send(4,'owner',2));await assert.rejects(send(4,'admin',3));
  await assert.rejects(send(2,'manager',4));await assert.rejects(send(3,'employee',4));
  assert.equal(await employeeThread(db,{id:4,role:'owner'},3,1),null);
  await db.transaction(tx=>recordActivity(tx,1,'Création écriture financière 123'));
  assert.deepEqual((await db.query('SELECT recipient_id FROM activity_email_deliveries ORDER BY recipient_id')).rows.map(r=>r.recipient_id),[1,2]);
  await db.transaction(tx=>recordActivity(tx,1,'Création client'));
  assert.equal((await db.query('SELECT count(*)::int n FROM activity_email_deliveries WHERE recipient_id=4')).rows[0].n,0);
  const recipients=[];
  await deliverActivityEmails(db,{env:{GMAIL_USER:'fake@gmail.com',GMAIL_APP_PASSWORD:'fake'},sendMail:async mail=>{recipients.push(mail.to);return {accepted:[mail.to]};}});
  assert.ok(!recipients.includes('owner@example.test'));
  await db.exec('UPDATE users SET owner_property_id=2 WHERE id=4');
  const reassigned=await ownerData(db,4,2026);assert.equal(reassigned.property.name,'OCÉAN');assert.equal(reassigned.entries.length,1);
  await db.exec('UPDATE users SET active=FALSE WHERE id=4');assert.equal(await ownerData(db,4,2026),null);
  await assert.rejects(db.exec("INSERT INTO users(name,email,password,role) VALUES('Sans bien','bad@example.test','test','owner')"));
 }finally{await db.close();}
});
