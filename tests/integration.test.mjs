import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {registerCredential,revokeCredential,updateCredential,newCredential,digest,readScopes,scopes} from '../lib/integration/auth.mjs';
import {integrationHandler} from '../lib/integration/handler.mjs';
import {approveDashboard} from '../lib/integration/dashboard.mjs';
import {migrateIntegration} from '../lib/integration/migrate.mjs';
async function fixture(){const db=new PGlite({extensions:{btree_gist}});await db.exec(schema);await db.exec("INSERT INTO users(name,email,password,role) VALUES('Admin','admin@example.test','test','admin'),('Employé','employee@example.test','test','employee'); INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('A','Appartement A','Fictif','F2',1,0,'Disponible'),('B','Appartement B','Fictif','F2',1,0,'Disponible')");return db;}
const env={FABI_INTEGRATION_ENABLED:'true'};
async function key(db,permissions=readScopes,properties=null){const token=newCredential();const row=await db.transaction(tx=>registerCredential(tx,{name:'Test technique',createdBy:1,permissions,properties,expiresAt:new Date(Date.now()+30*86400000).toISOString(),tokenHash:digest(token)}));return {...row,token};}
async function api(db,credential,path,body,config=env){return integrationHandler(new Request('https://fabi.test/api/integration/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+credential.token},body:body===undefined?undefined:JSON.stringify(body)}),path.split('?')[0],{db,transaction:fn=>db.transaction(fn),env:config});}
async function facts(db){const result={};for(const table of ['reservations','finance_entries','team_messages','activity_email_deliveries','audit','recurring_expenses','recurring_expense_months','reservation_reminders'])result[table]=(await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;return JSON.stringify(result);}
test('Accès Hermes : empreinte seule, scopes, révocation et consultations sans effet métier',async()=>{
 const db=await fixture();try{
  const credential=await key(db);assert.notEqual((await db.query('SELECT token_hash FROM integration_credentials')).rows[0].token_hash,credential.token);
  await db.query("INSERT INTO recurring_expenses(property_id,description,amount,start_date,created_by,request_key) VALUES(1,'Wi-Fi fictif',14900,'2026-01-01',1,$1)",[randomUUID()]);
  await db.query("INSERT INTO team_messages(sender_id,recipient_id,body,request_key,created_at) VALUES(1,2,'Ancien message fictif',$1,NOW()-INTERVAL '8 days')",[randomUUID()]);
  const before=await facts(db);
  for(const path of ['properties','reservations?from=2026-01-01&to=2026-12-31','availability?property_id=1&arrival=2026-12-01&departure=2026-12-04','report?year=2026'])assert.equal((await api(db,credential,path)).status,200,path);
  assert.equal(await facts(db),before);
  assert.equal((await api(db,credential,'properties',undefined,{})).status,200);
  assert.equal((await api(db,{token:'bad'},'properties',undefined,{})).status,401);
  assert.equal((await api(db,credential,'dashboard-requests',{task:'Modifier une réservation'})).status,403);
  assert.equal((await api(db,credential,'bookings',{})).status,404);
  assert.equal((await api(db,{token:digest(credential.token)},'properties')).status,401);
  assert.equal((await api(db,credential,'properties',undefined,{FABI_INTEGRATION_ENABLED:'false'})).status,503);
  const limited=await key(db,['properties:read','reservations:read'],[1]);assert.equal((await (await api(db,limited,'properties')).json()).properties.length,1);
  assert.equal((await api(db,limited,'availability?property_id=2&arrival=2026-12-01&departure=2026-12-04')).status,403);
  await db.transaction(tx=>revokeCredential(tx,credential.id,1));assert.equal((await api(db,credential,'properties')).status,401);
  const rotated=await key(db);await db.query("UPDATE integration_credentials SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[rotated.id]);assert.equal((await api(db,rotated,'properties')).status,401);
  const active=await key(db);await db.exec('UPDATE users SET active=FALSE WHERE id=1');assert.equal((await api(db,active,'properties')).status,401);
  assert.doesNotMatch(JSON.stringify((await db.query('SELECT * FROM integration_access_log')).rows),new RegExp(credential.token));
 }finally{await db.close();}
});
test('Accès Hermes : dashboard après confirmation personnelle, usage unique et session courte révoquée',async()=>{
 const db=await fixture();try{
  const credential=await key(db,scopes);
  const request=await (await api(db,credential,'dashboard-requests',{task:'Ajouter le séjour fictif après vérification des détails'})).json();assert.ok(request.request_id);
  assert.equal((await api(db,credential,'dashboard-session',{request_id:request.request_id})).status,403);
  await assert.rejects(db.transaction(tx=>approveDashboard(tx,request.request_id,2)),/REQUEST_NOT_APPROVABLE/);
  await db.transaction(tx=>approveDashboard(tx,request.request_id,1));
  const response=await api(db,credential,'dashboard-session',{request_id:request.request_id});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/Max-Age=600/);
  const session=(await db.query('SELECT * FROM sessions')).rows[0];assert.equal(session.integration_credential_id,credential.id);assert.ok(new Date(session.expires)-Date.now()<=600000);
  assert.doesNotMatch(JSON.stringify(await response.json()),new RegExp(cookie.match(/fabi_session=([^;]+)/)[1]));
  assert.equal((await api(db,credential,'dashboard-session',{request_id:request.request_id})).status,409);
  await db.transaction(tx=>revokeCredential(tx,credential.id,1));assert.equal((await db.query('SELECT count(*)::int n FROM sessions')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
 }finally{await db.close();}
});
test('Accès Hermes : élargir puis réduire les droits conserve la clé et exige une nouvelle confirmation',async()=>{
 const db=await fixture();try{
  const credential=await key(db,['properties:read'],[1]);
  const expiresAt=new Date(Date.now()+7*86400000).toISOString();
  const change={id:credential.id,actor:1,permissions:scopes,properties:null,expiresAt};
  assert.equal((await api(db,credential,'dashboard-requests',{task:'Tâche explicitement demandée'})).status,403);
  await db.exec("INSERT INTO users(name,email,password,role) VALUES('Autre admin','other@example.test','test','admin')");
  await assert.rejects(db.transaction(tx=>updateCredential(tx,{...change,actor:2})),/ADMIN_REQUIRED/);
  await assert.rejects(db.transaction(tx=>updateCredential(tx,{...change,actor:3})),/CREDENTIAL_NOT_EDITABLE/);
  await assert.rejects(db.transaction(tx=>updateCredential(tx,{...change,permissions:['unknown']})),/INVALID_SCOPES/);
  await assert.rejects(db.transaction(tx=>updateCredential(tx,{...change,properties:[1]})),/ADMIN_DASHBOARD_REQUIRES_ALL_PROPERTIES/);
  await assert.rejects(db.transaction(tx=>updateCredential(tx,{...change,expiresAt:'2000-01-01'})),/INVALID_EXPIRY/);
  assert.deepEqual((await db.query('SELECT scopes FROM integration_credentials WHERE id=$1',[credential.id])).rows[0].scopes,['properties:read']);
  await db.transaction(tx=>updateCredential(tx,change));
  const stored=(await db.query('SELECT * FROM integration_credentials WHERE id=$1',[credential.id])).rows[0];
  assert.equal(stored.token_hash,digest(credential.token));assert.equal(stored.created_by,1);assert.deepEqual(stored.scopes,scopes);
  assert.equal((await (await api(db,credential,'properties')).json()).properties.length,2);
  const approved=await (await api(db,credential,'dashboard-requests',{task:'Tâche autorisée personnellement'})).json();
  assert.equal((await api(db,credential,'dashboard-session',{request_id:approved.request_id})).status,403);
  await db.transaction(tx=>approveDashboard(tx,approved.request_id,1));
  assert.equal((await api(db,credential,'dashboard-session',{request_id:approved.request_id})).status,200);
  const pending=await (await api(db,credential,'dashboard-requests',{task:'Autre tâche à reconfirmer'})).json();
  await db.transaction(tx=>approveDashboard(tx,pending.request_id,1));
  await db.transaction(tx=>updateCredential(tx,{...change,permissions:['properties:read'],properties:[2]}));
  assert.equal((await db.query('SELECT count(*)::int n FROM sessions WHERE integration_credential_id=$1',[credential.id])).rows[0].n,0);
  assert.equal((await (await api(db,credential,'properties')).json()).properties[0].id,2);
  assert.equal((await api(db,credential,'report?year=2026')).status,403);
  await db.transaction(tx=>updateCredential(tx,change));
  assert.equal((await api(db,credential,'dashboard-session',{request_id:pending.request_id})).status,410);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
  await db.transaction(tx=>revokeCredential(tx,credential.id,1));
  await assert.rejects(db.transaction(tx=>updateCredential(tx,change)),/CREDENTIAL_NOT_EDITABLE/);
 }finally{await db.close();}
});
test('Accès Hermes autonome : clé sans expiration, aucune validation web, session durable et révocation immédiate',async()=>{
 const db=await fixture();try{
  const token=newCredential();const {id}=await db.transaction(tx=>registerCredential(tx,{name:'Hermes permanent fictif',createdBy:1,permissions:['properties:read','dashboard:direct'],properties:null,expiresAt:null,tokenHash:digest(token)}));
  const c={id,token},read=await key(db);
  assert.equal((await db.query('SELECT expires_at FROM integration_credentials WHERE id=$1',[id])).rows[0].expires_at,null);
  assert.equal((await api(db,c,'properties')).status,200);
  assert.equal((await api(db,read,'dashboard-session',{task:'Tâche demandée',confirmed:true})).status,403);
  assert.equal((await api(db,c,'dashboard-session',{task:'Tâche demandée',confirmed:false})).status,400);
  const r=await api(db,c,'dashboard-session',{task:'Gérer le séjour fictif demandé sur le canal privé',confirmed:true});assert.equal(r.status,200);
  const body=await r.json();assert.equal(body.persistent,true);assert.equal(body.expires_at,null);
  assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/Secure/);assert.doesNotMatch(r.headers.get('set-cookie'),/Max-Age=600/);
  assert.equal((await db.query("SELECT expires='infinity'::timestamptz AS permanent FROM sessions WHERE integration_credential_id=$1",[id])).rows[0].permanent,true);
  assert.equal(await countGrants(db),0);
  assert.equal((await api(db,c,'dashboard-session',{task:'Reconnexion demandée',confirmed:true})).status,200);
  assert.equal((await db.query('SELECT count(*)::int n FROM sessions WHERE integration_credential_id=$1',[id])).rows[0].n,1);
  await db.transaction(tx=>revokeCredential(tx,id,1));
  assert.equal((await api(db,c,'properties')).status,401);assert.equal((await db.query('SELECT count(*)::int n FROM sessions WHERE integration_credential_id=$1',[id])).rows[0].n,0);
 }finally{await db.close();}
});
async function countGrants(db){return (await db.query('SELECT count(*)::int n FROM integration_dashboard_grants')).rows[0].n;}

test('Deux Hermes : consultations authentifiées, clés et sessions indépendantes, révocation séparée',async()=>{
 const db=await fixture();try{
  const first=await key(db,['properties:read','dashboard:direct']);
  assert.equal((await api(db,first,'dashboard-session',{task:'Consultation fictive pour le premier agent',confirmed:true})).status,200);
  const firstRecord=JSON.stringify((await db.query('SELECT * FROM integration_credentials WHERE id=$1',[first.id])).rows);
  const firstSessions=JSON.stringify((await db.query('SELECT * FROM sessions WHERE integration_credential_id=$1',[first.id])).rows);
  const token=newCredential(),secondRecord=await db.transaction(tx=>registerCredential(tx,{name:'Hermes 2',createdBy:1,permissions:[...readScopes,'reservations:create','expenses:create','dashboard:direct'],properties:null,expiresAt:null,tokenHash:digest(token)}));
  const second={...secondRecord,token};assert.notEqual(first.token,second.token);
  for(const c of [first,second]){const r=await api(db,c,'properties');assert.equal(r.status,200);assert.equal((await r.json()).properties.length,2);}
  for(let i=0;i<2;i++)assert.equal((await api(db,second,'dashboard-session',{task:'Consultation fictive pour Hermes 2',confirmed:true})).status,200);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM integration_credentials WHERE id=$1',[first.id])).rows),firstRecord);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM sessions WHERE integration_credential_id=$1',[first.id])).rows),firstSessions);
  await db.transaction(tx=>revokeCredential(tx,second.id,1));
  assert.equal((await api(db,second,'properties')).status,401);assert.equal((await api(db,first,'properties')).status,200);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM sessions WHERE integration_credential_id=$1',[first.id])).rows),firstSessions);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n,0);
 }finally{await db.close();}
});

test('Migration Hermes : répétable et aucune modification des écritures ou des anciennes permissions',async()=>{
 const db=await fixture();try{
  const c=await key(db,['properties:read'],[1]);
  await db.exec("INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,description,amount,source_sheet,activity) VALUES(1,'depense',2026,1,'Document financier fictif conservé',9900,'Original fictif','Autre')");
  const before=await facts(db),beforeAccess=JSON.stringify((await db.query('SELECT * FROM integration_credentials WHERE id=$1',[c.id])).rows);
  for(let i=0;i<2;i++)assert.equal((await db.transaction(migrateIntegration)).initialized,true);
  assert.equal(await facts(db),before);assert.equal(JSON.stringify((await db.query('SELECT * FROM integration_credentials WHERE id=$1',[c.id])).rows),beforeAccess);
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='integration_operations'::regclass")).rows[0].relrowsecurity,true);
 }finally{await db.close();}
 const empty=new PGlite();try{assert.equal((await empty.transaction(migrateIntegration)).initialized,false);}finally{await empty.close();}
});
