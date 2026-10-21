import Link from 'next/link';
import {requireOwner} from '../../lib/auth';
import {query,syncRecurringExpenses} from '../../lib/db.mjs';
import {ownerData} from '../../lib/owner.mjs';
import {summarize,months,kinds} from '../../lib/finance.mjs';
import {money} from '../../lib/security.mjs';
import {Header,Input,Empty} from '../components';
import ReservationCalendar from '../reservations/reservation-calendar';
export default async function OwnerPage({searchParams}){
 const user=await requireOwner(),params=await searchParams;
 await syncRecurringExpenses();
 const now=new Date(),year=Number(params.annee)>=2000&&Number(params.annee)<=2200&&Number.isInteger(Number(params.annee))?Number(params.annee):now.getUTCFullYear();
 const data=await ownerData({query},user.id,year);
 if(!data)return <section className="panel"><h1>Appartement non disponible</h1><p>Contactez votre administrateur pour vérifier l’appartement attribué à votre compte.</p></section>;
 const {property,entries,stays}=data,totals=summarize(entries);
 return <><Header eyebrow="VOTRE ESPACE PROPRIÉTAIRE" title={property.name} description="Les finances et le calendrier de votre appartement, en consultation."/>
 <nav className="finance-tabs" aria-label="Espace propriétaire"><a href="#finances">Mes finances</a><a href="#calendrier">Mon calendrier</a><Link href="/messages">Contacter l’administrateur</Link></nav>
 <section className="panel"><h2>Votre appartement</h2><p>{property.reference} · {property.neighborhood} · {property.category}{property.bedrooms!==null?' · '+property.bedrooms+' chambre(s)':''}</p><p>{property.status}</p></section>
 <section id="finances"><div className="section-title"><h2>Finances de {property.name}</h2><form method="get" className="search"><Input label="Année" name="annee" type="number" min={2000} max={2200} defaultValue={year}/><button className="secondary">Afficher</button></form></div>
 <div className="cards">{[['Recettes de l’appartement',totals.recette],['Dépenses',totals.depense],['Loyers enregistrés',totals.loyer],['Solde d’exploitation',totals.recette-totals.depense-totals.loyer]].map(([label,value])=><article key={label}><small>{label}</small><h2>{money(value)}</h2></article>)}</div>
 <p className="muted">Année {year}. Le solde concerne cet appartement. Il ne représente ni le bénéfice de FABI ni un montant automatiquement dû au propriétaire. Les commissions FABI restent séparées.</p>
 <section className="panel table-wrap">{entries.length?<table><thead><tr><th>Période</th><th>Opération</th><th>Type</th><th>Montant</th><th>Paiement</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td>{months[e.reporting_month-1]} {e.reporting_year}</td><td className="notes">{e.description}</td><td>{kinds[e.kind]}</td><td>{money(e.amount)}</td><td>{e.payment_status}</td></tr>)}</tbody></table>:<Empty text="Aucune recette ou charge enregistrée pour votre appartement sur cette année."/>}</section></section>
 <section id="calendrier"><ReservationCalendar properties={[property]} stays={stays} year={now.getUTCFullYear()} month={now.getUTCMonth()+1} today={now.toISOString().slice(0,10)} initialPropertyId={property.id} showPrices={true} canEdit={false}/></section>
 </>;
}
