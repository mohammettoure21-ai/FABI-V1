import Link from 'next/link';
import {requireUser} from '../../lib/auth';
import {redirect} from 'next/navigation';
import {query} from '../../lib/db.mjs';
import {listInvoices,MAX_ARCHIVE_BYTES,invoiceReadAllowed} from '../../lib/invoices.mjs';
import {Header,Messages,Empty} from '../components';
import UploadForm from './upload-form';
const date=value=>value?new Date(value).toLocaleDateString('fr-FR',{timeZone:'Africa/Dakar'}):'—';
export default async function Invoices({searchParams}){
 const user=await requireUser();if(!invoiceReadAllowed(user))redirect(user.role==='owner'?'/proprietaire':'/');
 const params=await searchParams;
 const q=String(params.q??'').slice(0,120),property=/^[1-9]\d{0,8}$/.test(String(params.property_id??''))?String(params.property_id):'';
 const [result,properties,clients,space]=await Promise.all([
  listInvoices({query},{q,property_id:property,page:params.page}),query('SELECT id,name FROM properties ORDER BY name'),
  user.role==='admin'?query('SELECT id,name FROM clients ORDER BY name,id'):Promise.resolve({rows:[]}),
  query('SELECT count(*)::int AS total,COALESCE(SUM(size_bytes),0)::bigint AS used FROM invoice_documents')
 ]);
 const stats=space.rows[0];
 const link=page=>'/factures?'+new URLSearchParams({q,property_id:property,page:String(page)});
 return <><Header eyebrow="VOS DOCUMENTS" title="Factures" description="Vos factures PDF, enregistrées au même endroit."/><Messages params={params}/>
  <div className="invoice-overview"><div><strong>{stats.total}</strong><span>facture{stats.total>1?'s':''} enregistrée{stats.total>1?'s':''}</span></div><p>{(Number(stats.used)/1048576).toLocaleString('fr-FR',{maximumFractionDigits:1})} Mo utilisés sur {MAX_ARCHIVE_BYTES/1048576} Mo</p></div>
  {user.role==='admin'&&<section className="panel"><details className="invoice-upload" open={stats.total===0}><summary>+ Ajouter une facture PDF</summary><p className="muted">Ajoutez un document déjà préparé. La date et la référence restent celles de votre facture.</p><UploadForm properties={properties.rows} clients={clients.rows}/></details></section>}
  <section className="panel"><h2>Factures enregistrées</h2><form method="get" className="contact-search"><label>Rechercher<input name="q" defaultValue={q} maxLength={120} placeholder="Nom, référence ou contact"/></label><label>Appartement<select name="property_id" defaultValue={property}><option value="">Tous les appartements et FABI</option>{properties.rows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="secondary">Rechercher</button></form>
  {result.invoices.length?<div className="invoice-list">{result.invoices.map(item=><article key={item.id} className="invoice-card"><span className="invoice-icon" aria-hidden="true">PDF</span><div className="invoice-info"><h3>{item.title}</h3><p>{[item.reference,item.property_name,item.client_name].filter(Boolean).join(' · ')||'FABI Conciergerie'}</p><small>{item.issued_on?'Facture du '+date(item.issued_on)+' · ':''}Enregistrée le {date(item.created_at)} par {item.saved_by} · {Math.ceil(item.size_bytes/1024)} Ko</small>{item.notes&&<details><summary>Notes</summary><p className="notes">{item.notes}</p></details>}</div><a className="button secondary" href={item.download_url}>Télécharger <span className="sr-only">{item.title}</span></a></article>)}</div>:<Empty text="Ajoutez votre première facture PDF ou modifiez les filtres."/>}
  {result.pages>1&&<div className="invoice-pagination">{result.page>1&&<Link href={link(result.page-1)}>← Précédente</Link>}<span>Page {result.page} sur {result.pages}</span>{result.page<result.pages&&<Link href={link(result.page+1)}>Suivante →</Link>}</div>}
  <p className="muted">Ces documents sont des archives. Leur ajout ne comptabilise ni revenu, ni dépense, ni paiement.</p></section></>;
}
