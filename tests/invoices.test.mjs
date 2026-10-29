import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {schema} from '../lib/schema.mjs';
import {invoicePdf} from './fixtures/invoice.mjs';
import {storeInvoice,listInvoices,validateInvoice,MAX_PDF_BYTES,MAX_ARCHIVE_BYTES} from '../lib/invoices.mjs';
import {uploadInvoice,downloadInvoice,boundedBody} from '../lib/invoice-http.mjs';
import {registerCredential,newCredential,digest,revokeCredential} from '../lib/integration/auth.mjs';
import {integrationHandler} from '../lib/integration/handler.mjs';
import {migrateIntegration} from '../lib/integration/migrate.mjs';
const admin={id:1,role:'admin'},pdf=invoicePdf();
async function fixture(){
 const db=new PGlite({extensions:{btree_gist}});await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');await db.exec(schema);
 await db.exec("INSERT INTO users(name,email,password,role) VALUES('Admin fictif','admin@example.test','test','admin'),('Responsable fictif','manager@example.test','test','manager'),('Employé fictif','employee@example.test','test','employee'); INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('TEST','Appartement fictif','Test','F2',1,0,'Disponible'); INSERT INTO clients(name,phone,status,assigned_to) VALUES('Contact fictif','000','Nouveau',1)");
 return db;
}
function multipart(data={},bytes=pdf){const form=new FormData();form.set('title','Facture fictive');form.set('property_id','1');form.set('client_id','1');for(const [k,v] of Object.entries(data))form.set(k,v);form.set('pdf',new Blob([bytes],{type:'application/pdf'}),'facture-test.pdf');return form;}
function uploadRequest(form,origin='https://fabi.test'){return new Request('https://fabi.test/api/factures',{method:'POST',headers:{Origin:origin},body:form});}
test('Archives PDF : original conservé, doublon sans écrasement, recherche, audit et comptabilité inchangée',async()=>{
 const db=await fixture();try{
  const before=JSON.stringify((await db.query('SELECT * FROM finance_entries ORDER BY id')).rows);
  const first=await db.transaction(tx=>storeInvoice(tx,{title:'Facture fictive',filename:'facture.pdf',property_id:1,client_id:1},pdf,admin));
  assert.equal(first.already_saved,false);
  const duplicate=await db.transaction(tx=>storeInvoice(tx,{title:'NE PAS REMPLACER',filename:'autre.pdf'},pdf,admin));
  assert.equal(duplicate.id,first.id);assert.equal(duplicate.already_saved,true);assert.equal(duplicate.title,'Facture fictive');
  const saved=(await db.query('SELECT * FROM invoice_documents')).rows[0];assert.equal(saved.issued_on,null);assert.deepEqual(Buffer.from(saved.pdf),pdf);
  const results=await listInvoices(db,{q:'Contact fictif',property_id:1});assert.equal(results.total,1);assert.equal(results.invoices[0].property_name,'Appartement fictif');assert.equal(results.invoices[0].pdf,undefined);
  assert.equal((await listInvoices(db,{q:'Autre'})).total,0);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM finance_entries ORDER BY id')).rows),before);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit WHERE action LIKE 'Archivage facture PDF %'")).rows[0].n,1);
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='invoice_documents'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated'])assert.equal((await db.query("SELECT has_table_privilege($1,'invoice_documents','SELECT') AS allowed",[role])).rows[0].allowed,false);
  const response=await downloadInvoice({user:admin,id:first.id,db});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
  assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.match(response.headers.get('content-security-policy'),/sandbox/);assert.match(response.headers.get('cache-control'),/no-store/);
 }finally{await db.close();}
});
test('Archives PDF : fichiers invalides, dates inventées, liens absents et quota refusés sans ajout',async()=>{
 const db=await fixture();try{
  for(const [data,bytes,code] of [
   [{title:'Test',filename:'test.pdf'},Buffer.from('<html>test</html>'),'INVALID_PDF'],
   [{title:'Test',filename:'test.html'},pdf,'INVALID_PDF'],
   [{title:'Test',filename:'test.pdf',issued_on:'2026-02-30'},pdf,'INVALID_INVOICE_DATE'],
   [{title:'Test',filename:'test.pdf'},Buffer.alloc(MAX_PDF_BYTES+1),'PDF_TOO_LARGE'],
   [{title:'',filename:'test.pdf'},pdf,'INVALID_INVOICE'],
  ])assert.throws(()=>validateInvoice(data,bytes),new RegExp(code));
  await assert.rejects(db.transaction(tx=>storeInvoice(tx,{title:'Test',filename:'t.pdf',property_id:999},pdf,admin)),/INVOICE_LINK_NOT_FOUND/);
  await assert.rejects(db.transaction(tx=>storeInvoice(tx,{title:'Test',filename:'t.pdf',client_id:999},pdf,admin)),/INVOICE_LINK_NOT_FOUND/);
  await assert.rejects(db.transaction(tx=>storeInvoice({query:(sql,args)=>sql.includes('SUM(size_bytes)')?Promise.resolve({rows:[{used:MAX_ARCHIVE_BYTES}]}):tx.query(sql,args)},{title:'Test',filename:'t.pdf'},pdf,admin)),/INVOICE_ARCHIVE_FULL/);
  assert.equal((await db.query('SELECT count(*)::int n FROM invoice_documents')).rows[0].n,0);
 }finally{await db.close();}
});
test('Archives PDF HTTP : connexion et rôles, CSRF, limite de flux et téléchargement protégé',async()=>{
 const db=await fixture(),transaction=fn=>db.transaction(fn);try{
  for(const [user,status] of [[null,401],[{id:2,role:'manager'},403],[{id:3,role:'employee'},403],[{id:4,role:'owner'},403]]){
   assert.equal((await uploadInvoice(uploadRequest(multipart()),{user,transaction})).status,status);
  }
  for(const origin of ['https://evil.test','null',''])assert.equal((await uploadInvoice(uploadRequest(multipart(),origin),{user:admin,transaction})).status,403);
  const upload=await uploadInvoice(uploadRequest(multipart({issued_on:'2026-10-29'})),{user:admin,transaction});assert.equal(upload.status,303);assert.match(upload.headers.get('location'),/succes=/);
  const invalid=await uploadInvoice(uploadRequest(multipart({},Buffer.from('fake'))),{user:admin,transaction});assert.match(invalid.headers.get('location'),/erreur=/);
  assert.equal((await db.query('SELECT count(*)::int n FROM invoice_documents')).rows[0].n,1);
  for(const [user,status] of [[null,401],[{role:'employee'},403],[{role:'owner'},403],[{role:'manager'},200]])assert.equal((await downloadInvoice({user,id:1,db})).status,status);
  assert.equal((await downloadInvoice({user:admin,id:'1 OR 1=1',db})).status,404);assert.equal((await downloadInvoice({user:admin,id:999,db})).status,404);
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(15));controller.enqueue(new Uint8Array(15));controller.close();}});
  await assert.rejects(boundedBody(new Request('https://fabi.test',{method:'POST',body:stream,duplex:'half'}),20),/BODY_TOO_LARGE/);
 }finally{await db.close();}
});
test('Factures Hermes : accès dédié existant, accord obligatoire, doublon, révocation et aucune dépense créée',async()=>{
 const db=await fixture();try{
  const token=newCredential(),readToken=newCredential();
  const c=await db.transaction(tx=>registerCredential(tx,{name:'Hermes 2 fictif',createdBy:1,permissions:['dashboard:direct'],expiresAt:null,tokenHash:digest(token)}));
  await db.transaction(tx=>registerCredential(tx,{name:'Lecture seule',createdBy:1,permissions:['properties:read'],expiresAt:null,tokenHash:digest(readToken)}));
  const api=(path,body,key=token,env={})=>integrationHandler(new Request('https://fabi.test/api/integration/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key},body:body?JSON.stringify(body):undefined}),path,{db,transaction:fn=>db.transaction(fn),env});
  const body={title:'Facture Hermes fictive',filename:'hermes.pdf',pdf_base64:pdf.toString('base64'),confirmed:true};
  assert.equal((await api('invoices',undefined,readToken)).status,403);assert.equal((await api('invoices',body,readToken)).status,403);
  assert.equal((await api('invoices',{...body,confirmed:false})).status,400);
  assert.equal((await api('invoices',{...body,pdf_base64:'invalid'})).status,400);
  assert.equal((await api('invoices',body,token,{FABI_INTEGRATION_WRITES_ENABLED:'false'})).status,503);
  const saved=await api('invoices',body);assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.archived,true);assert.equal(result.accounting_changed,false);
  assert.equal((await (await api('invoices',body)).json()).already_saved,true);
  const list=await (await api('invoices')).json();assert.equal(list.total,1);assert.equal(list.invoices[0].saved_by,'Hermes 2 fictif');assert.doesNotMatch(JSON.stringify(list),new RegExp(token));assert.equal(list.invoices[0].pdf,undefined);
  assert.equal((await db.query("SELECT integration_credential_id FROM audit WHERE action LIKE 'Archivage facture PDF %'")).rows[0].integration_credential_id,c.id);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
  const maxPdf=Buffer.concat([pdf.subarray(0,-6),Buffer.alloc(MAX_PDF_BYTES-pdf.length,32),Buffer.from('%%EOF\n')]);
  assert.equal(maxPdf.length,MAX_PDF_BYTES);
  const large=await api('invoices',{...body,title:'PDF à la limite autorisée',pdf_base64:maxPdf.toString('base64')});assert.equal(large.status,200,JSON.stringify(await large.json()));
  await db.transaction(tx=>revokeCredential(tx,c.id,1));assert.equal((await api('invoices')).status,401);
 }finally{await db.close();}
});
test('Migration factures : ajout seul, répétable, documents et finances conservés',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,description,amount,source_sheet,activity) VALUES(1,'depense',2026,1,'Original conservé',9900,'Original fictif','Autre')");
  const before=JSON.stringify((await db.query('SELECT * FROM finance_entries')).rows);
  await db.exec('DROP TABLE invoice_documents');await db.transaction(migrateIntegration);
  await db.transaction(tx=>storeInvoice(tx,{title:'Original',filename:'original.pdf'},pdf,admin));
  const document=JSON.stringify((await db.query('SELECT * FROM invoice_documents')).rows);
  await db.transaction(migrateIntegration);await db.transaction(migrateIntegration);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM invoice_documents')).rows),document);
  assert.equal(JSON.stringify((await db.query('SELECT * FROM finance_entries')).rows),before);
 }finally{await db.close();}
});
