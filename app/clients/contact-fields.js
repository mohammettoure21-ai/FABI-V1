'use client';
import {useState} from 'react';
export default function ContactFields(){
 const [type,setType]=useState('client');
 return <><label>Type de contact<select name="contact_type" value={type} onChange={e=>setType(e.target.value)}><option value="client">Client</option><option value="owner">Propriétaire</option><option value="partner">Partenaire — apporteur de clients</option></select></label>
 {type==='client'?<label>Étape commerciale<select name="status" defaultValue="Nouveau">{['Nouveau','Contacté','Qualifié','Devis envoyé','Confirmé','Perdu'].map(status=><option key={status}>{status}</option>)}</select></label>:<input type="hidden" name="status" value="Nouveau"/>}
 {type==='partner'&&<p className="muted wide">Un partenaire est une personne qui vous apporte des clients.</p>}
 {type==='owner'&&<p className="muted wide">Cette fiche enregistre les coordonnées du propriétaire. Son accès au CRM se crée séparément dans Équipe & accès.</p>}</>;
}
