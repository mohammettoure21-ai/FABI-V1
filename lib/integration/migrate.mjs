import {integrationSchema,dashboardGrantSchema,integrationWriteSchema} from './schema.mjs';

// Upgrade the existing FABI installation without replaying historical business corrections.
export async function migrateIntegration(db){
 const state=(await db.query("SELECT to_regclass('public.users') IS NOT NULL AS users_ready,to_regclass('public.sessions') IS NOT NULL AS sessions_ready,to_regclass('public.audit') IS NOT NULL AS audit_ready")).rows[0];
 if(!state.users_ready&&!state.sessions_ready&&!state.audit_ready)return {initialized:false};
 if(!state.users_ready||!state.sessions_ready||!state.audit_ready)throw new Error('BASE_SCHEMA_REQUIRED');
 await db.query("SELECT pg_advisory_xact_lock(hashtext('fabi-schema'))");
 const sql=integrationSchema+dashboardGrantSchema+integrationWriteSchema;
 // PGlite exposes exec for statement batches; node-postgres uses its simple-query path.
 if(typeof db.exec==='function')await db.exec(sql);else await db.query(sql);
 return {initialized:true};
}
