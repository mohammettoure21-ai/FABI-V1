import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {createServer} from 'pglite-server';

test('Site complet : connexion, contacts, appartements, réservations et droits employés', {timeout:90000},async()=>{
 const db=new PGlite({extensions:{btree_gist}});
 const postgres=createServer(db);await new Promise(resolve=>postgres.listen(0,'127.0.0.1',resolve));
 const port=postgres.address().port,origin='http://127.0.0.1:3012';
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3012'],{env:{...process.env,DATABASE_URL:`postgresql://test:test@127.0.0.1:${port}/test`,NEXT_TELEMETRY_DISABLED:'1',FABI_SETUP_TOKEN:'installation-fictive-32-caracteres-minimum'},stdio:['ignore','pipe','pipe']});
 let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
 let cookie='';
 async function get(path){return fetch(origin+path,{redirect:'manual',headers:{cookie}});}
 async function submit(path,marker,data){const page=await get(path);const html=await page.text();const forms=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(m=>m[1]);const form=forms.find(f=>f.includes('name="'+marker+'"'));assert.ok(form,'Formulaire absent : '+marker+' '+html.slice(0,120));const fields=new FormData();for(const match of form.matchAll(/<input[^>]*name="(\$ACTION_[^"]+)"([^>]*)>/g))fields.set(match[1],(match[2].match(/value="([^"]*)"/)?.[1]??'').replaceAll('&quot;','"').replaceAll('&amp;','&'));for(const [key,value] of Object.entries(data))fields.set(key,value);const response=await fetch(origin+path,{method:'POST',body:fields,redirect:'manual',headers:{cookie,origin}});const newCookie=response.headers.get('set-cookie');if(newCookie)cookie=newCookie.split(';')[0];assert.equal(response.status,303,'Échec action : '+await response.text()+'\n'+output+'\n'+form.slice(0,600));return response.headers.get('location');}
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await get('/connexion')).status===200){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,output);
  assert.equal((await get('/clients')).status,307);
  assert.match(await submit('/installation','setup_token',{setup_token:'incorrect',name:'Admin fictif',email:'admin@example.test',password:'UnMotDePasseFictif123!'}),/erreur=/);
  assert.match(await submit('/installation','setup_token',{setup_token:'installation-fictive-32-caracteres-minimum',name:'Admin fictif',email:'admin@example.test',password:'UnMotDePasseFictif123!'}),/succes=/);
  assert.match(await submit('/installation','setup_token',{setup_token:'installation-fictive-32-caracteres-minimum',name:'Intrus',email:'intrus@example.test',password:'UnMotDePasseFictif123!'}),/erreur=/);
  assert.equal(await submit('/connexion','email',{email:'admin@example.test',password:'UnMotDePasseFictif123!'}),'/');
  assert.equal((await get('/')).status,200);
  await submit('/equipe','name',{name:'Employé fictif',email:'employee@example.test',password:'UnMotDePasseFictif123!',role:'employee'});
  await submit('/clients','name',{name:'Client fictif',phone:'+221000000000',email:'client@example.test',status:'Nouveau',notes:'Test sans données réelles'});
  assert.match(await (await get('/clients')).text(),/Client fictif/);
  assert.match(await submit('/clients','name',{name:'Doublon',phone:'+221000000000',email:'',status:'Nouveau'}),/erreur=/);
  await submit('/appartements','reference',{reference:'FICTIF',name:'Appartement fictif',neighborhood:'Quartier fictif',category:'F2',bedrooms:'1',nightly:'10000',status:'Disponible'});
  assert.match(await (await get('/appartements')).text(),/Appartement fictif/);
  await db.exec("INSERT INTO finance_imports(fingerprint,filename,reporting_year,source_data,notes) VALUES('fake','fictif.xlsx',2026,'{}','[\"Contrôle fictif\"]'); INSERT INTO finance_entries(import_id,property_id,kind,reporting_year,reporting_month,description,amount,source_sheet,source_row) VALUES(1,1,'recette',2026,5,'Recette fictive',1000,'Test',1),(1,1,'loyer',2026,5,'Loyer fictif',300,'Test',2)");
  assert.match(await (await get('/finances')).text(),/Recette fictive/);
  assert.doesNotMatch(await (await get('/finances?mois=6')).text(),/Recette fictive/);
  assert.match(await submit('/finances','monthly_rent',{property_id:'1',amount:'250'}),/succes=/);
  assert.equal(Number((await db.query('SELECT amount FROM property_monthly_rents WHERE property_id=1')).rows[0].amount),250);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,2);

  const booking={client_id:'1',property_id:'1',arrival:'2026-12-10',departure:'2026-12-12',guests:'2',nightly:'10000',status:'Confirmée',source:'Direct'};
  assert.match(await submit('/reservations','client_id',booking),/succes=/);
  assert.match(await submit('/reservations','client_id',{...booking,arrival:'2026-12-11',departure:'2026-12-13'}),/erreur=/);
  assert.match(await submit('/reservations','client_id',{...booking,arrival:'2026-12-12',departure:'2026-12-14'}),/succes=/);
  await submit('/reservations','id',{id:'1'});
  assert.equal((await db.query('SELECT status FROM reservations WHERE id=1')).rows[0].status,'Annulée');
  assert.match(await submit('/reservations','client_id',{...booking,client_id:'',property_id:'',source:'Agent',guest_label:'Inconnu',agent_name:'Agent fictif',property_label:'À préciser'}),/succes=/);
  assert.match(await (await get('/reservations')).text(),/Agent fictif/);
  const cleaningKey=randomUUID();
  const cleaning={kind:'depense',cleaning:'1',date:'2026-05-11',property_id:'1',provider:'Ménagère fictive',quantity:'1',request_key:cleaningKey};
  assert.match(await submit('/finances?onglet=menage','request_key',cleaning),/succes=/);
  assert.match(await submit('/finances?onglet=menage','request_key',cleaning),/succes=/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM finance_entries WHERE activity='Ménage'")).rows[0].n,1);
  assert.equal(Number((await db.query("SELECT amount FROM finance_entries WHERE activity='Ménage'")).rows[0].amount),5000);
  assert.match(await (await get('/finances?onglet=menage')).text(),/Ménagère fictive/);
  const cleaningId=(await db.query("SELECT id FROM finance_entries WHERE activity='Ménage'")).rows[0].id;
  await submit('/finances?onglet=menage','entry_id',{entry_id:String(cleaningId)});
  assert.equal((await db.query('SELECT payment_status FROM finance_entries WHERE id=$1',[cleaningId])).rows[0].payment_status,'Payé');
  const commission={kind:'commission',activity:'Chauffeur',date:'2026-05-12',property_id:'',description:'Transfert fictif',amount:'8000',provider:'Chauffeur fictif',request_key:randomUUID()};
  assert.match(await submit('/finances?onglet=commissions','request_key',commission),/succes=/);
  assert.match(await (await get('/finances?onglet=commissions')).text(),/Chauffeur fictif/);
  assert.match(await submit('/finances?onglet=depenses','request_key',{...commission,kind:'depense',activity:'Wifi',amount:'14900',request_key:randomUUID()}),/succes=/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,5);
  cookie='';await submit('/connexion','email',{email:'employee@example.test',password:'UnMotDePasseFictif123!'});
  assert.equal((await get('/equipe')).status,307);
  assert.equal((await get('/finances')).status,307);
  assert.doesNotMatch(await (await get('/clients')).text(),/Client fictif/);
  assert.doesNotMatch(await (await get('/reservations')).text(),/Client fictif/);
  assert.doesNotMatch(await (await get('/appartements')).text(),/name="reference"/);
  // Un employé ne doit pas pouvoir réutiliser une action de l’administrateur.
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM reservations')).rows[0].n,3);
  assert.ok((await db.query('SELECT COUNT(*)::int AS n FROM audit')).rows[0].n>=5);
 }finally{server.kill();await new Promise(resolve=>server.once('exit',resolve));postgres.close();await db.close();}
});
