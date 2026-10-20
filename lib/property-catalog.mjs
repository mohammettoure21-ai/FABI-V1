const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const groupOf=p=>{
 const name=normalize(p.name),ref=normalize(p.reference);
 if(['ocean','ocean waves','oceane','ocean wave'].includes(name)||ref==='ocean')return 'ocean';
 if(name==='ecrin'||ref==='ecrin')return 'ecrin';
 return null;
};

export async function reconcilePropertyCatalog(db) {
 const key='fabi_two_apartments_20261015';
 await db.query('CREATE TABLE IF NOT EXISTS app_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 await db.query('ALTER TABLE app_migrations ENABLE ROW LEVEL SECURITY');
 await db.query(`DO $$ BEGIN
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON app_migrations FROM anon; END IF;
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON app_migrations FROM authenticated; END IF;
  END $$;`);
 if((await db.query('SELECT name FROM app_migrations WHERE name=$1',[key])).rows.length)return;
 const {rows}=await db.query('SELECT p.*,(SELECT count(*)::int FROM reservations r WHERE r.property_id=p.id) AS bookings FROM properties p ORDER BY p.id FOR UPDATE');
 const groups={ocean:rows.filter(p=>groupOf(p)==='ocean'),ecrin:rows.filter(p=>groupOf(p)==='ecrin')};
 if(!groups.ocean.length||!groups.ecrin.length)return;
 const before=[];
 for(const [group,properties] of Object.entries(groups)) {
  properties.sort((a,b)=>b.bookings-a.bookings||Number(b.status==='Disponible')-Number(a.status==='Disponible')||a.id-b.id);
  const keep=properties[0];
  before.push(...properties);
  for(const duplicate of properties.slice(1)) {
   const rents=await db.query('SELECT property_id,amount FROM property_monthly_rents WHERE property_id=ANY($1::int[])',[[keep.id,duplicate.id]]);
   const existing=rents.rows.find(r=>r.property_id===keep.id),moving=rents.rows.find(r=>r.property_id===duplicate.id);
   if(existing&&moving&&String(existing.amount)!==String(moving.amount))throw new Error('PROPERTY_RENT_CONFLICT');
   if(existing&&moving)await db.query('DELETE FROM property_monthly_rents WHERE property_id=$1',[duplicate.id]);
   else if(moving)await db.query('UPDATE property_monthly_rents SET property_id=$1 WHERE property_id=$2',[keep.id,duplicate.id]);
   await db.query('UPDATE reservations SET property_id=$1 WHERE property_id=$2',[keep.id,duplicate.id]);
   await db.query('UPDATE finance_entries SET property_id=$1 WHERE property_id=$2',[keep.id,duplicate.id]);
   await db.query('UPDATE users SET owner_property_id=$1 WHERE owner_property_id=$2',[keep.id,duplicate.id]);
   await db.query('DELETE FROM properties WHERE id=$1',[duplicate.id]);
  }
  await db.query("UPDATE properties SET reference=$1,name=$2,neighborhood=$3,category='F2',bedrooms=1,nightly=40000,status='Disponible' WHERE id=$4",
   [group==='ocean'?'OCEAN':'ECRIN',group==='ocean'?'OCÉAN':'ÉCRIN',group==='ocean'?'Cité Biagui':'Mamelles',keep.id]);
 }
 const catalog=(await db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='Disponible')::int AS active FROM properties")).rows[0];
 if(catalog.total!==2||catalog.active!==2)throw new Error('PROPERTY_CATALOG_UNEXPECTED');
 console.log('FABI_PROPERTY_CATALOG_VERIFIED',JSON.stringify(catalog));
 await db.query('INSERT INTO audit(action) VALUES($1)',['Fusion des fiches OCÉAN / ÉCRIN ; état antérieur : '+JSON.stringify(before)]);
 await db.query('INSERT INTO app_migrations(name) VALUES($1)',[key]);
 console.log('FABI : OCÉAN et ÉCRIN actifs, F2, 40 000 FCFA/nuit ; liens conservés.');
}
