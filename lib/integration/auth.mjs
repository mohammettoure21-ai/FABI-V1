import {createHash,randomBytes} from 'node:crypto';
export const readScopes=['properties:read','reservations:read','reports:read'];
export const scopes=[...readScopes,'dashboard:admin'];
export class IntegrationError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export const deny=(status,code)=>{throw new IntegrationError(status,code);};
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const newCredential=()=>`fabi_${randomBytes(32).toString('base64url')}`;
export async function authenticate(db,authorization,scope,env=process.env,lock=false){
 if(env.FABI_INTEGRATION_ENABLED==='false')deny(503,'INTEGRATION_DISABLED');
 const match=/^Bearer (fabi_[A-Za-z0-9_-]{43})$/.exec(authorization??'');
 if(!match)deny(401,'INVALID_CREDENTIAL');
 const credential=(await db.query(`SELECT c.* FROM integration_credentials c JOIN users u ON u.id=c.created_by
 WHERE c.token_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>NOW() AND u.active AND u.role='admin'${lock?' FOR SHARE OF c,u':''}`,[digest(match[1])])).rows[0];
 if(!credential)deny(401,'INVALID_CREDENTIAL');
 if(!Array.isArray(credential.scopes)||!credential.scopes.includes(scope))deny(403,'SCOPE_DENIED');
 return credential;
}
export function propertyAllowed(credential,id){return credential.property_ids===null||credential.property_ids.includes(id);}
export function requireProperty(credential,id){if(!propertyAllowed(credential,id))deny(403,'PROPERTY_DENIED');}
export async function accessLog(db,credential,operation,outcome){
 // No headers, request bodies, query strings or personal identifiers in logs.
 await db.query('INSERT INTO integration_access_log(credential_id,operation,outcome) VALUES($1,$2,$3)',[credential?.id??null,operation,outcome]);
}
export async function registerCredential(db,{name,createdBy,permissions=scopes,properties=null,expiresAt,tokenHash}){
 if(!name||name.length>120||!Array.isArray(permissions)||!permissions.length||permissions.some(s=>!scopes.includes(s)))deny(400,'INVALID_SCOPES');
 if(!/^[a-f0-9]{64}$/.test(tokenHash??''))deny(400,'INVALID_KEY_FINGERPRINT');
 if(permissions.includes('dashboard:admin')&&properties!==null)deny(400,'ADMIN_DASHBOARD_REQUIRES_ALL_PROPERTIES');
 if(properties!==null&&(!Array.isArray(properties)||!properties.length||properties.some(id=>!Number.isSafeInteger(id)||id<1)))deny(400,'INVALID_PROPERTIES');
 const actor=(await db.query("SELECT id FROM users WHERE id=$1 AND active AND role='admin' FOR SHARE",[createdBy])).rows[0];
 if(!actor)deny(403,'ADMIN_REQUIRED');
 if(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now()||Date.parse(expiresAt)>Date.now()+366*86400000)deny(400,'INVALID_EXPIRY');
 const row=(await db.query('INSERT INTO integration_credentials(name,token_hash,scopes,property_ids,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[name,tokenHash,JSON.stringify(permissions),properties===null?null:JSON.stringify(properties),createdBy,expiresAt])).rows[0];
 await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[createdBy,'Création accès technique Hermes '+row.id]);
 return {id:row.id};
}
export async function revokeCredential(db,id,actor){
 const user=(await db.query("SELECT id FROM users WHERE id=$1 AND active AND role='admin' FOR SHARE",[actor])).rows[0];if(!user)deny(403,'ADMIN_REQUIRED');
 const changed=await db.query('UPDATE integration_credentials SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[id]);
 if(changed.rows.length)await db.query('DELETE FROM sessions WHERE integration_credential_id=$1',[id]);
 if(changed.rows.length)await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[actor,'Révocation accès technique '+id]);
}
