import {integrationSchema,dashboardGrantSchema,integrationWriteSchema} from './schema.mjs';
import {invoiceSchema} from '../invoice-schema.mjs';
import {notificationSchema} from '../notification-schema.mjs';
import {emailPolicy,pausePendingActivityEmails,pausePendingMessageEmails} from '../email-policy.mjs';

// Upgrade the existing FABI installation without replaying historical business corrections.
export async function migrateIntegration(db){
 const state=(await db.query("SELECT to_regclass('public.users') IS NOT NULL AS users_ready,to_regclass('public.sessions') IS NOT NULL AS sessions_ready,to_regclass('public.audit') IS NOT NULL AS audit_ready")).rows[0];
 if(!state.users_ready&&!state.sessions_ready&&!state.audit_ready)return {initialized:false};
 if(!state.users_ready||!state.sessions_ready||!state.audit_ready)throw new Error('BASE_SCHEMA_REQUIRED');
 await db.query("SELECT pg_advisory_xact_lock(hashtext('fabi-schema'))");
 const sql=integrationSchema+dashboardGrantSchema+integrationWriteSchema+invoiceSchema+notificationSchema;
 // PGlite exposes exec for statement batches; node-postgres uses its simple-query path.
 if(typeof db.exec==='function')await db.exec(sql);else await db.query(sql);
 // Persist the current pause on pre-existing queued mail. Resuming the team
 // later must not deliver the historical queue or change business records.
 const tables=(await db.query("SELECT to_regclass('public.team_messages') IS NOT NULL AND to_regclass('public.team_message_observers') IS NOT NULL AS messages_ready,to_regclass('public.activity_email_deliveries') IS NOT NULL AS activities_ready")).rows[0];
 const policy=await emailPolicy(db);
 if(tables.messages_ready)await pausePendingMessageEmails(db,policy);
 if(tables.activities_ready)await pausePendingActivityEmails(db,policy);
 return {initialized:true};
}
