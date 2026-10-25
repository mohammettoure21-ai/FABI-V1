import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {registerCredential,revokeCredential,newCredential,digest,readScopes,scopes} from '../lib/integration/auth.mjs';
import {integrationHandler} from '../lib/integration/handler.mjs';
import {approveDashboard} from '../lib/integration/dashboard.mjs';
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
