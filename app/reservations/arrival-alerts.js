import Link from 'next/link';
import {query} from '../../lib/db.mjs';
import {upcomingArrivals,dakarDate} from '../../lib/reservation-reminders.mjs';
export default async function ArrivalAlerts(){
 const rows=await upcomingArrivals({query});
 if(!rows.length)return null;
 const today=dakarDate();
 return <section className="panel arrival-alerts" aria-label="Rappels d’arrivée"><h2>Arrivées à préparer · J−2</h2><p>Préparez l’accueil et vérifiez les appartements pour ces arrivées proches.</p><div className="arrival-alert-list">{rows.map(stay=>{const days=Math.round((Date.parse(stay.arrival)-Date.parse(today))/86400000);return <article key={stay.id}><span className="pill">{days===0?'Aujourd’hui':days===1?'Demain':'Dans 2 jours'}</span><strong>{stay.property_name||stay.property_label||'Appartement à préciser'}</strong><span>{new Date(stay.arrival).toLocaleDateString('fr-FR',{timeZone:'Africa/Dakar'})}</span></article>;})}</div><Link href="/reservations">Voir les réservations →</Link></section>;
}
