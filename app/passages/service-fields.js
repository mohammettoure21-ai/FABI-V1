'use client';
import {useState} from 'react';
const types=['Ménage','Vérification','Autre service'];
export default function ServiceFields({people=[],activity}){
 const [service,setService]=useState('Ménage'),[price,setPrice]=useState(''),[quantity,setQuantity]=useState('1');
 const selected=activity??service;
 const valid=/^\d+$/.test(price)&&Number(price)>0&&/^\d+$/.test(quantity)&&Number(quantity)>0;
 return <>{!activity&&<label>Service<select name="activity" value={service} onChange={e=>setService(e.target.value)}>{types.map(t=><option key={t}>{t}</option>)}</select></label>}
 <label>Nom de l’employé / intervenant<input name="provider" required maxLength={120} autoComplete="off" list="service-people" placeholder="Choisir ou saisir un nom"/><datalist id="service-people">{people.map(name=><option key={name} value={name}/>)}</datalist></label>
 <label>Prix par passage (FCFA)<input type="number" name="unit_amount" required min={1} max={1000000000} step={1} value={price} onChange={e=>setPrice(e.target.value)}/></label>
 <label>Nombre de passages<input type="number" name="quantity" required min={1} max={100} step={1} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
 {selected==='Autre service'&&<label className="wide">Description du service<input name="description" required maxLength={200}/></label>}
 <p className="wide service-price-preview" aria-live="polite">{valid?'Total : '+new Intl.NumberFormat('fr-SN',{style:'currency',currency:'XOF',maximumFractionDigits:0}).format(Number(price)*Number(quantity)):'Renseignez le prix du service pour calculer le total.'}</p></>;
}
