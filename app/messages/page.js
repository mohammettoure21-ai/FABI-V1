import {randomUUID} from 'node:crypto';
import Link from 'next/link';
import {requireUser} from '../../lib/auth';
import {query,transaction} from '../../lib/db.mjs';
import {expireConversations} from '../../lib/messages.mjs';
import {Header,Messages} from '../components';
import {sendMessage,readMessage,retryMessageEmail} from './actions';
import RefreshMessages from './refresh-messages';
import RecipientPicker from './recipient-picker';
export default async function MessagePage({searchParams}){
 const user=await requireUser(),params=await searchParams;
 await transaction(expireConversations);
 const [threads,people]=await Promise.all([
  query(`SELECT DISTINCT ON (p.id) p.id,p.name,p.active,m.body,m.created_at,
   (SELECT count(*)::int FROM team_messages n WHERE n.sender_id=p.id AND n.recipient_id=$1 AND n.read_at IS NULL) AS unread
   FROM team_messages m JOIN users p ON p.id=CASE WHEN m.sender_id=$1 THEN m.recipient_id ELSE m.sender_id END
   WHERE m.sender_id=$1 OR m.recipient_id=$1 ORDER BY p.id,m.created_at DESC,m.id DESC`,[user.id]),
  query("SELECT id,name,role,active FROM users WHERE active=TRUE AND id<>$1 ORDER BY name",[user.id])
 ]);
 const contacts=new Map(people.rows.map(p=>[p.id,p]));
 for(const t of threads.rows)if(!contacts.has(t.id))contacts.set(t.id,t);
 const ordered=threads.rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const requested=Number(params.dest),peer=contacts.get(requested)??contacts.get(ordered[0]?.id)??people.rows[0];
 const before=Number(params.before),cursor=Number.isSafeInteger(before)&&before>0?before:2147483647;
 const messages=peer?(await query(`SELECT m.*,s.name AS sender FROM team_messages m JOIN users s ON s.id=m.sender_id
  WHERE ((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1)) AND m.id<$3
  ORDER BY m.id DESC LIMIT 201`,[user.id,peer.id,cursor])).rows:[];
 const more=messages.length>200,visible=messages.slice(0,200).reverse();
 const canSend=peer?.active&&people.rows.some(p=>p.id===peer.id);
 return <><Header title="Messages" description="Échangez avec un collaborateur, plusieurs personnes ou toute l’équipe."/><Messages params={params}/><RefreshMessages/>
 <p className="message-retention">Les discussions sont supprimées après 7 jours sans nouveau message. Chaque nouveau message relance ce délai.</p>
 <p className="message-retention">Les nouveaux messages des employés sont également transmis aux administrateurs et responsables actifs, avec leur notification e-mail. Les anciennes discussions ne sont pas redistribuées.</p>
 {people.rows.length>0&&<section className="panel"><h2>Nouveau message</h2><form action={sendMessage}>
 <input type="hidden" name="message_key" value={randomUUID()}/><RecipientPicker people={people.rows}/>
 <label>Message à envoyer<textarea name="message" rows={3} required maxLength={4000}/></label><button>Envoyer le message</button>
 <p className="muted">La notification e-mail contient un lien vers FABI, sans le contenu du message. Sa réception dépend de la configuration Gmail.</p>
 </form></section>}
 <div className="messaging"><section className="panel conversation-list" aria-label="Discussions"><h2>Discussions</h2>
 {ordered.map(t=><Link className={peer?.id===t.id?'selected':''} key={t.id} href={'/messages?dest='+t.id}><b>{t.name}</b>{t.unread>0&&<span className="pill">{t.unread} non lu{t.unread>1?'s':''}</span>}<p>{t.body.slice(0,90)}</p></Link>)}
 <form action="/messages" method="get"><label>Nouvelle discussion<select name="dest" required defaultValue=""><option value="">Choisir un collaborateur</option>{people.rows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="secondary">Ouvrir</button></form></section>
 <section className="panel conversation" aria-label="Conversation"><h2>{peer?.name??'Votre messagerie'}</h2>
 {more&&<Link href={'/messages?dest='+peer.id+'&before='+visible[0].id}>Voir les messages précédents</Link>}
 {params.before&&peer&&<p><Link href={'/messages?dest='+peer.id}>Revenir aux derniers messages</Link></p>}
 <div className="conversation-history">{visible.map(m=><article className={'team-message message-bubble'+(m.sender_id===user.id?' mine':'')+(!m.read_at&&m.recipient_id===user.id?' unread':'')} key={m.id}>
 <div><b>{m.sender_id===user.id?'Vous':m.sender}</b><small>{new Date(m.created_at).toLocaleString('fr-FR',{timeZone:'Africa/Dakar'})}</small></div><p>{m.body}</p>{m.is_supervision&&<small>Copie de suivi à l’encadrement</small>}
 {m.read_at?<small>Lu</small>:m.recipient_id===user.id?<form action={readMessage}><input type="hidden" name="message_id" value={m.id}/><button className="secondary">Marquer comme lu</button></form>:<small>Non lu</small>}
 {m.sender_id===user.id&&<div className="email-delivery"><small>{m.email_status==='sent'?'Notification e-mail transmise':m.email_status==='sending'?'Envoi e-mail en cours ou à vérifier':m.email_status==='failed'?'Notification e-mail non envoyée':m.email_status==='not_configured'?'Gmail non configuré':m.email_attempts>=3?'Nombre maximal de tentatives atteint':'Notification e-mail en attente'}</small>{['failed','not_configured'].includes(m.email_status)&&m.email_attempts<3&&<form action={retryMessageEmail}><input type="hidden" name="email_message_id" value={m.id}/><button className="secondary">Réessayer l’e-mail</button></form>}</div>}
 </article>)}{!visible.length&&<p>Aucun message. Commencez la discussion.</p>}</div>
 {canSend?<form action={sendMessage} key={peer.id}><input type="hidden" name="recipient_id" value={peer.id}/><input type="hidden" name="message_key" value={randomUUID()}/><label>Votre message<textarea name="message" rows={3} required maxLength={4000}/></label><button>Envoyer</button></form>:<p>{peer?'Ce collaborateur ne peut pas recevoir de nouveau message.':'Aucun interlocuteur disponible.'}</p>}
 </section></div></>;
}
