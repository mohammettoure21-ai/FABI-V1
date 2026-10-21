import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {dueMonths,createRecurringWifi,generateRecurringExpenses} from '../lib/recurring-expenses.mjs';

test('Wi-Fi : échéances réelles seulement, fins de mois et changement d’année',()=>{
 assert.deepEqual(dueMonths('2026-01-31','2026-03-01').map(d=>d.date),['2026-01-31','2026-02-28']);
 assert.deepEqual(dueMonths('2028-01-31','2028-02-29').map(d=>d.date),['2028-01-31','2028-02-29']);
 assert.deepEqual(dueMonths('2026-12-21','2027-01-20').map(d=>d.date),['2026-12-21']);
 assert.deepEqual(dueMonths('2026-11-01','2026-10-31'),[]);
});
test('Wi-Fi : deux appartements, rattrapage, relance sans doublon, arrêt et historique préservé',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec("INSERT INTO users(name,email,password,role) VALUES('Test','test@example.test','hash','admin'); INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('A','Appartement A','Test','F2',1,0,'Disponible'),('B','Appartement B','Test','F2',1,0,'Disponible')");
  await db.exec("INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,original_date,description,amount,activity) VALUES(1,'depense',2026,10,'Mois uniquement','Wi-Fi historique',14900,'Wifi')");
  const data={propertyIds:[1,2],date:'2026-10-21',amount:14900,description:'Abonnement Wi-Fi',requestKey:randomUUID(),userId:1};
  assert.deepEqual(await db.transaction(tx=>createRecurringWifi(tx,data,'2026-10-21')),{created:1,reused:1});
  assert.deepEqual(await db.transaction(tx=>createRecurringWifi(tx,data,'2026-10-21')),{created:0,reused:0});
  assert.equal((await db.query('SELECT sum(amount)::int n FROM finance_entries')).rows[0].n,29800);
  assert.equal((await db.query('SELECT original_date FROM finance_entries WHERE id=1')).rows[0].original_date,'Mois uniquement');
  assert.deepEqual(await db.transaction(tx=>generateRecurringExpenses(tx,'2027-01-20')),{created:4,reused:0});
  assert.deepEqual(await db.transaction(tx=>generateRecurringExpenses(tx,'2027-01-21')),{created:2,reused:0});
  await assert.rejects(db.transaction(tx=>createRecurringWifi(tx,{...data,requestKey:randomUUID()},'2027-01-21')),/WIFI_ALREADY_ACTIVE/);
  await db.exec('UPDATE recurring_expenses SET active=FALSE WHERE property_id=1');
  assert.deepEqual(await db.transaction(tx=>generateRecurringExpenses(tx,'2027-02-21')),{created:1,reused:0});
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries WHERE property_id=1')).rows[0].n,4);
  // A historical difference remains explicit, without silently correcting or duplicating it.
  await db.exec("INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,description,amount,activity) VALUES(2,'depense',2027,3,'Wi-Fi montant historique différent',9000,'Wifi')");
  assert.deepEqual(await db.transaction(tx=>generateRecurringExpenses(tx,'2027-03-21')),{created:0,reused:1});
  assert.match((await db.query("SELECT warning FROM recurring_expense_months WHERE period='2027-03'")).rows[0].warning,/montant différent/);
  assert.equal((await db.query("SELECT amount::int n FROM finance_entries WHERE reporting_year=2027 AND reporting_month=3")).rows[0].n,9000);
  // Multiple selected properties are atomic when one is invalid.
  await assert.rejects(db.transaction(tx=>createRecurringWifi(tx,{...data,propertyIds:[null,999],requestKey:randomUUID()},'2027-03-21')),/PROPERTY_INVALID/);
  assert.equal((await db.query('SELECT count(*)::int n FROM recurring_expenses WHERE property_id IS NULL')).rows[0].n,0);
  await db.exec(schema);
  assert.equal((await db.query('SELECT count(*)::int n FROM recurring_expenses')).rows[0].n,2);
 }finally{await db.close();}
});
