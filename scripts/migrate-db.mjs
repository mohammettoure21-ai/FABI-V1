import {configured,database,transaction} from '../lib/db.mjs';
import {schema} from '../lib/schema.mjs';
if(configured()) {
 try {
  await transaction(async db=>{
   await db.query("SELECT pg_advisory_xact_lock(hashtext('fabi-schema'))");
   await db.query(schema);
  });
  console.log('FABI : schéma vérifié dans la base du déploiement.');
 } catch(error) {
  console.error('FABI_SCHEMA_FAILED',error.code??error.name);
  process.exitCode=1;
 } finally {await database().end();}
} else console.log('FABI : compilation locale sans connexion de base.');
