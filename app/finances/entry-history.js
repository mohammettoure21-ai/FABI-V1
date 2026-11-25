import Link from 'next/link';
import {money} from '../../lib/security.mjs';
import {months,kinds,activities,serviceTypes} from '../../lib/finance.mjs';
import {financeEntryDate,financeHistoryGroups} from '../../lib/finance-history.mjs';
import {financeReturnUrl} from '../../lib/finance-navigation.mjs';
import {updateFinanceEntry} from './actions';
import {Empty,Input} from '../components';
export function FinanceReturnFields({context={}}){return <><input type="hidden" name="return_to" value={context.path??'/finances'}/><input type="hidden" name="return_year" value={context.year??''}/><input type="hidden" name="return_month" value={context.month??''}/><input type="hidden" name="return_scope" value={context.scope??''}/><input type="hidden" name="return_tab" value={context.tab??''}/><input type="hidden" name="return_activity" value={context.activity??''}/><input type="hidden" name="return_provider" value={context.provider??''}/></>;}
function EditEntryForm({entry,properties,context}){
 const activityOptions=entry.staff_service?serviceTypes:activities;
 const date=financeEntryDate(entry.original_date)?.iso??'';
 return <form action={updateFinanceEntry} className="grid-form">
  <FinanceReturnFields context={context}/>
  <input type="hidden" name="entry_id" value={entry.id}/>
  <Input label="Description" name="description" defaultValue={entry.description} maxLength={200}/>
  {!entry.linked&&<>
   <Input label="Date" name="date" type="date" defaultValue={date} min="2000-01-01" max="2200-12-31" required={false}/>
   <label>Activité / catégorie<select name="activity" defaultValue={entry.activity}>
    {!activityOptions.includes(entry.activity)&&<option value={entry.activity}>{entry.activity||'Non renseignée'}</option>}
    {activityOptions.map(activity=><option key={activity}>{activity}</option>)}
   </select></label>
   <label>Appartement<select name="property_id" defaultValue={entry.property_id??''}>
    <option value="">Sans appartement / FABI</option>
    {properties.map(property=><option key={property.id} value={property.id}>{property.name}</option>)}
   </select></label>
  </>}
  {entry.staff_service?<><Input label="Nombre de passages" name="quantity" type="number" min={1} max={100} defaultValue={entry.quantity}/>
   <Input label="Prix par passage (FCFA)" name="unit_amount" type="number" min={1} max={1000000000} defaultValue={entry.unit_amount}/></>
   :<Input label="Montant (FCFA)" name="amount" type="number" min={1} max={Number.MAX_SAFE_INTEGER} defaultValue={entry.amount}/>}
  <Input label="Bénéficiaire / intervenant" name="provider" defaultValue={entry.provider} maxLength={120} required={false}/>
  <Input label="Lieu / précision" name="detail" defaultValue={entry.detail} maxLength={200} required={false}/>
  <Input label="Commentaire" name="comment" defaultValue={entry.comment} maxLength={1000} required={false}/>
  <button>Enregistrer les modifications</button>
 </form>;
}

export default function EntryHistory({entries,canWrite,properties,context,editingId}){
 if(!entries.length)return <Empty text="Aucune opération sur cette période."/>;
 const filters=new URLSearchParams({return_to:context.path,return_year:context.year,return_month:context.month??'',return_scope:context.scope,return_tab:context.tab,return_activity:context.activity,return_provider:context.provider});
 const historyUrl=financeReturnUrl(filters);
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
   {canWrite&&<div className="operation-details" id={'operation-'+entry.id}>
    {editingId===String(entry.id)?<>
     <Link href={historyUrl+'#operation-'+entry.id}>Annuler la modification</Link>
     <EditEntryForm entry={entry} properties={properties} context={context}/>
    </>:<Link href={historyUrl+(historyUrl.includes('?')?'&':'?')+'modifier='+entry.id+'#operation-'+entry.id}>Modifier l’opération</Link>}
   </div>}
  </article>;
 })}</section>)}</div>;
}
