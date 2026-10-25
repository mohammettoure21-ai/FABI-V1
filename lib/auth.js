import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {query,configured} from './db.mjs';
import {tokenHash} from './security.mjs';
export async function currentUser(){
 if(!configured())return null;
 const token=(await cookies()).get('fabi_session')?.value;if(!token)return null;
 const {rows}=await query(`SELECT u.id,CASE WHEN s.integration_credential_id IS NULL THEN u.name ELSE 'Hermes · '||u.name END AS name,
 u.email,u.role,u.owner_property_id,s.integration_credential_id AS integration_id
 FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN integration_credentials ic ON ic.id=s.integration_credential_id
 WHERE s.token=$1 AND s.expires>NOW() AND u.active AND (
 s.integration_credential_id IS NULL OR ($2::boolean AND ic.revoked_at IS NULL AND ic.expires_at>NOW()
 AND ic.created_by=u.id AND u.role='admin' AND ic.scopes @> '["dashboard:admin"]'::jsonb))`,[tokenHash(token),process.env.FABI_INTEGRATION_ENABLED==='true']);
 return rows[0]??null;
}
export async function requireUser(){const user=await currentUser();if(!user)redirect('/connexion');return user;}
export async function requireManager(){const user=await requireUser();if(!['admin','manager'].includes(user.role))throw new Error('Accès réservé aux responsables.');return user;}

export async function requireAdmin(){const user=await requireUser();if(user.role!=='admin')throw new Error('Accès réservé à l’administrateur.');return user;}

export async function requireStaff(){const user=await requireUser();if(user.role==='owner')redirect('/proprietaire');return user;}
export async function requireOwner(){const user=await requireUser();if(user.role!=='owner')redirect('/');return user;}

export async function requireHumanAdmin(){const user=await requireAdmin();if(user.integration_id)throw new Error("Confirmation réservée à votre connexion personnelle.");return user;}
