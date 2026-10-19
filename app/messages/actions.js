'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireUser} from '../../lib/auth';
import {insertMessage,expireConversations} from '../../lib/messages.mjs';
import {notifyMessageEmail} from '../../lib/message-email.mjs';
import {query,transaction} from '../../lib/db.mjs';
import {integer,text} from '../../lib/security.mjs';
export async function sendMessage(form){
 const user=await requireUser();let recipient,body,key,messageId;
 try{recipient=integer(form.get('recipient_id'),1);body=text(form.get('message'),4000);key=String(form.get('message_key'));if(!body||recipient===user.id||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/i.test(key))throw new Error();}
 catch{redirect('/messages?erreur=Choisissez+un+destinataire+et+écrivez+un+message');}
 try{await transaction(async db=>{
  messageId=await insertMessage(db,user,recipient,body,key);
  if(messageId)await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[user.id,'Message envoyé #'+messageId]);
 });}catch{redirect('/messages?erreur=Message+non+envoyé');}
 let delivery='unchanged';
 if(messageId){try{delivery=await notifyMessageEmail({query},messageId,user.id);}catch{delivery='failed';}}
 revalidatePath('/messages');revalidatePath('/','layout');redirect('/messages?dest='+recipient+'&succes='+encodeURIComponent(delivery==='sent'?'Message envoyé et notification e-mail transmise.':delivery==='not_configured'?'Message envoyé dans le CRM. Gmail reste à connecter.':delivery==='failed'?'Message envoyé dans le CRM. Notification e-mail non confirmée.':'Message déjà enregistré.'));

}
export async function readMessage(form){
 const user=await requireUser();let id;try{id=integer(form.get('message_id'),1);}catch{redirect('/messages');}
 const peer=await transaction(async db=>{await expireConversations(db);return (await db.query('UPDATE team_messages SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND recipient_id=$2 RETURNING sender_id',[id,user.id])).rows[0]?.sender_id;});
 revalidatePath('/messages');revalidatePath('/','layout');redirect(peer?'/messages?dest='+peer:'/messages');
}

export async function retryMessageEmail(form){
 const user=await requireUser();let id;try{id=integer(form.get('email_message_id'),1);}catch{redirect('/messages');}
 await transaction(expireConversations);
 let result;try{result=await notifyMessageEmail({query},id,user.id);}catch{result='failed';}
 revalidatePath('/messages');redirect('/messages?succes='+encodeURIComponent(result==='sent'?'Notification e-mail transmise.':result==='not_configured'?'Gmail reste à connecter.':result==='failed'?'Envoi e-mail impossible. Vérifiez la configuration Gmail.':'Aucun nouvel e-mail envoyé.'));
}
