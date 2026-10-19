import {randomUUID} from 'node:crypto';
import {requireUser} from '../../lib/auth';
import {query} from '../../lib/db.mjs';
import {Header,Messages} from '../components';
import {sendMessage,readMessage} from './actions';
import RefreshMessages from './refresh-messages';
export default async function MessagePage({searchParams}){
 const user=await requireUser(),params=await searchParams;
 const [messages,people]=await Promise.all([
  query('SELECT m.*,s.name AS sender,r.name AS recipient FROM team_messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id WHERE m.recipient_id=$1 OR m.sender_id=$1 ORDER BY m.created_at DESC LIMIT 200',[user.id]),
  user.role==='admin'?query('SELECT id,name FROM users WHERE active=TRUE AND id<>$1 ORDER BY name',[user.id]):Promise.resolve({rows:[]})
 ]);
 return <><Header title="Messages" description="Les consignes de votre équipe."/><Messages params={params}/><RefreshMessages/>{user.role==='admin'&&<section className="panel"><h2>Envoyer un message</h2><form action={sendMessage}><input type="hidden" name="message_key" value={randomUUID()}/><label>À<select name="recipient_id" required defaultValue={people.rows.some(p=>p.id===Number(params.dest))?String(params.dest):''}><option value="">Choisir un collaborateur</option>{people.rows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Commentaire<textarea name="message" rows={4} required maxLength={4000}/></label><p className="muted">Le collaborateur reçoit ce message dans le CRM. Les notifications par e-mail ne sont pas encore activées.</p><button>Envoyer</button></form></section>}<section className="panel"><h2>{user.role==='admin'?'Messages envoyés et reçus':'Vos messages'}</h2>{messages.rows.map(m=><article className={'team-message'+(!m.read_at&&m.recipient_id===user.id?' unread':'')} key={m.id}><div><b>{m.sender_id===user.id?'À '+m.recipient:m.sender}</b><small>{new Date(m.created_at).toLocaleString('fr-FR',{timeZone:'Africa/Dakar'})}</small></div><p>{m.body}</p>{m.read_at?<small>Lu</small>:m.recipient_id===user.id?<form action={readMessage}><input type="hidden" name="message_id" value={m.id}/><button className="secondary">Marquer comme lu</button></form>:<small>Non lu</small>}</article>)}{!messages.rows.length&&<p>Aucun message pour le moment.</p>}</section></>;
}
