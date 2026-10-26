import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {createServer} from 'pglite-server';
import {schema} from '../lib/schema.mjs';
import {registerCredential,newCredential,digest,scopes} from '../lib/integration/auth.mjs';
import {hashPassword} from '../lib/security.mjs';
async function run(args,env){return new Promise(resolve=>{const p=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);p.on('exit',code=>resolve({code,output}));});}
test('Hermes HTTP local et MCP : lecture, ajouts confirmés, accès autonome durable, migration et révocation', {timeout:120000},async()=>{
 const db=new PGlite({extensions:{btree_gist}});await db.exec(schema);
 await db.query("INSERT INTO users(name,email,password,role) VALUES('Admin fictif','admin@example.test',$1,'admin'),('Employé fictif','employee@example.test',$1,'employee')",[hashPassword('UnMotDePasseFictif123!')]);
 await db.exec("INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('FAKE','Appartement fictif','Fictif','F2',1,0,'Disponible')");
 const token=newCredential(),registered=await db.transaction(tx=>registerCredential(tx,{name:'Hermes fictif',createdBy:1,permissions:scopes,expiresAt:new Date(Date.now()+30*86400000).toISOString(),tokenHash:digest(token)}));
 const postgres=createServer(db);await new Promise(resolve=>postgres.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:3014',env={...process.env,DATABASE_URL:`postgresql://test:test@127.0.0.1:${postgres.address().port}/test`,POSTGRES_URL:'',VERCEL:'',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',NEXT_TELEMETRY_DISABLED:'1',FABI_INTEGRATION_ENABLED:'true',FABI_INTEGRATION_WRITES_ENABLED:'true'};
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3014'],{env,stdio:['ignore','pipe','pipe']});let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);let cookie='';const temp=await mkdtemp(join(tmpdir(),'fabi-access-'));
 async function api(path,body){return fetch(origin+'/api/integration/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
 async function formAction(path,marker,data,useCookie=cookie){const html=await (await fetch(origin+path,{headers:{cookie}})).text();const form=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(m=>m[1]).find(f=>f.includes('name="'+marker+'"'));assert.ok(form,'Formulaire introuvable : '+marker);const fields=new FormData();for(const match of form.matchAll(/<input[^>]*name="(\$ACTION_[^"]+)"([^>]*)>/g))fields.set(match[1],match[2].match(/value="([^"]*)"/)?.[1]??'');for(const [k,v] of Object.entries(data)){if(Array.isArray(v))for(const item of v)fields.append(k,item);else fields.set(k,v);}const response=await fetch(origin+path,{method:'POST',headers:{cookie:useCookie,origin},body:fields,redirect:'manual'});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return response;}
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/connexion')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
  assert.equal((await api('report?year=2026')).status,200);assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM reservation_reminders')).rows[0].n,0);
  const grant=await (await api('dashboard-requests',{task:'Créer un contact fictif après vérification du récapitulatif'})).json();
  assert.equal((await api('dashboard-session',{request_id:grant.request_id})).status,403);
  await formAction('/connexion','email',{email:'admin@example.test',password:'UnMotDePasseFictif123!'});
  assert.equal((await formAction('/integrations','request_id',{request_id:grant.request_id})).status,303);
  const redeemed=await api('dashboard-session',{request_id:grant.request_id});assert.equal(redeemed.status,200);
  const hermesCookie=redeemed.headers.get('set-cookie').split(';')[0];assert.doesNotMatch(await redeemed.text(),new RegExp(hermesCookie.split('=')[1]));
  const dashboard=await fetch(origin+'/',{headers:{cookie:hermesCookie}});assert.equal(dashboard.status,200);assert.match(await dashboard.text(),/Hermes/);
  const deniedTeam=await fetch(origin+'/equipe',{headers:{cookie:hermesCookie},redirect:'manual'});assert.equal(deniedTeam.status,307);assert.equal(deniedTeam.headers.get('location'),'/');
  assert.equal((await fetch(origin+'/integrations',{headers:{cookie:hermesCookie}})).status,500);
  const second=await (await api('dashboard-requests',{task:'Deuxième tâche à confirmer par la personne'})).json();
  assert.equal((await formAction('/integrations','request_id',{request_id:second.request_id},hermesCookie)).status,500);
  assert.equal((await db.query('SELECT approved_at FROM integration_dashboard_grants WHERE id=$1',[second.request_id])).rows[0].approved_at,null);
  const deniedAccount=await formAction('/equipe','name',{name:'Compte refusé',email:'refuse@example.test',password:'AutreMotDePasseFictif123!',role:'admin'},hermesCookie);assert.equal(deniedAccount.status,303);assert.match(deniedAccount.headers.get('location'),/erreur=/);
  await formAction('/clients','name',{name:'Contact Hermes fictif',phone:'+221000000001',status:'Nouveau',contact_type:'client'},hermesCookie);
  assert.equal((await db.query("SELECT count(*)::int n FROM clients WHERE name='Contact Hermes fictif'")).rows[0].n,1);
  assert.equal((await db.query("SELECT integration_credential_id FROM audit WHERE action='Création client'")).rows[0].integration_credential_id,registered.id);
  // Generate a new private key locally; only its fingerprint is printed.
  const file=join(temp,'existing.key');await writeFile(file,'KEEP THIS FILE',{mode:0o600});
  const collision=await run(['scripts/hermes-key.mjs',file],env);assert.equal(collision.code,1);assert.equal(await readFile(file,'utf8'),'KEEP THIS FILE');
  const newFile=join(temp,'new.key');const created=await run(['scripts/hermes-key.mjs',newFile],env);assert.equal(created.code,0,created.output);const privateToken=(await readFile(newFile,'utf8')).trim();assert.doesNotMatch(created.output,new RegExp(privateToken));
  const expires=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  assert.equal((await formAction('/integrations','fingerprint',{name:'Nouvel accès fictif',fingerprint:digest(privateToken),expires,all_properties:'1',scopes:['properties:read','reservations:read']})).status,303);
  const existing=(await db.query('SELECT id FROM integration_credentials WHERE token_hash=$1',[digest(privateToken)])).rows[0];
  const edit={edit_credential_id:String(existing.id),expires,permanent:'1',all_properties:'1',scopes};
  assert.equal((await formAction('/integrations','edit_credential_id',edit,hermesCookie)).status,500);
  assert.deepEqual((await db.query('SELECT scopes FROM integration_credentials WHERE id=$1',[existing.id])).rows[0].scopes,['properties:read','reservations:read']);
  const changed=await formAction('/integrations','edit_credential_id',edit);assert.equal(changed.status,303);assert.match(changed.headers.get('location'),/succes=/);
  const changedAccess=(await db.query('SELECT token_hash,scopes,expires_at FROM integration_credentials WHERE id=$1',[existing.id])).rows[0];
  assert.equal(changedAccess.token_hash,digest(privateToken));assert.deepEqual(changedAccess.scopes,scopes);assert.equal(changedAccess.expires_at,null);
  const allowed=await fetch(origin+'/api/integration/dashboard-requests',{method:'POST',headers:{Authorization:'Bearer '+privateToken,'Content-Type':'application/json'},body:JSON.stringify({task:'Modification demandée après élargissement personnel'})});
  assert.equal(allowed.status,200);
  const newRequest=await allowed.json();
  assert.equal((await fetch(origin+'/api/integration/dashboard-session',{method:'POST',headers:{Authorization:'Bearer '+privateToken,'Content-Type':'application/json'},body:JSON.stringify({request_id:newRequest.request_id})})).status,403);
  const input=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'fabi_properties',arguments:{}}},
   {jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'fabi_prepare_reservation',arguments:{property_id:1,guest_name:'Voyageur WhatsApp fictif',arrival:'2027-03-09',departure:'2027-03-11',guests:2,nightly:null,status:'Confirmée',source:'Direct'}}},
   {jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'fabi_prepare_expense',arguments:{property_id:1,date:'2027-03-09',description:'Frais WhatsApp fictifs',amount:500,activity:'Autre'}}}];
  const bridge=spawn(process.execPath,['scripts/hermes-mcp.mjs'],{env:{...env,FABI_CRM_URL:origin,FABI_CRM_ALLOW_LOCAL:'true',FABI_CRM_KEY_FILE:newFile},stdio:['pipe','pipe','pipe']});let bridgeOutput='';bridge.stdout.on('data',d=>bridgeOutput+=d);bridge.stdin.end(input.map(x=>JSON.stringify(x)).join('\n')+'\n');await new Promise(r=>bridge.on('exit',r));
  const messages=bridgeOutput.trim().split('\n').map(x=>JSON.parse(x));assert.equal(messages.length,5);assert.equal(messages[2].result.isError,undefined);assert.doesNotMatch(bridgeOutput,new RegExp(privateToken));
  const operations=messages.slice(3).map(m=>{assert.equal(m.result.isError,undefined,JSON.stringify(m.result));return JSON.parse(m.result.content[0].text).operation_id;});
  assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
  const directStateFile=join(temp,'autonomous-state.json');
  const executeInput=[...operations,operations[1]].map((id,i)=>({jsonrpc:'2.0',id:10+i,method:'tools/call',params:{name:'fabi_execute_operation',arguments:{operation_id:id,confirmed:true}}}));
  executeInput.push({jsonrpc:'2.0',id:20,method:'tools/call',params:{name:'fabi_open_dashboard',arguments:{task:'Continuer dans le CRM après accord du propriétaire',confirmed:true}}});
  const executor=spawn(process.execPath,['scripts/hermes-mcp.mjs'],{env:{...env,FABI_CRM_URL:origin,FABI_CRM_ALLOW_LOCAL:'true',FABI_CRM_KEY_FILE:newFile,FABI_HERMES_BROWSER_STATE_FILE:directStateFile},stdio:['pipe','pipe','pipe']});let executeOutput='';executor.stdout.on('data',d=>executeOutput+=d);executor.stdin.end(executeInput.map(x=>JSON.stringify(x)).join('\n')+'\n');await new Promise(r=>executor.on('exit',r));
  const executed=executeOutput.trim().split('\n').map(x=>JSON.parse(x));assert.equal(executed.length,4);for(const m of executed)assert.equal(m.result.isError,undefined,JSON.stringify(m.result));
  assert.equal(JSON.parse(executed[2].result.content[0].text).already_executed,true);
  assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,1);
  const preservedFinance=JSON.stringify((await db.query('SELECT * FROM finance_entries ORDER BY id')).rows);
  const upgrade=await run(['scripts/migrate-integration.mjs'],env);assert.equal(upgrade.code,0,upgrade.output);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM finance_entries ORDER BY id')).rows),preservedFinance);
  const directState=JSON.parse(await readFile(directStateFile,'utf8'));assert.equal(directState.cookies[0].expires,-1);assert.doesNotMatch(executeOutput,new RegExp(directState.cookies[0].value));
  const directCookie='fabi_session='+directState.cookies[0].value;
  for(const path of ['/','/clients','/appartements','/reservations','/messages','/finances','/depenses','/passages','/menage']){
   const response=await fetch(origin+path,{headers:{cookie:directCookie}});assert.equal(response.status,200,path);
   const html=await response.text();assert.doesNotMatch(html,/href="\/(?:equipe|integrations)"/,path);
  }
  const directTeam=await fetch(origin+'/equipe',{headers:{cookie:directCookie},redirect:'manual'});assert.equal(directTeam.status,307);assert.equal(directTeam.headers.get('location'),'/');
  const humanTeam=await fetch(origin+'/equipe',{headers:{cookie},redirect:'manual'});assert.equal(humanTeam.status,200);assert.match(await humanTeam.text(),/Équipe &amp; accès/);
  const accountsBefore=(await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
  const createDenied=await formAction('/equipe','name',{name:'Interdit pour Hermes',email:'denied@example.test',password:'MotDePasseFictifInterdit123!',role:'admin'},directCookie);assert.match(createDenied.headers.get('location'),/erreur=/);
  const toggleDenied=await formAction('/equipe','id',{id:'2'},directCookie);assert.match(toggleDenied.headers.get('location'),/erreur=/);
  assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,accountsBefore);assert.equal((await db.query('SELECT active FROM users WHERE id=2')).rows[0].active,true);
  const sent=await formAction('/messages','message_key',{message_key:randomUUID(),recipient_id:'2',message:'Message interne fictif demandé à Hermes'},directCookie);assert.equal(sent.status,303);assert.match(sent.headers.get('location'),/succes=/);
  assert.equal((await db.query('SELECT count(*)::int n FROM team_messages WHERE body=$1',['Message interne fictif demandé à Hermes'])).rows[0].n,1);
  assert.equal((await db.query("SELECT integration_credential_id FROM audit WHERE action='Message envoyé à 1 collaborateur(s)' ORDER BY id DESC LIMIT 1")).rows[0].integration_credential_id,existing.id);
  const directCreated=await formAction('/clients','name',{name:'Contact autonome fictif',phone:'+221000000002',status:'Nouveau',contact_type:'client'},directCookie);
  assert.equal(directCreated.status,303);assert.equal((await db.query("SELECT count(*)::int n FROM clients WHERE name='Contact autonome fictif'")).rows[0].n,1);
  assert.equal((await fetch(origin+'/integrations',{headers:{cookie:directCookie},redirect:'manual'})).status,500);
  await formAction('/integrations','request_id',{request_id:second.request_id});
  const fullKeyFile=join(temp,'full.key'),stateFile=join(temp,'browser-state.json');await writeFile(fullKeyFile,token+'\n',{mode:0o600});
  const sessionInput=[{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'fabi_open_dashboard',arguments:{request_id:second.request_id}}}];
  const opener=spawn(process.execPath,['scripts/hermes-mcp.mjs'],{env:{...env,FABI_CRM_URL:origin,FABI_CRM_ALLOW_LOCAL:'true',FABI_CRM_KEY_FILE:fullKeyFile,FABI_HERMES_BROWSER_STATE_FILE:stateFile},stdio:['pipe','pipe','pipe']});let sessionOutput='';opener.stdout.on('data',d=>sessionOutput+=d);opener.stdin.end(sessionInput.map(x=>JSON.stringify(x)).join('\n')+'\n');await new Promise(r=>opener.on('exit',r));
  const opened=JSON.parse(sessionOutput.trim());assert.equal(opened.result.isError,undefined,sessionOutput);
  const state=JSON.parse(await readFile(stateFile,'utf8'));assert.equal(state.cookies[0].httpOnly,true);assert.doesNotMatch(sessionOutput,new RegExp(state.cookies[0].value));
  assert.equal((await fetch(origin+'/clients',{headers:{cookie:'fabi_session='+state.cookies[0].value},redirect:'manual'})).status,200);
  await formAction('/integrations','credential_id',{credential_id:String(registered.id)});
  assert.equal((await api('properties')).status,401);
  assert.equal((await fetch(origin+'/clients',{headers:{cookie:hermesCookie},redirect:'manual'})).status,307);
  assert.equal((await fetch(origin+'/clients',{headers:{cookie},redirect:'manual'})).status,200);
  await formAction('/integrations','credential_id',{credential_id:String(existing.id)});
  assert.equal((await fetch(origin+'/clients',{headers:{cookie:directCookie},redirect:'manual'})).status,307);
 }finally{server.kill();await new Promise(r=>server.once('exit',r));postgres.close();await db.close();await rm(temp,{recursive:true,force:true});}
});
