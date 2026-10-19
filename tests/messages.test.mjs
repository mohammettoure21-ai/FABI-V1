import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {expireConversations,insertMessage} from '../lib/messages.mjs';
test('Discussions privées : réponses, droits et expiration selon la dernière activité dans les deux sens',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role) VALUES('Admin','admin@example.test','test','admin'),('Employé','employee@example.test','test','employee'),('Autre','other@example.test','test','employee');`);
  const send=(id,recipient,body,key=randomUUID())=>db.transaction(tx=>insertMessage(tx,{id,role:id===1?'admin':'employee'},recipient,body,key));
  const first=await send(1,2,'Consigne');assert.ok(first);
  await db.query("UPDATE team_messages SET created_at=NOW()-INTERVAL '8 days' WHERE id=$1",[first]);
  // Seed a recent reply: even an old incoming message belongs to a live thread.
  await db.query('INSERT INTO team_messages(sender_id,recipient_id,body,request_key) VALUES(2,1,$1,$2)',['Réponse récente',randomUUID()]);
  const expired=await send(1,3,'Ancienne discussion');
  await db.query("UPDATE team_messages SET created_at=NOW()-INTERVAL '7 days' WHERE id=$1",[expired]);
  await db.transaction(expireConversations);
  assert.equal((await db.query('SELECT count(*)::int n FROM team_messages')).rows[0].n,2);
  assert.ok((await db.query('SELECT id FROM team_messages WHERE id=$1',[first])).rows.length);
  const key=randomUUID();assert.ok(await send(2,1,'Je vous réponds',key));assert.equal(await send(2,1,'Je vous réponds',key),undefined);
  await assert.rejects(send(2,3,'Interdit'));await assert.rejects(send(2,2,'Soi-même'));
  await db.exec('UPDATE users SET active=FALSE WHERE id=3');await assert.rejects(send(1,3,'Inactif'));
  await db.exec("UPDATE team_messages SET created_at=NOW()-INTERVAL '8 days'");
  // A new message after expiry starts a fresh discussion, never revives old data.
  await send(2,1,'Nouvelle discussion');
  const rows=(await db.query('SELECT body FROM team_messages')).rows;
  assert.deepEqual(rows,[{body:'Nouvelle discussion'}]);
 }finally{await db.close();}
});
