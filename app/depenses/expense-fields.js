'use client';
import {useState} from 'react';
import {activities,kinds,serviceTypes} from '../../lib/finance.mjs';
import ServiceFields from '../passages/service-fields';
export default function ExpenseFields({properties,people,today,defaultPropertyId}){
 const [kind,setKind]=useState('depense'),[activity,setActivity]=useState('Autre'),[monthly,setMonthly]=useState(false),[amount,setAmount]=useState('');
 const service=kind==='depense'&&serviceTypes.includes(activity),recurring=kind==='depense'&&activity==='Wifi'&&monthly;
 function changeActivity(value){setActivity(value);if(value==='Wifi'&&!amount)setAmount('14900');}
 return <>
 <label>Type d’écriture<select name="kind" value={kind} onChange={e=>{setKind(e.target.value);if(e.target.value==='loyer'&&serviceTypes.includes(activity))setActivity('Autre');}}>{['depense','loyer'].map(k=><option key={k} value={k}>{kinds[k]}</option>)}</select></label>
 <label>Activité / catégorie<select name="activity" value={activity} onChange={e=>changeActivity(e.target.value)}>{activities.filter(a=>kind==='depense'||!serviceTypes.includes(a)).map(a=><option key={a}>{a}</option>)}</select></label>
 {service&&<><input type="hidden" name="staff_service" value="1"/><ServiceFields people={people} activity={activity}/></>}
 {kind==='depense'&&activity==='Wifi'&&<div className="wide recurring-choice"><label className="checkbox-label"><input type="checkbox" name="recurring_wifi" value="1" checked={monthly} onChange={e=>setMonthly(e.target.checked)}/> Enregistrer automatiquement chaque mois</label>{recurring&&<p>Une dépense par appartement et par mois, au même prix. Il s’agit d’une écriture dans le CRM, sans prélèvement bancaire. Vous pourrez arrêter les prochains mois.</p>}</div>}
 <label>{recurring?'Date de la première dépense':'Date'}<input name="date" type="date" defaultValue={today} required/></label>
 {recurring?<fieldset className="wide"><legend>Appartements concernés</legend><p>Le montant saisi s’applique à chaque appartement sélectionné.</p>{properties.map(p=><label className="checkbox-label" key={p.id}><input type="checkbox" name="property_ids" value={p.id} defaultChecked={p.id===defaultPropertyId}/>{p.name}</label>)}<label className="checkbox-label"><input type="checkbox" name="property_ids" value="fabi"/>FABI — sans appartement</label></fieldset>:<label>Appartement (facultatif)<select name="property_id" defaultValue={defaultPropertyId??''}><option value="">Sans appartement / FABI</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
 {!service&&<><label>Description<input name="description" required maxLength={200} key={activity} defaultValue={activity==='Wifi'?'Abonnement Wi-Fi':''}/></label><label>Montant {recurring?'mensuel par appartement ':''}(FCFA)<input type="number" name="amount" required min={1} max={1000000000} step={1} value={amount} onChange={e=>setAmount(e.target.value)}/></label></>}
 <details className="form-options wide"><summary>Nom, lieu et commentaire</summary><div className="grid-form">{!service&&<label>Intervenant / bénéficiaire (facultatif)<input name="provider" maxLength={120}/></label>}<label>Lieu / précision (facultatif)<input name="detail" maxLength={200}/></label><label>Commentaire (facultatif)<input name="comment" maxLength={1000}/></label></div></details>
 <button>{recurring?'Activer la dépense mensuelle':'Enregistrer la dépense'}</button>
 </>;
}
