import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '../../lib/auth';
import {query} from '../../lib/db.mjs';
import {money} from '../../lib/security.mjs';
import {months,kinds,activities,summarize,cleaningSummary} from '../../lib/finance.mjs';
import {Header,Messages,Input,Empty} from '../components';
import {saveMonthlyRent,saveFinanceEntry,markExpensePaid} from './actions';

function PropertySelect({properties,defaultPropertyId}) {
 return <label>Appartement (facultatif)<select name="property_id" defaultValue={defaultPropertyId??''}><option value="">Sans appartement / FABI</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
}
function EntryForm({properties,cleaning=false,kind='depense',today,defaultPropertyId}) {
 return <form action={saveFinanceEntry} className="grid-form">
  <input type="hidden" name="request_key" value={randomUUID()}/>
  {cleaning?<><input type="hidden" name="kind" value="depense"/><input type="hidden" name="cleaning" value="1"/></>:<label>Type d’écriture<select name="kind" defaultValue={kind}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
  <Input label={cleaning?'Date du passage':'Date'} name="date" type="date" defaultValue={today}/>
  {!cleaning&&<label>Activité / catégorie<select name="activity" defaultValue={kind==='commission'?'Appartement':'Autre'}>{activities.map(a=><option key={a}>{a}</option>)}</select></label>}
  <PropertySelect properties={properties} defaultPropertyId={defaultPropertyId}/>
  <Input label={cleaning?'Nom de la ménagère (facultatif)':'Chauffeur, agent ou bénéficiaire (facultatif)'} name="provider" required={false} maxLength={120}/>
  <Input label="Lieu / appartement en texte libre (facultatif)" name="detail" required={false} maxLength={200}/>
  {cleaning?<><Input label="Nombre de passages à 5 000 FCFA" name="quantity" type="number" min={1} max={100} step={1} defaultValue={1}/><p>Chaque passage ajoute 5 000 FCFA aux dépenses et au récapitulatif mensuel.</p></>:<><Input label="Description" name="description" maxLength={200}/><Input label="Montant (FCFA)" name="amount" type="number" min={1} max={1000000000} step={1}/></>}
  <Input label="Commentaire (facultatif)" name="comment" required={false} maxLength={1000}/>
  <label className="checkbox-label"><input type="checkbox" name="paid" value="1"/> Dépense ou loyer déjà payé</label>
  <button>{cleaning?'Enregistrer le passage':'Enregistrer l’écriture'}</button>
 </form>;
}
function Entries({entries}) {
 return entries.length?<div className="table-scroll"><table><thead><tr><th>Date / période</th><th>Appartement / entreprise</th><th>Type / activité</th><th>Description / origine</th><th>Montant</th><th>Paiement</th><th>Commentaire / source</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}>
  <td>{months[e.reporting_month-1]} {e.reporting_year}{e.original_date&&<small className="source-date">{e.original_date}</small>}</td>
  <td>{e.property_name??e.company}{e.detail&&<small className="source-date">{e.detail}</small>}</td>
  <td>{kinds[e.kind]}<small className="source-date">{e.activity}</small></td>
  <td>{e.description}{e.provider&&<small className="source-date">{e.provider}</small>}{e.activity==='Ménage'&&<small className="source-date">{e.quantity} passage(s) · {money(Number(e.unit_amount??5000))} / passage</small>}</td>
  <td>{money(Number(e.amount))}</td><td>{e.payment_status}{['depense','loyer'].includes(e.kind)&&e.payment_status!=='Payé'&&<form action={markExpensePaid}><input type="hidden" name="entry_id" value={e.id}/><button className="secondary">Marquer payé</button></form>}</td>
  <td>{e.comment}{e.warnings.map((warning,i)=><p className="finance-warning" key={i}>{warning}</p>)}<small className="source-date">{e.source_sheet}{e.source_row?', ligne '+e.source_row:''}</small></td>
 </tr>)}</tbody></table></div>:<Empty text="Aucune écriture sur cette période."/>;
}
export default async function Finances({searchParams}) {
 const user=await requireUser();if(user.role==='employee')redirect('/');
 const params=await searchParams;
 const year=/^\d{4}$/.test(params.annee??'')?Number(params.annee):new Date().getUTCFullYear();
 const month=/^(?:[1-9]|1[0-2])$/.test(params.mois??'')?Number(params.mois):null;
 const tab=['commissions','depenses','menage'].includes(params.onglet)?params.onglet:'bilan';
 const [result,propertyResult,importResult]=await Promise.all([
  query('SELECT e.*,p.name AS property_name FROM finance_entries e LEFT JOIN properties p ON p.id=e.property_id WHERE e.reporting_year=$1 AND ($2::int IS NULL OR e.reporting_month=$2) ORDER BY e.reporting_month DESC,e.original_date DESC,e.id DESC',[year,month]),
  query('SELECT p.id,p.name,r.amount FROM properties p LEFT JOIN property_monthly_rents r ON r.property_id=p.id ORDER BY p.name'),
  query('SELECT filename,notes FROM finance_imports WHERE reporting_year=$1 ORDER BY imported_at DESC',[year])
 ]);
 const properties=propertyResult.rows;
 const requestedProperty=Number(params.bien);
 const selectedProperty=properties.find(p=>p.id===requestedProperty);
 const companyOnly=params.bien==='fabi';
 const scope=selectedProperty?String(selectedProperty.id):(companyOnly?'fabi':'');
 const entries=result.rows.filter(e=>selectedProperty?e.property_id===selectedProperty.id&&e.kind!=='commission':companyOnly?e.kind==='commission'||e.property_id===null:true);
 const totals=summarize(entries);
 const cleaning=cleaningSummary(entries);
 const today=new Date().toISOString().slice(0,10);
 const selected=entries.filter(e=>tab==='commissions'?e.kind==='commission':tab==='depenses'?e.kind==='depense':tab==='menage'?e.kind==='depense'&&e.activity==='Ménage':true);
 const fabiBalance=totals.recette+totals.commission-totals.depense-totals.loyer;
 return <><Header eyebrow="FABI CONCIERGERIE" title="Finances" description="Commissions par activité, dépenses et passages de ménage, avec ou sans appartement associé."/>
  <Messages params={params}/>
  <nav className="finance-tabs" aria-label="Rubriques financières">{[['bilan','Bilan par appartement'],['commissions','Commissions FABI'],['depenses','Dépenses'],['menage','Ménage']].map(([value,label])=><Link key={value} aria-current={tab===value?'page':undefined} href={'/finances?annee='+year+(month?'&mois='+month:'')+'&onglet='+value+(scope?'&bien='+scope:'')}>{label}</Link>)}</nav>
  <section className="panel"><form className="finance-filters" method="get"><input type="hidden" name="onglet" value={tab}/><label>Appartement / entreprise<select name="bien" defaultValue={scope}><option value="">Tous les appartements et FABI</option><option value="fabi">FABI — commissions et charges générales</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Input label="Année" name="annee" type="number" min="2000" max="2200" defaultValue={year}/><label>Mois<select name="mois" defaultValue={month??''}><option value="">Tous les mois</option>{months.map((name,i)=><option key={name} value={i+1}>{name}</option>)}</select></label><button>Afficher</button></form></section>
  <div className="cards finance-stats">{[[selectedProperty?'Recettes '+selectedProperty.name:'Recettes appartements',totals.recette],['Commissions FABI',totals.commission],['Charges enregistrées',totals.depense+totals.loyer],['Résultat',fabiBalance]].map(([label,value])=><article key={label}><small>{label}</small><h2>{money(value)}</h2></article>)}</div>
  <p className="muted">Résultat = recettes + commissions − dépenses − loyers enregistrés, y compris les dépenses à payer. Ce résultat n’est pas le solde de caisse. Les loyers mensuels contractuels ne sont pas déduits automatiquement.</p>
  {tab==='bilan'&&<>

   <section className="panel"><h2>Bilan par appartement</h2><div className="table-scroll"><table><thead><tr><th>Appartement</th><th>Recettes</th><th>Charges</th><th>Résultat</th></tr></thead><tbody>{properties.filter(p=>!companyOnly&&(!selectedProperty||p.id===selectedProperty.id)).map(p=>{const t=summarize(entries.filter(e=>e.property_id===p.id&&e.kind!=='commission'));return <tr key={p.id}><td>{p.name}</td><td>{money(t.recette)}</td><td>{money(t.depense+t.loyer)}</td><td>{money(t.balance-t.loyer)}</td></tr>;})}{companyOnly&&<tr><td>FABI Conciergerie</td><td>{money(totals.commission)}</td><td>{money(totals.depense+totals.loyer)}</td><td>{money(fabiBalance)}</td></tr>}</tbody></table></div></section>
      <section className="panel"><h2>Nouvelle écriture</h2><EntryForm properties={properties} today={today} defaultPropertyId={selectedProperty?.id}/></section>
   <details className="panel"><summary>Paramètres des loyers mensuels</summary><p>Le montant contractuel ne crée aucune dépense. Pour noter un loyer dû ou payé, ajoutez une écriture de type « Loyer ».</p><div className="property-grid">{properties.map(p=><form key={p.id} action={saveMonthlyRent}><input type="hidden" name="monthly_rent" value="1"/><h3>{p.name}</h3><input type="hidden" name="property_id" value={p.id}/><Input label="Loyer mensuel (FCFA)" name="amount" type="number" min="0" max="1000000000" step="1" defaultValue={p.amount??''} placeholder="À renseigner"/><button>Enregistrer le loyer</button></form>)}</div></details>
   {importResult.rows.map((item,i)=><details key={i} className="panel"><summary>Contrôles de l’import — {item.filename}</summary><ul>{item.notes.map((note,j)=><li key={j}>{note}</li>)}</ul></details>)}
  </>}
  {tab==='commissions'&&<><section className="panel"><h2>Origine des commissions FABI</h2><div className="table-scroll"><table><thead><tr><th>Activité</th><th>Nombre</th><th>Commissions</th></tr></thead><tbody>{activities.map(activity=>{const rows=entries.filter(e=>e.kind==='commission'&&e.activity===activity);return rows.length?<tr key={activity}><td>{activity}</td><td>{rows.length}</td><td>{money(rows.reduce((sum,e)=>sum+Number(e.amount),0))}</td></tr>:null;})}</tbody></table></div></section><section className="panel"><h2>Ajouter une commission</h2><p>Choisissez Chauffeur, Appartement ou une autre activité. Le nom, l’appartement et l’agent sont facultatifs.</p><EntryForm kind="commission" properties={properties} today={today} defaultPropertyId={selectedProperty?.id}/></section></>}
  {tab==='depenses'&&<section className="panel"><h2>Ajouter une dépense</h2><p>Wifi, transport, employé ou autre charge : le montant est compté immédiatement dans les finances. Pour le ménage à 5 000 FCFA par passage, utilisez l’onglet Ménage.</p><EntryForm properties={properties} today={today} defaultPropertyId={selectedProperty?.id}/></section>}
  {tab==='menage'&&<><section className="panel"><h2>Noter un passage de ménage</h2><EntryForm properties={properties} cleaning today={today} defaultPropertyId={selectedProperty?.id}/></section><section className="panel"><h2>Ménage : récapitulatif mensuel</h2><p>Le total est déjà inclus dans les dépenses. « Reste à payer » diminue quand vous marquez les passages payés.</p>{cleaning.length?<div className="table-scroll"><table><thead><tr><th>Mois</th><th>Appartement</th><th>Ménagère</th><th>Passages</th><th>Total</th><th>Reste à payer</th></tr></thead><tbody>{cleaning.map((row,i)=><tr key={i}><td>{months[row.month-1]} {row.year}</td><td>{row.property}</td><td>{row.provider}</td><td>{row.visits}</td><td>{money(row.total)}</td><td>{money(row.due)}</td></tr>)}</tbody></table></div>:<Empty text="Ajoutez chaque passage pour calculer le montant du mois."/>}</section></>}
  <section className="panel"><h2>{tab==='commissions'?'Détail des commissions':tab==='menage'?'Passages enregistrés':tab==='depenses'?'Détail des dépenses':'Toutes les écritures'}</h2><Entries entries={selected}/></section>
 </>;
}
