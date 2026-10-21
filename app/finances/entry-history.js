import {money} from '../../lib/security.mjs';
import {months,kinds} from '../../lib/finance.mjs';
import {financeEntryDate,financeHistoryGroups} from '../../lib/finance-history.mjs';
import {Empty} from '../components';
export function FinanceReturnFields({context={}}){return <><input type="hidden" name="return_to" value={context.path??'/finances'}/><input type="hidden" name="return_year" value={context.year??''}/><input type="hidden" name="return_month" value={context.month??''}/><input type="hidden" name="return_scope" value={context.scope??''}/><input type="hidden" name="return_tab" value={context.tab??''}/><input type="hidden" name="return_activity" value={context.activity??''}/><input type="hidden" name="return_provider" value={context.provider??''}/></>;}
export default function EntryHistory({entries}){
 if(!entries.length)return <Empty text="Aucune opération sur cette période."/>;
 return <div className="operation-history">{financeHistoryGroups(entries).map(group=><section className="operation-group" key={group.key}><h3>{months[group.month-1]} {group.year}</h3>{group.entries.map(entry=>{
  const date=financeEntryDate(entry.original_date),warnings=Array.isArray(entry.warnings)?entry.warnings:[];
  const payable=['depense','loyer'].includes(entry.kind);
  return <article className="operation-card" key={entry.id} aria-label={entry.description}>
   <div className="stay-date-tile"><strong>{date?.day??'—'}</strong><span>{months[(date?.month??group.month)-1].slice(0,3)}.</span></div>
   <div className="operation-summary"><h4>{entry.description}</h4><p>{entry.property_name??entry.company??'FABI Conciergerie'}{entry.activity?' · '+entry.activity:''}</p>{entry.staff_service&&<p className="service-employee">Intervenant : <strong>{entry.provider||'Nom non renseigné'}</strong></p>}{entry.staff_service&&entry.recorder_name&&<small>Enregistré par {entry.recorder_name}</small>}<span className="pill">{kinds[entry.kind]}</span>{!date&&<small className="period-only">Période mensuelle · jour non renseigné</small>}</div>
   <div className="operation-amount"><strong>{money(entry.amount)}</strong>{!payable&&<span className="pill payment-status">{entry.payment_status??'Encaissé'}</span>}</div>
   <details className="operation-details"><summary>Détails de l’opération</summary><dl>
    <div><dt>Période comptable</dt><dd>{months[group.month-1]} {group.year}</dd></div>
    {entry.original_date&&<div><dt>Date d’origine</dt><dd>{entry.original_date}</dd></div>}
    {entry.provider&&<div><dt>Bénéficiaire / intervenant</dt><dd>{entry.provider}</dd></div>}
    {entry.detail&&<div><dt>Lieu / précision</dt><dd>{entry.detail}</dd></div>}
    {entry.staff_service&&entry.quantity&&<div><dt>Passages</dt><dd>{entry.quantity}{entry.unit_amount!=null?' × '+money(entry.unit_amount):''}</dd></div>}
    {entry.comment&&<div><dt>Commentaire</dt><dd>{entry.comment}</dd></div>}
    {entry.source_sheet&&<div><dt>Source</dt><dd>{entry.source_sheet}{entry.source_row?', ligne '+entry.source_row:''}</dd></div>}
   </dl>{warnings.map((warning,i)=><p className="finance-warning" key={i}>{warning}</p>)}</details>
  </article>;
 })}</section>)}</div>;
}
