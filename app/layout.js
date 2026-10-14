import './style.css';
import Link from 'next/link';
import {currentUser} from '../lib/auth';
import {logout} from './actions';
export const metadata={title:'FABI CRM — Conciergerie',description:'Votre espace de gestion FABI Conciergerie'};
export const dynamic='force-dynamic';
export default async function Layout({children}){const user=await currentUser();return <html lang="fr"><body>{user&&<aside><Link className="brand" href="/">FABI<span>CONCIERGERIE</span></Link><small>VOTRE ESPACE DE TRAVAIL</small><nav><Link href="/">◈ Tableau de bord</Link><Link href="/clients">◎ Clients & prospects</Link><Link href="/appartements">▦ Appartements</Link><Link href="/reservations">▤ Réservations</Link>{user.role==='admin'&&<Link href="/equipe">Équipe & accès</Link>}</nav><div className="aside-note">Finances, commissions et factures : prochaines étapes.</div><div className="profile"><b>{user.name}</b><p>{{admin:'Administrateur',manager:'Responsable',employee:'Employé'}[user.role]}</p><form action={logout}><button className="secondary">Se déconnecter</button></form></div></aside>}<main className={user?'':'guest'}>{children}<footer>FABI Holiday · Dakar · Montants en FCFA</footer></main></body></html>}
