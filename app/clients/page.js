import {requireStaff} from '../../lib/auth';
import {query} from '../../lib/db.mjs';
import {saveClient} from '../actions';
import {Header,Input,Messages,Empty} from '../components';
import ContactFields from './contact-fields';
const types={client:'Client',owner:'Propriétaire',partner:'Partenaire'};
export default async function Clients({searchParams}){
 const user=await requireStaff(),params=await searchParams;
 const search=String(params.q??'').slice(0,120),type=Object.hasOwn(types,params.type)?params.type:null;
 const {rows}=await query("SELECT * FROM clients WHERE ($1<>'employee' OR assigned_to=$2) AND (name ILIKE $3 OR phone ILIKE $3 OR email ILIKE $3) AND ($4::text IS NULL OR contact_type=$4) ORDER BY id DESC LIMIT 200",[user.role,user.id,'%'+search+'%',type]);
 return <><Header eyebrow="VOS CONTACTS" title="Clients et partenaires" description="Clients, propriétaires et partenaires apporteurs de clients."/><Messages params={params}/>
 <section className="panel"><h2>Nouveau contact</h2><form action={saveClient} className="grid-form"><ContactFields/><Input label="Nom complet" name="name" maxLength={120}/><Input label="Téléphone (indicatif inclus)" name="phone" maxLength={40}/><Input label="Adresse e-mail" name="email" type="email" required={false} maxLength={254}/><label className="wide">Notes internes<textarea name="notes" maxLength={2000} rows={3}/></label><button>Enregistrer le contact</button></form></section>
 <section className="panel"><form className="contact-search" method="get"><Input label="Rechercher un contact" name="q" required={false} defaultValue={search}/><label>Type de contact<select name="type" defaultValue={type??''}><option value="">Tous les contacts</option>{Object.entries(types).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="secondary">Rechercher</button></form>
 {rows.length?<div className="table-wrap"><table><thead><tr><th>Contact</th><th>Type</th><th>Téléphone</th><th>E-mail</th><th>Étape commerciale</th><th>Notes</th></tr></thead><tbody>{rows.map(contact=><tr key={contact.id}><td><b>{contact.name}</b></td><td><span className="pill">{types[contact.contact_type]}</span></td><td>{contact.phone}</td><td>{contact.email||'—'}</td><td>{contact.contact_type==='client'?contact.status:'—'}</td><td className="notes">{contact.notes||'—'}</td></tr>)}</tbody></table></div>:<Empty text="Ajoutez un contact ou modifiez votre recherche."/>}<p className="muted">Les 200 contacts les plus récents correspondant à la recherche.</p></section></>;
}
