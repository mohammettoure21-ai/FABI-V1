import {configured,database,transaction} from '../lib/db.mjs';
import {migrateIntegration} from '../lib/integration/migrate.mjs';

if(configured()){
 try{
  const result=await transaction(migrateIntegration);
  console.log(result.initialized?'FABI : accès Hermes, archives PDF et métadonnées de notification prêts, aucune correction financière exécutée.':'FABI : base vide ; initialisez le CRM depuis /installation.');
 }catch(error){
  console.error('FABI_INTEGRATION_SCHEMA_FAILED',error.code??(error.message==='BASE_SCHEMA_REQUIRED'?error.message:error.name));process.exitCode=1;
 }finally{await database().end();}
}else console.log('FABI : compilation locale sans connexion de base.');
