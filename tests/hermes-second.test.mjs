import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareSecondHermes} from '../scripts/hermes-second.mjs';

test('Hermes 2 : clé et configuration privées distinctes, aucun changement du premier et aucune clé affichée',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'fabi-second-'));try{
  const first=join(temp,'hermes-1');await mkdir(first);await writeFile(join(first,'key'),'FIRST KEY FIXTURE');await writeFile(join(first,'config.yaml'),'FIRST CONFIG FIXTURE');
  const second=join(temp,'Hermes 2');
  const run=spawnSync(process.execPath,['scripts/hermes-second.mjs',second],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const privateKey=(await readFile(join(second,'hermes-2.key'),'utf8')).trim(),config=await readFile(join(second,'hermes-2-mcp.yaml'),'utf8');
  assert.match(privateKey,/^fabi_[A-Za-z0-9_-]{43}$/);assert.doesNotMatch(run.stdout,new RegExp(privateKey));assert.ok(!config.includes(privateKey));
  assert.ok(run.stdout.includes(createHash('sha256').update(privateKey).digest('hex')));
  for(const name of ['FABI_CRM_KEY_FILE','FABI_HERMES_BROWSER_STATE_FILE']){
   const quoted=config.split('\n').find(line=>line.trim().startsWith(name+':')).split(': ').slice(1).join(': ');
   assert.ok(JSON.parse(quoted).startsWith(second));
  }
  assert.ok(config.includes('fabi_open_dashboard'));assert.ok(config.includes('fabi_prepare_expense'));
  assert.equal(await readFile(join(first,'key'),'utf8'),'FIRST KEY FIXTURE');assert.equal(await readFile(join(first,'config.yaml'),'utf8'),'FIRST CONFIG FIXTURE');
  const retry=spawnSync(process.execPath,['scripts/hermes-second.mjs',second],{encoding:'utf8'});assert.equal(retry.status,1);
  assert.equal((await readFile(join(second,'hermes-2.key'),'utf8')).trim(),privateKey);assert.equal(await readFile(join(second,'hermes-2-mcp.yaml'),'utf8'),config);
  if(process.platform!=='win32'){assert.equal((await stat(join(second,'hermes-2.key'))).mode&0o077,0);assert.equal((await stat(second)).mode&0o077,0);}
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('Hermes 2 : aucun écrasement d’une session existante et aucun secret créé dans le dépôt',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'fabi-second-collision-'));try{
  await writeFile(join(temp,'hermes-2-state.json'),'EXISTING STATE FIXTURE');
  await assert.rejects(prepareSecondHermes(temp),/HERMES_2_FILES_ALREADY_EXIST/);
  assert.deepEqual(await readdir(temp),['hermes-2-state.json']);assert.equal(await readFile(join(temp,'hermes-2-state.json'),'utf8'),'EXISTING STATE FIXTURE');
  await assert.rejects(prepareSecondHermes(resolve('instance','hermes-2-forbidden')),/PRIVATE_DIRECTORY_OUTSIDE_REPOSITORY_REQUIRED/);
 }finally{await rm(temp,{recursive:true,force:true});}
});
