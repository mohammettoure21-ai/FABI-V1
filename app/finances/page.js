import {redirect} from 'next/navigation';
import {requireUser} from '../../lib/auth';
import {query} from '../../lib/db.mjs';
import {money} from '../../lib/security.mjs';
import {months,kinds,summarize} from '../../lib/finance.mjs';
import {Header,Messages,Input,Empty} from '../components';
import {saveMonthlyRent} from './actions';

export default async function Finances({searchParams}) {
 const user=await requireUser();
 if(user.role==='employee')redirect('/');
 const params=await searchParams;
 const year=/^\d{4}$/.test(params.annee??'')?Number(params.annee):2026;
 const month=/^(?:[1-9]|1[0-2])$/.test(params.mois??'')?Number(params.mois):null;
 const results=await Promise.all([
  query('SELECT e.*,p.name AS property_name FROM finance_entries e LEFT JOIN properties p ON p.id=e.property_id WHERE e.reporting_year=$1 AND ($2::int IS NULL OR e.reporting_month=$2) ORDER BY e.reporting_month,e.source_sheet,e.source_row',[year,month]),
  query('SELECT p.id,p.name,r.amount FROM properties p LEFT JOIN property_monthly_rents r ON r.property_id=p.id ORDER BY p.name'),
  query('SELECT filename,notes,imported_at FROM finance_imports WHERE reporting_year=$1 ORDER BY imported_at DESC',[year])
 ]);
 const entries=results[0].rows,properties=results[1].rows,imports=results[2].rows;
 const totals=summarize(entries);
 return <><Header eyebrow="FABI CONCIERGERIE" title="Finances" description="Recettes et dépenses des appartements, commissions de l’entreprise et loyers suivis séparément."/>
 <Messages params={params}/>
 <section className="panel"><form className="finance-filters" method="get"><Input label="Année" name="annee" type="number" min="2000" max="2200" defaultValue={year}/><label>Mois<select name="mois" defaultValue={month??''}><option value="">Tous les mois</option>{months.map((name,i)=><option key={name} value={i+1}>{name}</option>)}</select></label><button>Afficher</button></form></section>
 <div className="stats finance-stats">{[['Recettes des appartements',totals.recette],['Dépenses hors loyers',totals.depense],['Solde hors loyers',totals.balance],['Commissions FABI',totals.commission],['Loyers enregistrés',totals.loyer]].map(([label,value])=><article className="panel" key={label}><small>{label}</small><h2>{money(value)}</h2></article>)}</div>
 <section className="panel"><h2>Bilan par appartement</h2><p className="muted">Les loyers et les commissions ne sont pas inclus dans le solde d’exploitation ci-dessous. Les tarifs mensuels sont des paramètres ; les loyers enregistrés sont les écritures du fichier.</p><div className="table-scroll"><table><thead><tr><th>Appartement</th><th>Recettes</th><th>Dépenses hors loyers</th><th>Solde hors loyers</th><th>Loyers enregistrés</th></tr></thead><tbody>{properties.map(p=>{const t=summarize(entries.filter(e=>e.property_id===p.id));return <tr key={p.id}><td>{p.name}</td><td>{money(t.recette)}</td><td>{money(t.depense)}</td><td>{money(t.balance)}</td><td>{money(t.loyer)}</td></tr>;})}</tbody></table></div></section>
 <section className="panel"><h2>Loyers mensuels</h2><p>Renseignez le montant contractuel de chaque appartement. Enregistrer un montant ici ne crée aucune dépense et ne signifie pas que le loyer est payé.</p><div className="property-grid">{properties.map(p=><form key={p.id} action={saveMonthlyRent}><h3>{p.name}</h3><input type="hidden" name="property_id" value={p.id}/><Input label="Loyer mensuel (FCFA)" name="amount" type="number" min="0" max="1000000000" step="1" defaultValue={p.amount??''} placeholder="À renseigner"/><button>Enregistrer le loyer</button></form>)}</div></section>
 {imports.map((item,i)=><section key={i} className="panel"><h2>Contrôles de l’import</h2><p>{item.filename} · Bilan {year}</p><ul>{item.notes.map((note,j)=><li key={j}>{note}</li>)}</ul></section>)}
 <section className="panel"><h2>Écritures détaillées</h2><p className="muted">Le mois du bilan est conservé. Les dates d’origine incohérentes sont signalées. Les totaux du fichier ne sont pas importés comme de nouvelles opérations.</p>{entries.length?<div className="table-scroll"><table><thead><tr><th>Période</th><th>Entité</th><th>Type</th><th>Description</th><th>Montant</th><th>Commentaires et contrôles</th><th>Source</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td>{months[e.reporting_month-1]} {e.reporting_year}{e.original_date&&<small className="source-date">Date d’origine : {e.original_date}</small>}</td><td>{e.property_name??e.company}</td><td>{kinds[e.kind]}</td><td>{e.description}{e.detail&&<small className="source-date">{e.detail}</small>}</td><td>{money(Number(e.amount))}</td><td>{e.comment}{e.warnings.map((warning,i)=><p className="finance-warning" key={i}>{warning}</p>)}</td><td>{e.source_sheet}, ligne {e.source_row}</td></tr>)}</tbody></table></div>:<Empty text="Aucune écriture sur cette période."/>}</section></>;
}
