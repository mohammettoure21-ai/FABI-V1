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
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3012'],{env:{...process.env,DATABASE_URL:`postgresql://test:test@127.0.0.1:${port}/test`,NEXT_TELEMETRY_DISABLED:'1',FABI_SETUP_TOKEN:'installation-fictive-32-caracteres-minimum',CRON_SECRET:'cron-local-fictif-pour-les-tests'},stdio:['ignore','pipe','pipe']});
 let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
 let cookie='';const captured=new Map();
 async function get(path){return fetch(origin+path,{redirect:'manual',headers:{cookie}});}
 async function submit(path,marker,data){const page=await get(path);const html=await page.text();const forms=[...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map(m=>m[1]);const form=forms.find(f=>f.includes('name="'+marker+'"'));assert.ok(form,'Formulaire absent : '+marker+' '+html.slice(0,120));const fields=new FormData();for(const match of form.matchAll(/<input[^>]*name="(\$ACTION_[^"]+)"([^>]*)>/g))fields.set(match[1],(match[2].match(/value="([^"]*)"/)?.[1]??'').replaceAll('&quot;','"').replaceAll('&amp;','&'));for(const [key,value] of Object.entries(data))fields.set(key,value);captured.set(marker,{path,fields:[...fields.entries()]});const response=await fetch(origin+path,{method:'POST',body:fields,redirect:'manual',headers:{cookie,origin}});const newCookie=response.headers.get('set-cookie');if(newCookie)cookie=newCookie.split(';')[0];assert.equal(response.status,303,'Échec action : '+await response.text()+'\n'+output+'\n'+form.slice(0,600));return response.headers.get('location');}
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
  const propertiesPage=await (await get('/appartements')).text();
  assert.match(propertiesPage,/Appartement fictif/);
  assert.ok(propertiesPage.indexOf('Les appartements')<propertiesPage.indexOf('Ajouter un appartement'));
  assert.equal((await get('/api/calendars/sync')).status,401);
  const cron=await fetch(origin+'/api/calendars/sync',{headers:{authorization:'Bearer cron-local-fictif-pour-les-tests'}});
  assert.equal(cron.status,200);assert.deepEqual(await cron.json(),{synchronized:0,failed:0});
  assert.match(await submit('/reservations','calendar_property_id',{calendar_property_id:'1',provider:'Airbnb',calendar_url:'https://127.0.0.1/calendar/ical/fake.ics'}),/erreur=/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM calendar_connections')).rows[0].n,0);
  await db.exec("INSERT INTO finance_imports(fingerprint,filename,reporting_year,source_data,notes) VALUES('fake','fictif.xlsx',2026,'{}','[\"Contrôle fictif\"]'); INSERT INTO finance_entries(import_id,property_id,kind,reporting_year,reporting_month,description,amount,source_sheet,source_row) VALUES(1,1,'recette',2026,5,'Recette fictive',1000,'Test',1),(1,1,'loyer',2026,5,'Loyer fictif',300,'Test',2)");
  assert.match(await (await get('/finances')).text(),/Recette fictive/);
  assert.doesNotMatch(await (await get('/finances')).text(),/Loyers enregistrés/);
  assert.doesNotMatch(await (await get('/finances?bien=fabi')).text(),/Recette fictive/);
  assert.match(await (await get('/finances?bien=1')).text(),/Recette fictive/);
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
  const edit={stay_id:'1',edit_arrival:'2026-12-08',edit_departure:'2026-12-10',edit_property_id:'1',edit_status:'Confirmée',price_mode:'total',price:'70000',expected_commission:'7000'};
  assert.match(await submit('/reservations?modifier=1','stay_id',edit),/succes=/);
  assert.equal(Number((await db.query('SELECT agreed_total FROM reservations WHERE id=1')).rows[0].agreed_total),70000);
  assert.match(await submit('/reservations?modifier=1','stay_id',{...edit,edit_arrival:'2026-12-13',edit_departure:'2026-12-15'}),/erreur=/);
  assert.equal(new Date((await db.query('SELECT arrival FROM reservations WHERE id=1')).rows[0].arrival).toISOString().slice(0,10),'2026-12-08');

  assert.match(await submit('/reservations','client_id',{...booking,client_id:'',property_id:'',source:'Agent',guest_label:'Inconnu',agent_name:'Agent fictif',property_label:'À préciser'}),/succes=/);
  const reservationPage=await (await get('/reservations')).text();
  assert.match(reservationPage,/Agent fictif/);
  assert.ok(reservationPage.indexOf('Vos réservations')<reservationPage.indexOf('<h2>Nouvelle réservation'));
  assert.match(reservationPage,/Calendriers Airbnb/);
  assert.ok(reservationPage.indexOf('Calendrier des réservations')<reservationPage.indexOf('Vos réservations'));
  assert.match(reservationPage,/stay-bar/);
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
  const dashboard=(await (await get('/?annee=2026')).text()).replace(/<!--.*?-->/g,'');
  assert.match(dashboard,/Revenus FABI/);
  assert.match(dashboard,/Revenus mensuels de FABI/);
  assert.doesNotMatch(dashboard,/Prospects actifs|Contacts enregistrés/);
  assert.match(dashboard,/Appartements actifs/);
  const propertyDashboard=await (await get('/?annee=2026&vue=bien-1')).text();
  assert.match(propertyDashboard,/Recettes locatives/);
  assert.doesNotMatch(propertyDashboard,/Appartements actifs/);
  assert.match(propertyDashboard,/Prévisionnel des nuits/);
  assert.match(propertyDashboard,/Revenus mensuels de Appartement fictif/);
  assert.match(await submit('/finances?onglet=depenses','request_key',{...commission,kind:'depense',activity:'Wifi',amount:'14900',request_key:randomUUID()}),/succes=/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,5);
  await db.exec("INSERT INTO calendar_connections(property_id,provider,calendar_url,url_hash,assigned_to) VALUES(1,'Airbnb','https://www.airbnb.com/calendar/ical/fictif.ics','fictif',1); INSERT INTO reservations(property_id,arrival,departure,guests,nightly,status,source,assigned_to,guest_label,calendar_connection_id,external_uid,calendar_arrival,calendar_departure) VALUES(1,'2027-01-10','2027-01-12',NULL,NULL,'Confirmée','Airbnb',1,'Reserved',1,'fictif','2027-01-10','2027-01-12')");
  const importedId=(await db.query("SELECT id FROM reservations WHERE external_uid='fictif'")).rows[0].id;
  assert.match(await submit('/reservations?modifier='+importedId,'stay_id',{stay_id:String(importedId),edit_arrival:'2027-01-11',edit_departure:'2027-01-13',price_mode:'total',price:'80000',expected_commission:'8000'}),/succes=/);
  const importedPrice=(await db.query('SELECT agreed_total,local_dates_override FROM reservations WHERE id=$1',[importedId])).rows[0];
  assert.equal(Number(importedPrice.agreed_total),80000);assert.equal(importedPrice.local_dates_override,true);
  await submit('/reservations?modifier='+importedId,'restore_dates',{stay_id:String(importedId)});
  assert.equal((await db.query('SELECT local_dates_override FROM reservations WHERE id=$1',[importedId])).rows[0].local_dates_override,false);
  assert.equal(Number((await db.query('SELECT agreed_total FROM reservations WHERE id=$1',[importedId])).rows[0].agreed_total),80000);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM finance_entries')).rows[0].n,5);
  await db.exec("UPDATE reservations SET calendar_event_kind='blocked' WHERE external_uid='fictif'");
  assert.match(await (await get('/reservations?modifier='+importedId)).text(),/name="price"/);
  assert.match(await submit('/reservations?modifier='+importedId,'stay_id',{stay_id:String(importedId),edit_arrival:'2027-01-10',edit_departure:'2027-01-12',price_mode:'total',price:'80000',confirm_reservation:'1'}),/succes=/);
  assert.equal((await db.query('SELECT local_reservation_override FROM reservations WHERE id=$1',[importedId])).rows[0].local_reservation_override,true);
  await db.query("UPDATE reservations SET arrival='2001-01-01',departure='2001-01-03' WHERE id=$1",[importedId]);
  assert.match(await submit('/finances','payment_stay_id',{payment_stay_id:String(importedId),received:'no'}),/succes=/);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries WHERE reservation_id=$1',[importedId])).rows[0].n,0);
  assert.match(await submit('/finances','payment_stay_id',{payment_stay_id:String(importedId),received:'yes'}),/succes=/);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries WHERE reservation_id=$1',[importedId])).rows[0].n,1);
  await submit('/equipe','name',{name:'Responsable fictif',email:'manager@example.test',password:'UnMotDePasseFictif123!',role:'manager'});
  const messageKey=randomUUID();
  assert.match(await submit('/messages','message',{recipient_id:'2',message:'Préparer ÉCRIN pour le prochain voyageur',message_key:messageKey}),/succes=/);
  await submit('/messages','message',{recipient_id:'2',message:'Préparer ÉCRIN pour le prochain voyageur',message_key:messageKey});
  assert.equal((await db.query('SELECT count(*)::int n FROM team_messages')).rows[0].n,1);
  await submit('/messages','message',{recipient_id:'3',message:'Message réservé au responsable',message_key:randomUUID()});
  const forbidden=['client_id','stay_id','restore_dates','request_key','entry_id','monthly_rent','payment_stay_id','calendar_property_id'].map(key=>captured.get(key)).filter(Boolean);
  const before=JSON.stringify((await db.query('SELECT (SELECT count(*) FROM reservations) AS stays,(SELECT count(*) FROM finance_entries) AS entries,(SELECT count(*) FROM audit WHERE action<>$$Connexion$$) AS audits')).rows);
  for(const role of ['manager','employee']){
   cookie='';await submit('/connexion','email',{email:role+'@example.test',password:'UnMotDePasseFictif123!'});
   const readonly=await (await get('/reservations?modifier='+importedId)).text();
   assert.doesNotMatch(readonly,/name="client_id"|name="stay_id"|name="calendar_url"|href="[^"]*modifier=/);
   assert.doesNotMatch(await (await get('/')).text(),/Nouvelle réservation/);
   const inbox=await (await get('/messages?dest=1')).text();assert.equal((await (await get('/api/messages/unread')).json()).count,1);
   if(role==='employee'){
    assert.match(inbox,/Préparer ÉCRIN/);assert.doesNotMatch(inbox,/Message réservé au responsable/);
    assert.match(await (await get('/reservations')).text(),/Airbnb/);
    assert.doesNotMatch(readonly,/name="price"|name="nightly"|Montant du séjour/);
   }else{assert.match(inbox,/Message réservé au responsable/);assert.doesNotMatch(inbox,/Préparer ÉCRIN/);}
   if(role==='manager'){
    const finance=await (await get('/finances')).text();assert.match(finance,/Consultation des recettes/);
    assert.doesNotMatch(finance,/name="request_key"|name="entry_id"|name="payment_stay_id"|name="monthly_rent"/);
   }
   for(const action of forbidden){const body=new FormData();for(const [key,value] of action.fields)body.set(key,value);const response=await fetch(origin+action.path,{method:'POST',body,redirect:'manual',headers:{cookie,origin}});assert.equal(response.status,500,'Action interdite acceptée pour '+role+' '+action.path);}
  }
  assert.equal(JSON.stringify((await db.query('SELECT (SELECT count(*) FROM reservations) AS stays,(SELECT count(*) FROM finance_entries) AS entries,(SELECT count(*) FROM audit WHERE action<>$$Connexion$$) AS audits')).rows),before);
  cookie='';await submit('/connexion','email',{email:'employee@example.test',password:'UnMotDePasseFictif123!'});
  assert.equal((await get('/equipe')).status,307);
  assert.equal((await get('/finances')).status,307);
  assert.doesNotMatch(await (await get('/')).text(),/Revenus FABI|Revenus mensuels de FABI/);
  assert.doesNotMatch(await (await get('/clients')).text(),/Client fictif/);
  assert.match(await (await get('/reservations')).text(),/Client fictif/);
  assert.doesNotMatch(await (await get('/appartements')).text(),/name="reference"/);
  assert.doesNotMatch(await (await get('/reservations')).text(),/name="calendar_url"/);
  assert.doesNotMatch(await (await get('/reservations?modifier='+importedId)).text(),/name="stay_id"/);
  const received=(await db.query('SELECT id FROM team_messages WHERE recipient_id=2')).rows[0].id;
  await submit('/messages','message_id',{message_id:String(received)});
  assert.ok((await db.query('SELECT read_at FROM team_messages WHERE id=$1',[received])).rows[0].read_at);
  assert.equal((await db.query('SELECT read_at FROM team_messages WHERE recipient_id=3')).rows[0].read_at,null);
  await submit('/messages?dest=1','message',{recipient_id:'1',message:'ÉCRIN est prêt, merci !',message_key:randomUUID()});
  assert.equal((await db.query('SELECT count(*)::int n FROM team_messages WHERE sender_id=2 AND recipient_id=1')).rows[0].n,1);
  const rejected=await submit('/messages?dest=1','message',{recipient_id:'3',message:'Ne doit pas être envoyé',message_key:randomUUID()});
  assert.match(rejected,/erreur=/);
  cookie='';await submit('/connexion','email',{email:'admin@example.test',password:'UnMotDePasseFictif123!'});
  const discussion=await (await get('/messages?dest=2')).text();
  assert.match(discussion,/ÉCRIN est prêt/);assert.match(discussion,/Préparer ÉCRIN/);
  const history=discussion.slice(discussion.indexOf('class="conversation-history"'));
  assert.ok(history.indexOf('Préparer ÉCRIN pour le prochain voyageur</p>')<history.indexOf('ÉCRIN est prêt, merci !</p>'));
  await db.exec("UPDATE team_messages SET created_at=NOW()-INTERVAL '8 days'");
  assert.ok([200,207].includes((await fetch(origin+'/api/calendars/sync',{headers:{authorization:'Bearer cron-local-fictif-pour-les-tests'}})).status));
  assert.equal((await db.query('SELECT count(*)::int n FROM team_messages')).rows[0].n,0);
  // Un employé ne doit pas pouvoir réutiliser une action de l’administrateur.
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM reservations')).rows[0].n,4);
  assert.ok((await db.query('SELECT COUNT(*)::int AS n FROM audit')).rows[0].n>=5);
 }finally{server.kill();await new Promise(resolve=>server.once('exit',resolve));postgres.close();await db.close();}
});
