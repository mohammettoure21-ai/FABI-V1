import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {summarize} from '../lib/finance.mjs';

test('Le bilan sépare loyers, dépenses et commissions ; importer une ligne deux fois est refusé',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);await db.exec(schema);
  await db.exec("INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('IMPORT_TEST','Bien fictif','','',NULL,NULL,'Inactive'); INSERT INTO finance_imports(fingerprint,filename,reporting_year,source_data) VALUES('test','test.xlsx',2026,'{}')");
  const add=(kind,amount,row)=>db.query("INSERT INTO finance_entries(import_id,property_id,kind,reporting_year,reporting_month,description,amount,source_sheet,source_row) VALUES(1,1,$1,2026,5,'Fictif',$2,'Test',$3)",[kind,amount,row]);
  await add('recette',1000,1);await add('depense',100,2);await add('loyer',300,3);await add('commission',50,4);
  assert.deepEqual(summarize((await db.query('SELECT * FROM finance_entries')).rows),{recette:1000,depense:100,loyer:300,commission:50,balance:900});
  await assert.rejects(add('recette',1000,1),error=>error.code==='23505');
  await assert.rejects(add('depense',-1,5),error=>error.code==='23514');
  await db.exec('INSERT INTO property_monthly_rents(property_id,amount) VALUES(1,250)');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,4);
  const secured=await db.query("SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('finance_imports','finance_entries','property_monthly_rents')");
  assert.equal(secured.rows.length,3);assert.ok(secured.rows.every(r=>r.relrowsecurity));
 }finally{await db.close();}
});
