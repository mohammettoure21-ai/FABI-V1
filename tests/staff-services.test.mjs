import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {staffServiceSummary,summarize} from '../lib/finance.mjs';

test('Services : prix variables, regroupement par personne/service, anciens montants conservés',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec(`INSERT INTO finance_entries(kind,reporting_year,reporting_month,description,amount,activity,quantity,unit_amount,provider,staff_service,payment_status) VALUES
   ('depense',2026,10,'Ancien ménage',10000,'Ménage',2,5000,'A',FALSE,'Payé'),
   ('depense',2026,10,'Contrôle',7500,'Vérification',3,2500,'B',TRUE,'À payer'),
   ('depense',2026,10,'Achats historiques sans passages',9000,'Autre',1,NULL,'',FALSE,'Non précisé');`);
  await db.exec(schema);await db.exec(schema);
  const entries=(await db.query('SELECT * FROM finance_entries ORDER BY id')).rows;
  assert.deepEqual(entries.map(e=>Number(e.amount)),[10000,7500,9000]);
  assert.deepEqual(entries.map(e=>e.staff_service),[true,true,false]);
  const rows=staffServiceSummary(entries);
  assert.equal(rows.length,2);assert.equal(rows.find(r=>r.service==='Vérification').due,7500);
  assert.equal(rows.find(r=>r.provider==='A').visits,2);
  assert.equal(summarize(entries).depense,26500);
 }finally{await db.close();}
});
