'use client';
import {useState} from 'react';
export default function UploadForm({properties,clients}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 function submit(event){
  const file=event.currentTarget.elements.pdf.files[0];
  if(!file||file.size>2*1024*1024||!file.name.toLowerCase().endsWith('.pdf')){event.preventDefault();setError('Choisissez un PDF de 2 Mo maximum.');return;}
  setError('');setBusy(true);
 }
 return <form action="/api/factures" method="post" encType="multipart/form-data" className="grid-form" onSubmit={submit}>
  <label>Nom de la facture<input name="title" required maxLength={160} placeholder="Ex. Facture du séjour — OCÉAN"/></label>
  <label>Fichier PDF<input name="pdf" type="file" accept="application/pdf,.pdf" required aria-describedby="pdf-help"/><span id="pdf-help" className="muted">2 Mo maximum. Le PDF original est conservé.</span></label>
  <label>Référence (facultatif)<input name="reference" maxLength={100}/></label>
  <label>Date de la facture (facultatif)<input name="issued_on" type="date"/></label>
  <label>Appartement (facultatif)<select name="property_id"><option value="">Sans appartement / FABI</option>{properties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Contact (facultatif)<select name="client_id"><option value="">Aucun contact associé</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label className="wide">Notes (facultatif)<textarea name="notes" maxLength={2000} rows={2}/></label>
  {error&&<p role="alert" className="wide notice error">{error}</p>}
  <button disabled={busy}>{busy?'Enregistrement en cours…':'Enregistrer le PDF'}</button>
 </form>;
}
