import nodemailer from 'nodemailer';
import {employeePairSQL} from './messages.mjs';
export function gmailConfigured(env=process.env){return Boolean(env.GMAIL_USER&&env.GMAIL_APP_PASSWORD?.replace(/\s/g,''));}
async function deliver(db,id,actorId,observer,{env=process.env,sendMail}={}){
 // Only constant identifiers vary; actor and message IDs remain parameters.
 const table=observer?'team_message_observers':'team_messages';
 const condition=observer?'message_id=$1 AND user_id=$2':'id=$1 AND sender_id=$2';
 const access=observer?" AND EXISTS(SELECT 1 FROM users WHERE id=$2 AND active AND role IN ('admin','manager'))":'';
 const update=(sets)=>db.query(`UPDATE ${table} SET ${sets} WHERE ${condition}`,[id,actorId]);
 const claimed=await db.query(`UPDATE ${table} SET email_status='sending',email_attempts=email_attempts+1
  WHERE ${condition}${access} AND email_attempts<3 AND email_status IN ('not_requested','not_configured','failed') RETURNING email_status`,[id,actorId]);
 if(!claimed.rows.length)return 'unchanged';
 if(!gmailConfigured(env)){await update("email_status='not_configured',email_attempts=GREATEST(0,email_attempts-1)");return 'not_configured';}
 const message=(await db.query(`SELECT target.email,target.name,target.active,target.role,s.name AS sender,
  s.role='employee' OR r.role='employee' AS employee_thread,s.role AS sender_role,r.role AS recipient_role,
  ${employeePairSQL} AS employee_id,CASE WHEN ${employeePairSQL}=s.id THEN r.id ELSE s.id END AS partner_id
  FROM team_messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
  JOIN users target ON target.id=${observer?'$2':'m.recipient_id'}
  WHERE m.id=$1`,observer?[id,actorId]:[id])).rows[0];
 if(!message?.active||(!observer&&((message.recipient_role==='owner'&&message.sender_role!=='admin')||(message.sender_role==='owner'&&message.recipient_role!=='admin')))||(observer&&(!message.employee_thread||!['admin','manager'].includes(message.role)))){
  await update("email_status='failed'");return 'failed';
 }
 const path=observer?`/messages?employee=${message.employee_id}&peer=${message.partner_id}`:'/messages';
 let transport;
 try{
  if(!sendMail){transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:env.GMAIL_USER,pass:env.GMAIL_APP_PASSWORD.replace(/\s/g,'')},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});sendMail=mail=>transport.sendMail(mail);}
  const result=await sendMail({from:{name:'FABI Conciergerie',address:env.GMAIL_USER},to:message.email,subject:observer?'FABI — Nouveau message dans une discussion employé':'Nouveau message dans FABI',text:`Bonjour ${message.name},\n\n${observer?'Une discussion avec un employé contient un nouveau message.':message.sender+' vous a envoyé un message dans FABI.'}\n\nConnectez-vous pour le lire : https://fabi-v1.vercel.app${path}\n\nFABI Conciergerie`,messageId:`<fabi-message-${id}${observer?'-observer-'+actorId:''}@gmail.com>`});
  if(!result.accepted?.some(email=>email.toLowerCase()===message.email.toLowerCase()))throw Object.assign(new Error('NOT_ACCEPTED'),{code:'NOT_ACCEPTED'});
 }catch(error){
  // Never resend blindly after an ambiguous SMTP outcome.
  const definite=['NOT_ACCEPTED','EAUTH','ECONNECTION','EDNS'].includes(error.code)||Number(error.responseCode)>=400;
  if(!definite)return 'uncertain';
  await update("email_status='failed'");return 'failed';
 }finally{transport?.close();}
 await update("email_status='sent',email_sent_at=NOW()");return 'sent';
}
export const notifyMessageEmail=(db,id,senderId,options)=>deliver(db,id,senderId,false,options);
export const notifyObserverEmail=(db,id,userId,options)=>deliver(db,id,userId,true,options);
export async function deliverPendingMessageEmails(db,options={}){
 if(!gmailConfigured(options.env??process.env)){
  await db.query("UPDATE team_messages SET email_status='not_configured' WHERE email_status='not_requested' AND NOT is_supervision");
  await db.query("UPDATE team_message_observers SET email_status='not_configured' WHERE email_status='not_requested'");
  return {sent:0,failed:0,configured:false};
 }
 const {rows}=await db.query(`SELECT * FROM (
  SELECT id,sender_id AS actor_id,FALSE AS observer,email_attempts FROM team_messages
   WHERE NOT is_supervision AND email_status IN ('not_requested','not_configured','failed') AND email_attempts<3
  UNION ALL
  SELECT o.message_id,o.user_id,TRUE,o.email_attempts FROM team_message_observers o JOIN users v ON v.id=o.user_id
   WHERE v.active AND v.role IN ('admin','manager') AND o.email_status IN ('not_requested','not_configured','failed') AND o.email_attempts<3
 ) pending ORDER BY email_attempts,id,observer LIMIT 20`);
 const result={sent:0,failed:0,configured:true},started=Date.now();
 for(const row of rows){
  if(Date.now()-started>20000)break;
  const status=await deliver(db,row.id,row.actor_id,row.observer,options);
  if(status==='sent')result.sent++;else if(status==='failed')result.failed++;
 }
 return result;
}
