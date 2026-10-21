import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '../../lib/auth';
import {query,transaction} from '../../lib/db.mjs';
import {expireConversations,employeeThreads,employeeThread} from '../../lib/messages.mjs';
import {Header,Messages} from '../components';
import {sendMessage,readMessage,retryMessageEmail,readSupervisedMessage,retrySupervisedEmail} from './actions';
import RefreshMessages from './refresh-messages';
import ConversationFocus from './conversation-focus';
import RecipientPicker from './recipient-picker';
const emailLabel=m=>m.email_status==='sent'?'Notification e-mail transmise':m.email_status==='sending'?'Envoi e-mail en cours ou à vérifier':m.email_attempts>=3?'Nombre maximal de tentatives atteint':m.email_status==='failed'?'Notification e-mail non envoyée':m.email_status==='not_configured'?'Gmail non configuré':'Notification e-mail en attente';
export default async function MessagePage({searchParams}){
 const user=await requireUser(),params=await searchParams;
 const supervisor=['admin','manager'].includes(user.role);
 await transaction(expireConversations);
 const before=Number(params.before),cursor=Number.isSafeInteger(before)&&before>0?before:2147483647;
 let shared=null;
 if(params.employee!==undefined||params.peer!==undefined){
  const employee=Number(params.employee),partner=Number(params.peer);
  if(!supervisor||![employee,partner].every(n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647))notFound();
  shared=await employeeThread({query},user,employee,partner,cursor);
  if(!shared)notFound();
 }
 const [threads,people,supervised]=await Promise.all([
  query(`SELECT DISTINCT ON (p.id) p.id,p.name,p.active,m.body,m.created_at,
   (SELECT count(*)::int FROM team_messages n WHERE n.sender_id=p.id AND n.recipient_id=$1 AND NOT n.is_supervision AND n.read_at IS NULL) AS unread
   FROM team_messages m JOIN users p ON p.id=CASE WHEN m.sender_id=$1 THEN m.recipient_id ELSE m.sender_id END
   WHERE NOT m.is_supervision AND (m.sender_id=$1 OR m.recipient_id=$1) AND ($2<>'owner' OR p.role='admin') AND ($2='admin' OR p.role<>'owner') ORDER BY p.id,m.created_at DESC,m.id DESC`,[user.id,user.role]),
  query("SELECT id,name,role,active FROM users WHERE active=TRUE AND id<>$1 AND ($2<>'owner' OR role='admin') AND ($2='admin' OR role<>'owner') ORDER BY name",[user.id,user.role]),
  supervisor?employeeThreads({query},user):Promise.resolve([])
 ]);
 const contacts=new Map(people.rows.map(p=>[p.id,p]));
 for(const t of threads.rows)if(!contacts.has(t.id))contacts.set(t.id,t);
 const ordered=threads.rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const requested=Number(params.dest),peer=contacts.get(requested)??contacts.get(ordered[0]?.id)??people.rows[0];
 const messages=shared?shared.messages:peer?(await query(`SELECT m.*,s.name AS sender,r.name AS recipient
  FROM team_messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
  WHERE NOT m.is_supervision AND ((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1)) AND m.id<$3
  ORDER BY m.id DESC LIMIT 201`,[user.id,peer.id,cursor])).rows:[];
 const more=messages.length>200,visible=messages.slice(0,200).reverse();
 const canSend=peer?.active&&people.rows.some(p=>p.id===peer.id);
 const base=shared?`/messages?employee=${shared.employee_id}&peer=${shared.partner_id}`:peer?'/messages?dest='+peer.id:'/messages';
 const observed=supervised.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 return <><Header title="Messages" description="Échangez avec un collaborateur, plusieurs personnes ou toute l’équipe."/><Messages params={params}/><RefreshMessages/><ConversationFocus viewKey={base+'|'+(params.before??'')} lastMessageId={visible.at(-1)?.id??0} older={Boolean(params.before)} focus={Boolean(params.dest||shared||params.before||params.succes)}/><details className="message-help"><summary>Confidentialité et conservation des discussions</summary>
 <p className="message-retention">Les discussions sont supprimées après 7 jours sans nouveau message. Chaque nouveau message relance ce délai.</p>
 {user.role==='owner'?<p className="message-retention">Votre messagerie est réservée aux échanges avec les administrateurs de FABI.</p>:<p className="message-retention">Les discussions impliquant un employé sont consultables intégralement par les administrateurs et responsables, y compris les réponses. Les échanges entre administrateurs et responsables restent réservés à leurs participants. Un employé ne voit que les discussions auxquelles il participe.</p>}
 </details>
 {people.rows.length>0&&<details className="panel message-compose" id="nouveau-message" open={params.nouveau==='1'||Boolean(params.erreur)}><summary>Nouveau message</summary><form action={sendMessage}>
 <input type="hidden" name="message_key" value={randomUUID()}/><RecipientPicker people={people.rows} allLabel={user.role==='owner'?'Tous les administrateurs actifs':'Tous les collaborateurs actifs'}/>
 <label>Message à envoyer<textarea name="message" rows={3} required maxLength={4000}/></label><button>Envoyer le message</button>
 <p className="muted">La notification e-mail contient un lien vers FABI, sans le contenu du message. Sa réception dépend de la configuration Gmail.</p>
 </form></details>}
 <div className="messaging"><section className="panel conversation-list" aria-label="Discussions"><h2>Mes discussions</h2>
 {ordered.map(t=><Link className={!shared&&peer?.id===t.id?'selected':''} key={t.id} scroll={false} href={'/messages?dest='+t.id+'#conversation'}><b>{t.name}</b>{t.unread>0&&<span className="pill">{t.unread} non lu{t.unread>1?'s':''}</span>}<p>{t.body.slice(0,90)}</p></Link>)}
 <form action="/messages" method="get"><label>Nouvelle discussion<select name="dest" required defaultValue=""><option value="">Choisir un collaborateur</option>{people.rows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="secondary">Ouvrir</button></form>
 {supervisor&&<section className="employee-thread-list"><h2>Suivi des employés</h2><p className="muted">Discussions complètes, dans les deux sens.</p>{observed.map(t=><Link key={t.employee_id+'-'+t.partner_id} className={shared?.employee_id===t.employee_id&&shared?.partner_id===t.partner_id?'selected':''} scroll={false} href={`/messages?employee=${t.employee_id}&peer=${t.partner_id}#conversation`}><b>{t.employee} ↔ {t.partner}</b>{t.unread>0&&<span className="pill">{t.unread} non lu{t.unread>1?'s':''}</span>}<p>{t.body.slice(0,90)}</p></Link>)}{!observed.length&&<p>Aucune discussion employé.</p>}</section>}
 </section>
 <section className="panel conversation" id="conversation" tabIndex={-1} aria-label="Conversation"><h2>{shared?shared.employee+' ↔ '+shared.partner:peer?.name??'Votre messagerie'}</h2>
 {shared&&<p className="pill">Discussion employé · visible par l’encadrement</p>}
 {more&&<Link scroll={false} href={base+'&before='+visible[0].id+'#conversation'}>Voir les messages précédents</Link>}
 {params.before&&<p><Link scroll={false} href={base+'#conversation'}>Revenir aux derniers messages</Link></p>}
 <div className="conversation-history">{visible.map(m=><article className={'team-message message-bubble'+(m.sender_id===user.id?' mine':'')+(!m.read_at&&m.recipient_id===user.id?' unread':'')} key={m.id}>
 <div><b>{m.sender_id===user.id?'Vous':m.sender}{shared?' → '+m.recipient:''}</b><small>{new Date(m.created_at).toLocaleString('fr-FR',{timeZone:'Africa/Dakar'})}</small></div><p>{m.body}</p>
 {m.read_at?<small>Lu par le destinataire</small>:m.recipient_id===user.id?<form action={readMessage}><input type="hidden" name="message_id" value={m.id}/><button className="secondary">Marquer comme lu</button></form>:<small>Non lu par le destinataire</small>}
 {shared&&m.observer_id&&<div className="observer-reading">{m.observer_read_at?<small>Consulté par vous · suivi</small>:<form action={readSupervisedMessage}><input type="hidden" name="observed_message_id" value={m.id}/><input type="hidden" name="employee_id" value={shared.employee_id}/><input type="hidden" name="peer_id" value={shared.partner_id}/><button className="secondary">Marquer le suivi comme consulté</button></form>}</div>}
 {shared&&m.observer_id&&<div className="email-delivery"><small>{emailLabel({email_status:m.observer_email_status,email_attempts:m.observer_email_attempts})}</small>{['failed','not_configured'].includes(m.observer_email_status)&&m.observer_email_attempts<3&&<form action={retrySupervisedEmail}><input type="hidden" name="observed_email_id" value={m.id}/><button className="secondary">Réessayer ma notification</button></form>}</div>}
 {m.sender_id===user.id&&<div className="email-delivery"><small>{emailLabel(m)}</small>{['failed','not_configured'].includes(m.email_status)&&m.email_attempts<3&&<form action={retryMessageEmail}><input type="hidden" name="email_message_id" value={m.id}/><button className="secondary">Réessayer l’e-mail</button></form>}</div>}
 </article>)}{!visible.length&&<p>Aucun message. Commencez la discussion.</p>}</div>
 {shared?<p><Link className="button" scroll={false} href={'/messages?dest='+shared.employee_id+'#conversation'}>Écrire à {shared.employee}</Link></p>:canSend?<form action={sendMessage} key={peer.id}><input type="hidden" name="recipient_id" value={peer.id}/><input type="hidden" name="message_key" value={randomUUID()}/><label>Votre message<textarea name="message" rows={3} required maxLength={4000}/></label><button>Envoyer</button></form>:<p>{peer?'Ce collaborateur ne peut pas recevoir de nouveau message.':'Aucun interlocuteur disponible.'}</p>}
 </section></div></>;
}
