import {createHash,randomBytes} from 'node:crypto';
export const readScopes=['properties:read','reservations:read','reports:read'];
export const writeScopes=['reservations:create','expenses:create'];
export const scopes=[...readScopes,...writeScopes,'dashboard:admin','dashboard:direct'];
export class IntegrationError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export const deny=(status,code)=>{throw new IntegrationError(status,code);};
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const newCredential=()=>`fabi_${randomBytes(32).toString('base64url')}`;
export async function authenticate(db,authorization,scope,env=process.env,lock=false){
 if(env.FABI_INTEGRATION_ENABLED==='false')deny(503,'INTEGRATION_DISABLED');
 const match=/^Bearer (fabi_[A-Za-z0-9_-]{43})$/.exec(authorization??'');
 if(!match)deny(401,'INVALID_CREDENTIAL');
 const credential=(await db.query(`SELECT c.* FROM integration_credentials c JOIN users u ON u.id=c.created_by
 WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at>NOW()) AND u.active AND u.role='admin'${lock?' FOR SHARE OF c,u':''}`,[digest(match[1])])).rows[0];
 if(!credential)deny(401,'INVALID_CREDENTIAL');
 if(!Array.isArray(credential.scopes)||(scope&&!credential.scopes.includes(scope)))deny(403,'SCOPE_DENIED');
 return credential;
}
export function propertyAllowed(credential,id){return credential.property_ids===null||credential.property_ids.includes(id);}
export function requireProperty(credential,id){if(!propertyAllowed(credential,id))deny(403,'PROPERTY_DENIED');}
export async function accessLog(db,credential,operation,outcome){
 // No headers, request bodies, query strings or personal identifiers in logs.
 await db.query('INSERT INTO integration_access_log(credential_id,operation,outcome) VALUES($1,$2,$3)',[credential?.id??null,operation,outcome]);
}
function validatePermissions(permissions,properties,expiresAt){
 if(!Array.isArray(permissions)||!permissions.length||permissions.some(s=>!scopes.includes(s)))deny(400,'INVALID_SCOPES');
 if(permissions.some(s=>s==='dashboard:admin'||s==='dashboard:direct')&&properties!==null)deny(400,'ADMIN_DASHBOARD_REQUIRES_ALL_PROPERTIES');
 if(properties!==null&&(!Array.isArray(properties)||!properties.length||properties.some(id=>!Number.isSafeInteger(id)||id<1)))deny(400,'INVALID_PROPERTIES');
 if(expiresAt!==null&&(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now()||Date.parse(expiresAt)>Date.now()+366*86400000))deny(400,'INVALID_EXPIRY');
}
export async function registerCredential(db,{name,createdBy,permissions=scopes,properties=null,expiresAt,tokenHash}){
 if(!name||name.length>120)deny(400,'INVALID_SCOPES');
 validatePermissions(permissions,properties,expiresAt);
 if(!/^[a-f0-9]{64}$/.test(tokenHash??''))deny(400,'INVALID_KEY_FINGERPRINT');
 const actor=(await db.query("SELECT id FROM users WHERE id=$1 AND active AND role='admin' FOR SHARE",[createdBy])).rows[0];
 if(!actor)deny(403,'ADMIN_REQUIRED');
 const row=(await db.query('INSERT INTO integration_credentials(name,token_hash,scopes,property_ids,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[name,tokenHash,JSON.stringify(permissions),properties===null?null:JSON.stringify(properties),createdBy,expiresAt])).rows[0];
 await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[createdBy,'Création accès technique Hermes '+row.id]);
 return {id:row.id};
}
export async function updateCredential(db,{id,actor,permissions,properties,expiresAt}){
 if(!Number.isSafeInteger(id)||id<1)deny(400,'INVALID_CREDENTIAL_ID');
 validatePermissions(permissions,properties,expiresAt);
 const user=(await db.query("SELECT id FROM users WHERE id=$1 AND active AND role='admin' FOR SHARE",[actor])).rows[0];
 if(!user)deny(403,'ADMIN_REQUIRED');
 // Keep the existing key and creator. Only the creator's personal session may change permissions.
 const updated=(await db.query(`UPDATE integration_credentials SET scopes=$3,property_ids=$4,expires_at=$5
 WHERE id=$1 AND created_by=$2 AND revoked_at IS NULL RETURNING id`,[id,actor,JSON.stringify(permissions),properties===null?null:JSON.stringify(properties),expiresAt])).rows[0];
 if(!updated)deny(403,'CREDENTIAL_NOT_EDITABLE');
 // A permission change never carries forward an approved dashboard session or pending approval.
 await db.query('DELETE FROM sessions WHERE integration_credential_id=$1',[id]);
 await db.query('UPDATE integration_dashboard_grants SET expires_at=LEAST(expires_at,NOW()) WHERE credential_id=$1',[id]);
 await db.query('UPDATE integration_operations SET expires_at=LEAST(expires_at,NOW()) WHERE credential_id=$1 AND result IS NULL',[id]);
 await db.query('INSERT INTO audit(user_id,action,integration_credential_id) VALUES($1,$2,$3)',[actor,'Modification autorisations Hermes '+id+' : '+permissions.join(', '),id]);
 return {id};
}
export async function revokeCredential(db,id,actor){
 const user=(await db.query("SELECT id FROM users WHERE id=$1 AND active AND role='admin' FOR SHARE",[actor])).rows[0];if(!user)deny(403,'ADMIN_REQUIRED');
 const changed=await db.query('UPDATE integration_credentials SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[id]);
 if(changed.rows.length)await db.query('DELETE FROM sessions WHERE integration_credential_id=$1',[id]);
 if(changed.rows.length)await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[actor,'Révocation accès technique '+id]);
}
