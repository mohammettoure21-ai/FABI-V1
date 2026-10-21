import {syncArrivalReminders} from '../lib/arrival-reminders';
import './style.css';
import Link from 'next/link';
import Navigation from './navigation';
import {query} from '../lib/db.mjs';
import {unreadMessageCount} from '../lib/messages.mjs';
import {currentUser} from '../lib/auth';
import {logout} from './actions';
export const metadata={title:'FABI CRM — Conciergerie',description:'Votre espace de gestion FABI Conciergerie'};
export const dynamic='force-dynamic';
export default async function Layout({children}){const user=await currentUser();if(user&&user.role!=='owner')await syncArrivalReminders();const unread=user?await unreadMessageCount({query},user):0;return <html lang="fr"><body>{user&&<aside><Link className="brand" href="/">FABI<span>CONCIERGERIE</span></Link><small>VOTRE ESPACE DE TRAVAIL</small><Navigation role={user.role} unread={unread}/><div className="aside-note">{user.role==='owner'?'Espace propriétaire':'FABI Conciergerie · ÉCRIN & OCÉAN'}</div><div className="profile"><b>{user.name}</b><p>{{admin:'Administrateur',manager:'Responsable',employee:'Employé',owner:'Propriétaire'}[user.role]}</p><form action={logout}><button className="secondary">Se déconnecter</button></form></div></aside>}<main className={user?'':'guest'}>{children}<footer>FABI Holiday · Dakar · Montants en FCFA</footer></main></body></html>}
