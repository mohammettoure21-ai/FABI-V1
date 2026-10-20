import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {query,configured} from './db.mjs';
import {tokenHash} from './security.mjs';
export async function currentUser(){if(!configured())return null;const token=(await cookies()).get('fabi_session')?.value;if(!token)return null;const {rows}=await query('SELECT u.id,u.name,u.email,u.role,u.owner_property_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires>NOW() AND u.active=TRUE',[tokenHash(token)]);return rows[0]??null;}
export async function requireUser(){const user=await currentUser();if(!user)redirect('/connexion');return user;}
export async function requireManager(){const user=await requireUser();if(!['admin','manager'].includes(user.role))throw new Error('Accès réservé aux responsables.');return user;}

export async function requireAdmin(){const user=await requireUser();if(user.role!=='admin')throw new Error('Accès réservé à l’administrateur.');return user;}

export async function requireStaff(){const user=await requireUser();if(user.role==='owner')redirect('/proprietaire');return user;}
export async function requireOwner(){const user=await requireUser();if(user.role!=='owner')redirect('/');return user;}
