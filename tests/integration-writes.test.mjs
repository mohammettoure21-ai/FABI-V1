import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {registerCredential,revokeCredential,updateCredential,newCredential,digest} from '../lib/integration/auth.mjs';
import {integrationHandler} from '../lib/integration/handler.mjs';

async function fixture(){
 const db=new PGlite({extensions:{btree_gist}});await db.exec(schema);
 await db.exec("INSERT INTO users(name,email,password,role) VALUES('Admin fictif','admin@example.test','test','admin'),('Employé fictif','employee@example.test','test','employee'); INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('A','Appartement fictif A','Fictif','F2',1,0,'Disponible'),('B','Appartement fictif B','Fictif','F2',1,0,'Disponible')");
 return db;
}
async function key(db,permissions=['properties:read','reservations:create','expenses:create'],properties=null){
 const token=newCredential(),row=await db.transaction(tx=>registerCredential(tx,{name:'Hermes fictif',createdBy:1,permissions,properties,expiresAt:new Date(Date.now()+86400000).toISOString(),tokenHash:digest(token)}));return {...row,token};
}
const env={FABI_INTEGRATION_ENABLED:'true',FABI_INTEGRATION_WRITES_ENABLED:'true'};
async function api(db,c,path,body,config=env,transaction=fn=>db.transaction(fn)){
 return integrationHandler(new Request('https://fabi.test/api/integration/'+path,{method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify(body)}),path,{db,transaction,env:config});
}
const booking={property_id:1,guest_name:'Voyageur fictif',arrival:'2027-02-10',departure:'2027-02-12',guests:2,nightly:null,total:null,status:'Confirmée',source:'Direct'};
const expense={property_id:1,date:'2027-02-10',description:'Nettoyage fictif',amount:5000,activity:'Ménage',provider:'Intervenant fictif'};
async function prepare(db,c,path,data){const r=await api(db,c,path,data);assert.equal(r.status,200,await r.clone().text());return r.json();}
async function count(db,table){return (await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;}

test('Hermes écriture : préparation seule, accord explicite, données figées, aucune recette inventée et répétition sans doublon',async()=>{
 const db=await fixture();try{
  const c=await key(db),read=await key(db,['properties:read']);
  assert.equal((await api(db,read,'reservations/prepare',booking)).status,403);
  const p=await prepare(db,c,'reservations/prepare',booking);
  assert.equal(p.confirmation_required,true);assert.equal(p.summary.total_amount,null);
  assert.equal(await count(db,'reservations'),0);assert.equal(await count(db,'audit'),2); // Two credential creations only.
  assert.equal((await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:false})).status,400);
  assert.equal((await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true,total:1})).status,400);
  const other=await key(db);
  assert.equal((await api(db,other,'operations/execute',{operation_id:p.operation_id,confirmed:true})).status,404);
  const first=await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true});assert.equal(first.status,200);
  const result=await first.json();assert.equal(result.recorded,true);assert.equal(result.already_executed,false);
  const row=(await db.query('SELECT * FROM reservations WHERE id=$1',[result.reservation_id])).rows[0];
  assert.equal(row.nightly,null);assert.equal(row.agreed_total,null);assert.equal(row.guest_label,booking.guest_name);assert.equal(row.client_id,null);
  const repeat=await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true});assert.equal((await repeat.json()).already_executed,true);
  assert.equal(await count(db,'reservations'),1);assert.equal(await count(db,'finance_entries'),0);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit WHERE action='Création réservation' AND integration_credential_id=$1",[c.id])).rows[0].n,1);
 }finally{await db.close();}
});

test('Hermes dépense : FCFA entiers, intervenant requis, payée, audit et aucun e-mail financier pour les employés',async()=>{
 const db=await fixture();try{
  const c=await key(db);
  for(const invalid of [{amount:1.5},{amount:0},{provider:''},{date:'2027-02-30'},{amount:5001,quantity:2},{description:''},{activity:'Inconnue'}])assert.equal((await api(db,c,'expenses/prepare',{...expense,...invalid})).status,400);
  const p=await prepare(db,c,'expenses/prepare',expense);assert.equal(await count(db,'finance_entries'),0);
  const r=await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true});assert.equal(r.status,200);
  const result=await r.json(),entry=(await db.query('SELECT * FROM finance_entries WHERE id=$1',[result.expense_id])).rows[0];
  assert.equal(Number(entry.amount),5000);assert.equal(entry.payment_status,'Payé');assert.equal(entry.provider,expense.provider);assert.equal(entry.staff_service,true);assert.equal(entry.source_sheet,'Hermes');assert.equal(entry.original_date,expense.date);
  const recipients=(await db.query('SELECT u.role FROM activity_email_deliveries d JOIN users u ON u.id=d.recipient_id')).rows.map(r=>r.role);
  assert.deepEqual(recipients,['admin']);
  assert.equal((await db.query('SELECT integration_credential_id FROM audit WHERE action=$1',['Création écriture financière '+result.expense_id])).rows[0].integration_credential_id,c.id);
  await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true});assert.equal(await count(db,'finance_entries'),1);
 }finally{await db.close();}
});

test('Hermes réservation : disponibilité revérifiée après préparation, départ exclusif et conflit sans écriture partielle',async()=>{
 const db=await fixture();try{
  const c=await key(db),a=await prepare(db,c,'reservations/prepare',booking),b=await prepare(db,c,'reservations/prepare',booking);
  assert.equal((await api(db,c,'operations/execute',{operation_id:a.operation_id,confirmed:true})).status,200);
  assert.equal((await api(db,c,'operations/execute',{operation_id:b.operation_id,confirmed:true})).status,409);
  assert.equal(await count(db,'reservations'),1);assert.equal((await db.query('SELECT result FROM integration_operations WHERE id=$1',[b.operation_id])).rows[0].result,null);
  const adjacent=await prepare(db,c,'reservations/prepare',{...booking,arrival:booking.departure,departure:'2027-02-14',nightly:1000});
  assert.equal(adjacent.summary.total_amount,2000);
  assert.equal((await api(db,c,'operations/execute',{operation_id:adjacent.operation_id,confirmed:true})).status,200);
  assert.equal(await count(db,'finance_entries'),0);
 }finally{await db.close();}
});

test('Hermes écriture : périmètre, arrêt serveur, expiration, changement de droits et révocation',async()=>{
 const db=await fixture();try{
  const c=await key(db,undefined,[1]);
  assert.equal((await api(db,c,'expenses/prepare',{...expense,property_id:2})).status,403);
  assert.equal((await api(db,c,'expenses/prepare',{...expense,property_id:null})).status,403);
  assert.equal((await api(db,c,'expenses/prepare',expense,{...env,FABI_INTEGRATION_WRITES_ENABLED:'false'})).status,503);
  const old=await prepare(db,c,'expenses/prepare',expense);
  await db.query("UPDATE integration_operations SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[old.operation_id]);
  assert.equal((await api(db,c,'operations/execute',{operation_id:old.operation_id,confirmed:true})).status,410);
  const p=await prepare(db,c,'expenses/prepare',expense);
  await db.transaction(tx=>updateCredential(tx,{id:c.id,actor:1,permissions:['properties:read'],properties:[1],expiresAt:new Date(Date.now()+86400000).toISOString()}));
  assert.equal((await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true})).status,403);
  await db.transaction(tx=>updateCredential(tx,{id:c.id,actor:1,permissions:['expenses:create'],properties:[1],expiresAt:new Date(Date.now()+86400000).toISOString()}));
  assert.equal((await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true})).status,410);
  const recent=await prepare(db,c,'expenses/prepare',expense);await db.transaction(tx=>revokeCredential(tx,c.id,1));
  assert.equal((await api(db,c,'operations/execute',{operation_id:recent.operation_id,confirmed:true})).status,401);
  assert.equal(await count(db,'finance_entries'),0);
 }finally{await db.close();}
});

test('Hermes écriture : l’échec du journal annule la dépense, les notifications et la confirmation',async()=>{
 const db=await fixture();try{
  const c=await key(db),p=await prepare(db,c,'expenses/prepare',expense);
  const failAudit=fn=>db.transaction(tx=>fn({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO audit'))throw new Error('Simulated failure');return tx.query(sql,args);}}));
  assert.equal((await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true},env,failAudit)).status,500);
  assert.equal(await count(db,'finance_entries'),0);assert.equal(await count(db,'activity_email_deliveries'),0);
  assert.equal((await db.query('SELECT result FROM integration_operations WHERE id=$1',[p.operation_id])).rows[0].result,null);
  assert.equal((await api(db,c,'operations/execute',{operation_id:p.operation_id,confirmed:true})).status,200);
  assert.equal(await count(db,'finance_entries'),1);
 }finally{await db.close();}
});
