import {configured,database,transaction} from '../lib/db.mjs';
import {schema} from '../lib/schema.mjs';
import {removeImportedRent} from '../lib/remove-imported-rent.mjs';
import {reconcilePropertyCatalog} from '../lib/property-catalog.mjs';
if(configured()) {
 try {
  await transaction(async db=>{
   await db.query("SELECT pg_advisory_xact_lock(hashtext('fabi-schema'))");
   await db.query(schema);
   await reconcilePropertyCatalog(db);
   await removeImportedRent(db);
  });
  console.log('FABI : schéma vérifié dans la base du déploiement.');
 } catch(error) {
  console.error('FABI_SCHEMA_FAILED',error.code??(/^PROPERTY_[A-Z_]+$/.test(error.message)?error.message:error.name));
  process.exitCode=1;
 } finally {await database().end();}
} else console.log('FABI : compilation locale sans connexion de base.');
