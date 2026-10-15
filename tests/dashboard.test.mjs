import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {reconcilePropertyCatalog} from '../lib/property-catalog.mjs';
import {revenueMonths,scopeRevenue} from '../lib/dashboard.mjs';

test('Le graphique additionne les activités par mois, avec des mois vides à zéro',()=>{
 const months=revenueMonths([{month:8,activity:'Appartement',total:'125000',count:1},{month:8,activity:'Chauffeur',total:'5000',count:1},{month:10,activity:'Chauffeur',total:'5000',count:1}]);
 assert.equal(months.length,12);assert.equal(months[7].total,130000);assert.equal(months[7].count,2);
 assert.equal(months[0].total,0);assert.equal(months[9].total,5000);
});

test('Fusion OCÉAN : réservations, écritures et loyer conservés ; deux F2 disponibles à 40 000',async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 try{
  await db.exec(schema);
  await db.exec(`INSERT INTO users(name,email,password,role) VALUES('Test','test@example.test','test','admin');
   INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES
    ('002','Ocean waves','Cite Biagui','F2',1,45000,'Disponible'),('OCEAN','OCÉAN','','',NULL,NULL,'Inactive'),('ECRIN','ÉCRIN','','',NULL,NULL,'Inactive');
   INSERT INTO reservations(property_id,arrival,departure,guests,nightly,status,source,assigned_to) VALUES(1,'2026-10-15','2026-10-18',2,45000,'Confirmée','Airbnb',1);
   INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,description,amount) VALUES(2,'recette',2026,10,'Test',175000);
   INSERT INTO property_monthly_rents(property_id,amount) VALUES(2,100000);`);
  await db.exec('BEGIN');await reconcilePropertyCatalog(db);await db.exec('COMMIT');
  await db.exec('BEGIN');await reconcilePropertyCatalog(db);await db.exec('COMMIT');
  const properties=(await db.query('SELECT * FROM properties ORDER BY reference')).rows;
  assert.equal(properties.length,2);assert.ok(properties.every(p=>p.status==='Disponible'&&p.nightly===40000&&p.category==='F2'&&p.bedrooms===1));
  const ocean=properties.find(p=>p.reference==='OCEAN'),ecrin=properties.find(p=>p.reference==='ECRIN');
  assert.equal(ocean.id,1);assert.equal(ocean.neighborhood,'Cité Biagui');assert.equal(ecrin.neighborhood,'Mamelles');
  assert.equal((await db.query('SELECT property_id FROM finance_entries')).rows[0].property_id,ocean.id);
  assert.equal((await db.query('SELECT property_id FROM property_monthly_rents')).rows[0].property_id,ocean.id);
  const booking=(await db.query('SELECT * FROM reservations')).rows[0];assert.equal(booking.property_id,ocean.id);assert.equal(booking.nightly,45000);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM app_migrations')).rows[0].n,1);
 }finally{await db.close();}
});

test('Les vues appartement utilisent les recettes et charges existantes, sans ajouter les commissions FABI',()=>{
 const rows=[{month:8,property_id:1,kind:'recette',activity:'Autre',total:'595000',count:1},{month:8,property_id:1,kind:'depense',activity:'Wifi',total:'7900',count:1},{month:8,property_id:1,kind:'commission',activity:'Appartement',total:'5000',count:1},{month:8,property_id:null,kind:'commission',activity:'Appartement',total:'125000',count:1},{month:8,property_id:2,kind:'recette',activity:'Autre',total:'305815',count:1},{month:8,property_id:2,kind:'loyer',activity:'Autre',total:'100000',count:1}];
 const ocean=scopeRevenue(rows,1),ecrin=scopeRevenue(rows,2),fabi=scopeRevenue(rows);
 assert.equal(ocean.annual,595000);assert.equal(ocean.charges,7900);assert.equal(ocean.result,587100);
 assert.equal(ecrin.annual,305815);assert.equal(ecrin.charges,100000);
 assert.equal(fabi.annual,130000);assert.equal(fabi.monthly[7].activities.length,1);assert.equal(fabi.monthly[7].activities[0].total,130000);
});
