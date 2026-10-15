import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {reviewStayPayment} from '../lib/stay-payment.mjs';
import {projectedRevenue} from '../lib/stay.mjs';
test('Encaissement J+1 explicite, réponse non reçue, répétition sans doublon et prévisionnel',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role) VALUES('Test','payment@example.test','test','admin');
  INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('TEST','Test','Test','F2',1,40000,'Disponible');
  INSERT INTO reservations(property_id,arrival,departure,guests,nightly,status,source,assigned_to) VALUES(1,'2026-10-14','2026-10-17',1,20000,'Confirmée','Direct',1);`);
  await assert.rejects(reviewStayPayment(db,1,true,1,'2026-10-14'));
  await reviewStayPayment(db,1,false,1,'2026-10-15');
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
  await reviewStayPayment(db,1,true,1,'2026-10-15');await reviewStayPayment(db,1,true,1,'2026-10-15');
  const entries=(await db.query('SELECT * FROM finance_entries')).rows;assert.equal(entries.length,1);assert.equal(Number(entries[0].amount),60000);assert.equal(entries[0].property_id,1);assert.equal(entries[0].kind,'recette');assert.equal(entries[0].reporting_month,10);
  const stay=(await db.query('SELECT * FROM reservations')).rows[0];assert.equal(projectedRevenue([stay],2026,'2026-10-15',1).total,0);
 }finally{await db.close();}
});
