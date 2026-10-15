import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {reconcilePropertyCatalog} from '../lib/property-catalog.mjs';
import {removeImportedRent} from '../lib/remove-imported-rent.mjs';
test('Suppression ciblée de l’ancien loyer et de sa mention ; les autres écritures sont conservées',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);await reconcilePropertyCatalog(db);
  await db.query('INSERT INTO finance_imports(fingerprint,filename,reporting_year,source_data,notes) VALUES($1,$2,2026,$3,$4)',['test','test.xlsx',JSON.stringify({Ecrin:[{row:31,values:['Dubai loyer']},{row:32,values:['Autre']}]}),JSON.stringify(['Dubai loyer à vérifier','Autre contrôle'])]);
  await db.exec("INSERT INTO finance_entries(import_id,kind,reporting_year,reporting_month,description,amount,source_sheet,source_row) VALUES(1,'loyer',2026,5,'Dubai loyer',600000,'Ecrin',31); INSERT INTO finance_entries(kind,reporting_year,reporting_month,description,amount) VALUES('depense',2026,5,'Charge à conserver',600000)");
  await removeImportedRent(db);await removeImportedRent(db);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,1);
  const source=(await db.query('SELECT source_data,notes FROM finance_imports')).rows[0];
  assert.equal(source.source_data.Ecrin.length,1);assert.deepEqual(source.notes,['Autre contrôle']);
 }finally{await db.close();}
});
