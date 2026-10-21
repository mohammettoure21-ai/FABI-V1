import {requireStaff} from '../lib/auth';
import {query,syncRecurringExpenses} from '../lib/db.mjs';
import {money} from '../lib/security.mjs';
import {projectedRevenue} from '../lib/stay.mjs';
import {scopeRevenue} from '../lib/dashboard.mjs';
import RevenueChart from './revenue-chart';
import Link from 'next/link';
export default async function Dashboard({searchParams}) {
 const user=await requireStaff();
 if(user.role!=='employee')await syncRecurringExpenses();
 const params=await searchParams;
 const now=new Date(),currentYear=now.getUTCFullYear(),currentMonth=now.getUTCMonth()+1;
 const requested=Number(params?.annee);
 const year=Number.isInteger(requested)&&requested>=2000&&requested<=2200?requested:currentYear;
 const manager=user.role!=='employee';
 const requestedProperty=/^bien-(\d+)$/.exec(String(params?.vue??''));
 const parsedId=requestedProperty?Number(requestedProperty[1]):null;
 const requestedId=Number.isSafeInteger(parsedId)&&parsedId>0&&parsedId<=2147483647?parsedId:null;
 const [statsResult,propertyResult,revenueResult,futureStays]=await Promise.all([
  query(`SELECT
   (SELECT count(*)::int FROM properties WHERE status='Disponible') AS properties,
   (SELECT count(*)::int FROM reservations WHERE status='Confirmée' AND calendar_event_kind='reservation' AND departure>(NOW() AT TIME ZONE 'Africa/Dakar')::date AND ($1::int IS NULL OR property_id=$1)) AS bookings,
   (SELECT count(*)::int FROM reservations WHERE status='Confirmée' AND calendar_event_kind='reservation' AND arrival=(NOW() AT TIME ZONE 'Africa/Dakar')::date AND ($1::int IS NULL OR property_id=$1)) AS arrivals,
   (SELECT count(*)::int FROM reservations WHERE status='Confirmée' AND calendar_event_kind='reservation' AND departure=(NOW() AT TIME ZONE 'Africa/Dakar')::date AND ($1::int IS NULL OR property_id=$1)) AS departures`,[requestedId]),
  query("SELECT id,name,category,neighborhood,nightly FROM properties WHERE status='Disponible' ORDER BY name"),
  manager?query("SELECT reporting_month AS month,property_id,kind,activity,count(*)::int AS count,sum(amount)::text AS total FROM finance_entries WHERE reporting_year=$1 GROUP BY reporting_month,property_id,kind,activity ORDER BY reporting_month,activity",[year]):Promise.resolve({rows:[]}),
  manager?query("SELECT property_id,arrival,departure,nightly,agreed_total,expected_commission,status,calendar_event_kind,payment_received_at FROM reservations WHERE status='Confirmée' AND calendar_event_kind='reservation' AND departure>$1::date AND arrival<$2::date",[Math.max(year,currentYear)+'-01-01',`${year+1}-01-01`]):Promise.resolve({rows:[]})
 ]);
 const stats=statsResult.rows[0];
 const selectedProperty=propertyResult.rows.find(p=>p.id===requestedId);
 const scopeName=selectedProperty?.name??'FABI';
 const {monthly,annual,charges}=scopeRevenue(revenueResult.rows,selectedProperty?.id??null);
 const projection=projectedRevenue(futureStays.rows,year,now.toISOString().slice(0,10),selectedProperty?.id??null);
 const chartData=monthly.map((m,i)=>({...m,forecast:projection.months[i].total,forecastCount:projection.months[i].count}));
 const scopeValue=selectedProperty?'bien-'+selectedProperty.id:'fabi';
 const selectedMonth=year===currentYear?currentMonth:1;
 const selectedLabel=new Intl.DateTimeFormat('fr-SN',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(year,selectedMonth-1,1)));
 return <div className="modern-dashboard">
  <header className="dashboard-header"><div><span className="dashboard-eyebrow">FABI · VOTRE ACTIVITÉ</span><h1>Bonjour, {user.name.split(' ')[0]}.</h1><p>Vos revenus et vos séjours, au même endroit.</p></div>{user.role==='admin'&&<Link className="button dashboard-create" href="/reservations">+ Nouvelle réservation</Link>}</header>
  <section className="dashboard-metrics" aria-label="Chiffres clés">
   {manager&&<><article className="metric metric-featured"><span>Revenus {scopeName} · {selectedLabel}</span><strong>{money(monthly[selectedMonth-1].total)}</strong><small>{selectedProperty?'Recettes locatives':'Commissions'} · {year}</small></article><article className="metric"><span>Revenus {scopeName} · année</span><strong>{money(annual)}</strong><small>Janvier à décembre {year}</small></article><article className="metric"><span>Charges & loyers · {scopeName}</span><strong>{money(charges)}</strong><small>Année {year} · charges enregistrées</small></article><article className="metric"><span>Résultat · {scopeName}</span><strong>{money(annual-charges)}</strong><small>Revenus − charges enregistrées</small></article></>}
   {manager&&selectedProperty&&<article className="metric forecast-metric"><span>À venir · {scopeName}</span><strong>{money(projection.total)}</strong><small>Prévisionnel des nuits à venir{projection.missing?` · ${projection.missing} séjour(s) à compléter`:null}</small></article>}{!selectedProperty&&<article className="metric"><span>Appartements actifs</span><strong>{stats.properties}</strong><small>Disponibles à la réservation</small></article>}<article className="metric"><span>Réservations confirmées</span><strong>{stats.bookings}</strong><small>Séjours en cours et à venir</small></article>
  </section>
  {manager&&<><div className="dashboard-section-heading"><div><h2>Vos revenus</h2></div><form method="get" className="dashboard-year"><input type="hidden" name="vue" value={scopeValue}/><label htmlFor="dashboard-year">Année</label><input id="dashboard-year" name="annee" type="number" min="2000" max="2200" defaultValue={year}/><button className="secondary">Afficher</button></form></div><div className="dashboard-scope" role="group" aria-label="Choisir les revenus à afficher"><span>Revenus de</span><Link href={'/?annee='+year+'&vue=fabi'} aria-current={!selectedProperty?'page':undefined}>FABI</Link>{propertyResult.rows.map(p=><Link key={p.id} href={'/?annee='+year+'&vue=bien-'+p.id} aria-current={selectedProperty?.id===p.id?'page':undefined}>{p.name}</Link>)}</div><RevenueChart key={year+'-'+scopeValue} data={chartData} year={year} initialMonth={selectedMonth} scopeName={scopeName} isProperty={Boolean(selectedProperty)}/></>}
  <div className="dashboard-bottom"><section className="dashboard-properties"><div className="dashboard-section-heading"><h2>{selectedProperty?'Votre appartement':'Vos appartements'}</h2><Link href="/appartements">Voir les biens →</Link></div><div className="dashboard-property-list">{propertyResult.rows.filter(p=>!selectedProperty||p.id===selectedProperty.id).map(p=><article key={p.id}><span className="property-initial">{p.name.slice(0,1)}</span><div><h3>{p.name}</h3><p>{p.neighborhood} · {p.category}</p></div>{manager&&<strong>{p.nightly===null?'À renseigner':money(p.nightly)}<small>/ nuit</small></strong>}</article>)}</div></section><section className="dashboard-today"><span className="dashboard-eyebrow">AUJOURD’HUI À DAKAR</span><h2>Les mouvements du jour</h2><div><span>Arrivées</span><strong>{stats.arrivals}</strong></div><div><span>Départs</span><strong>{stats.departures}</strong></div><Link href="/reservations">Voir les réservations →</Link></section></div>
  {user.role==='admin'&&<div className="dashboard-finance-link"><span>Une commission ou une dépense à noter ?</span><Link href="/finances">Ouvrir les finances →</Link></div>}
 </div>;
}
