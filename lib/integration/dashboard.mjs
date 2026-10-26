import {randomUUID,randomBytes} from 'node:crypto';
import {tokenHash} from '../security.mjs';
import {deny} from './auth.mjs';
export async function requestDashboard(db,credential,task){
 if(typeof task!=='string'||!task.trim()||task.length>1000)deny(400,'DESCRIBE_TASK');
 const id=randomUUID();await db.query('INSERT INTO integration_dashboard_grants(id,credential_id,task) VALUES($1,$2,$3)',[id,credential.id,task.trim()]);
 return {request_id:id,confirmation_required:true,approval_path:'/integrations',expires_in_seconds:900};
}
export async function approveDashboard(db,id,actor){
 if(!/^[a-f0-9-]{36}$/i.test(id??''))deny(400,'INVALID_REQUEST');
 const row=(await db.query(`UPDATE integration_dashboard_grants g SET approved_at=NOW(),approved_by=$2 FROM integration_credentials c JOIN users u ON u.id=c.created_by
 WHERE g.id=$1 AND g.credential_id=c.id AND c.created_by=$2 AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>NOW()) AND c.scopes @> '["dashboard:admin"]'::jsonb
 AND u.active AND u.role='admin' AND g.expires_at>NOW() AND g.redeemed_at IS NULL RETURNING g.id`,[id,actor])).rows[0];
 if(!row)deny(403,'REQUEST_NOT_APPROVABLE');
 await db.query('INSERT INTO audit(user_id,action,integration_credential_id) SELECT $1,$2,credential_id FROM integration_dashboard_grants WHERE id=$3',[actor,'Autorisation session Hermes 10 minutes',id]);
}
export async function redeemDashboard(db,credential,id){
 if(!credential.scopes.includes('dashboard:admin'))deny(403,'SCOPE_DENIED');
 if(!/^[a-f0-9-]{36}$/i.test(id??''))deny(400,'INVALID_REQUEST');
 const grant=(await db.query('SELECT * FROM integration_dashboard_grants WHERE id=$1 AND credential_id=$2 FOR UPDATE',[id,credential.id])).rows[0];
 if(!grant||!grant.approved_at||grant.approved_by!==credential.created_by)deny(403,'HUMAN_CONFIRMATION_REQUIRED');
 if(new Date(grant.expires_at)<=new Date())deny(410,'REQUEST_EXPIRED');
 if(grant.redeemed_at)deny(409,'REQUEST_ALREADY_USED');
 const secret=randomBytes(32).toString('hex'),expires=new Date(Date.now()+600000);
 await db.query('INSERT INTO sessions(token,user_id,expires,integration_credential_id,integration_grant_id) VALUES($1,$2,$3,$4,$5)',[tokenHash(secret),credential.created_by,expires,credential.id,grant.id]);
 await db.query('UPDATE integration_dashboard_grants SET redeemed_at=NOW() WHERE id=$1',[grant.id]);
 return {secret,expires};
}

export async function openDirectDashboard(db,credential,input){
 if(!credential.scopes.includes('dashboard:direct'))deny(403,'SCOPE_DENIED');
 if(Object.keys(input).some(k=>!['task','confirmed'].includes(k)))deny(400,'UNKNOWN_FIELD');
 if(input.confirmed!==true)deny(400,'HUMAN_CONFIRMATION_REQUIRED');
 if(typeof input.task!=='string'||!input.task.trim()||input.task.length>1000)deny(400,'DESCRIBE_TASK');
 const secret=randomBytes(32).toString('hex');
 // A dedicated service session, valid until revocation; never a personal admin cookie.
 await db.query('DELETE FROM sessions WHERE integration_credential_id=$1 AND integration_grant_id IS NULL',[credential.id]);
 await db.query("INSERT INTO sessions(token,user_id,expires,integration_credential_id) VALUES($1,$2,'infinity'::timestamptz,$3)",[tokenHash(secret),credential.created_by,credential.id]);
 await db.query('INSERT INTO audit(user_id,action,integration_credential_id) VALUES($1,$2,$3)',[credential.created_by,'Ouverture session Hermes autonome : accord déclaré par le connecteur',credential.id]);
 return {secret,expires:null,persistent:true};
}
