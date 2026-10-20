'use client';
import {useState} from 'react';
export default function RecipientPicker({people}){
 const [all,setAll]=useState(false);
 return <><fieldset className="message-audience"><legend>À qui envoyer ce message ?</legend>
  <label><input type="radio" name="audience" value="selected" checked={!all} onChange={()=>setAll(false)}/> Choisir les destinataires</label>
  <label><input type="radio" name="audience" value="all" checked={all} onChange={()=>setAll(true)}/> Tous les collaborateurs actifs ({people.length})</label>
 </fieldset><fieldset className="message-recipients" disabled={all}><legend>Un ou plusieurs collaborateurs</legend>
 {people.map(person=><label key={person.id}><input type="checkbox" name="recipient_ids" value={person.id}/><span>{person.name} <small>· {{admin:'Administrateur',manager:'Responsable',employee:'Employé'}[person.role]}</small></span></label>)}
 </fieldset>{all&&<p>Chaque collaborateur actif recevra le message dans sa propre discussion avec vous. Les réponses restent séparées.</p>}</>;
}
