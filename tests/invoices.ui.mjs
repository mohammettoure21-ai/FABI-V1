import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {createServer} from 'pglite-server';
import {schema} from '../lib/schema.mjs';
import {hashPassword} from '../lib/security.mjs';
import {invoicePdf} from './fixtures/invoice.mjs';

test('Navigateur factures : ajout, doublon, recherche, téléchargement et affichage mobile', {timeout:90000},async()=>{
 const db=new PGlite({extensions:{btree_gist}});await db.exec(schema);
 await db.query("INSERT INTO users(name,email,password,role) VALUES('Administrateur fictif','admin@example.test',$1,'admin')",[hashPassword('UnMotDePasseFictif123!')]);
 await db.exec("INSERT INTO properties(reference,name,neighborhood,category,bedrooms,nightly,status) VALUES('TEST','Appartement fictif','Test','F2',1,0,'Disponible')");
 const postgres=createServer(db);await new Promise(resolve=>postgres.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:3016';
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3016'],{env:{...process.env,DATABASE_URL:`postgresql://test:test@127.0.0.1:${postgres.address().port}/test`,POSTGRES_URL:'',VERCEL:'',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 let browser,logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/connexion')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,logs);
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/connexion');await page.getByLabel('Adresse e-mail',{exact:true}).fill('admin@example.test');await page.getByLabel('Mot de passe',{exact:true}).fill('UnMotDePasseFictif123!');await page.getByRole('button',{name:/Se connecter/}).click();await page.waitForURL(origin+'/');
  await page.getByRole('link',{name:'Factures',exact:true}).click();await page.waitForURL(origin+'/factures');
  const pdf=invoicePdf();
  async function upload(){await page.locator('.invoice-upload').evaluate(d=>d.open=true);await page.getByLabel('Nom de la facture',{exact:true}).fill('Facture de démonstration');await page.getByLabel('Référence (facultatif)',{exact:true}).fill('DEMO-001');await page.locator('.invoice-upload select[name="property_id"]').selectOption('1');await page.locator('input[name="pdf"]').setInputFiles({name:'Facture démo.pdf',mimeType:'application/pdf',buffer:pdf});await page.getByRole('button',{name:'Enregistrer le PDF',exact:true}).click();await page.waitForURL(/factures\?succes=/);}
  await upload();assert.equal(await page.locator('.invoice-card').count(),1);assert.match(await page.getByRole('status').innerText(),/enregistrée/);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('link',{name:/Télécharger Facture de démonstration/}).click();const download=await downloadEvent;assert.deepEqual(await readFile(await download.path()),pdf);
  await upload();assert.equal(await page.locator('.invoice-card').count(),1);assert.match(await page.getByRole('status').innerText(),/déjà enregistré/);
  await page.goto(origin+'/factures');await page.screenshot({path:'/tmp/fabi-factures-desktop.png',fullPage:true});
  await page.getByLabel('Rechercher',{exact:true}).fill('Absent');await page.getByRole('button',{name:'Rechercher',exact:true}).click();await page.waitForURL(/q=Absent/);assert.equal(await page.locator('.invoice-card').count(),0);
  await page.goto(origin+'/factures');await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/fabi-factures-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Débordement horizontal mobile');assert.deepEqual(errors,[]);
  assert.equal((await db.query('SELECT count(*)::int n FROM finance_entries')).rows[0].n,0);
 }finally{await browser?.close();server.kill();await new Promise(resolve=>server.once('exit',resolve));postgres.close();await db.close();}
});
