import nodemailer from 'nodemailer';
export function gmailConfigured(env=process.env){return Boolean(env.GMAIL_USER&&env.GMAIL_APP_PASSWORD?.replace(/\s/g,''));}
export async function notifyMessageEmail(db,id,senderId,{env=process.env,sendMail}={}){
 // Claim once before contacting SMTP; concurrent requests cannot send twice.
 const claimed=await db.query(`UPDATE team_messages SET email_status='sending',email_attempts=email_attempts+1 WHERE id=$1 AND sender_id=$2 AND email_attempts<3 AND email_status IN ('not_requested','not_configured','failed') RETURNING id`,[id,senderId]);
 if(!claimed.rows.length)return 'unchanged';
 if(!gmailConfigured(env)){
  await db.query("UPDATE team_messages SET email_status='not_configured',email_attempts=GREATEST(0,email_attempts-1) WHERE id=$1",[id]);return 'not_configured';
 }
 const message=(await db.query('SELECT r.email,r.name,r.active,s.name AS sender FROM team_messages m JOIN users r ON r.id=m.recipient_id JOIN users s ON s.id=m.sender_id WHERE m.id=$1',[id])).rows[0];
 if(!message?.active){await db.query("UPDATE team_messages SET email_status='failed' WHERE id=$1",[id]);return 'failed';}
 let transport;
 try{
  if(!sendMail){transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:env.GMAIL_USER,pass:env.GMAIL_APP_PASSWORD.replace(/\s/g,'')},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});sendMail=mail=>transport.sendMail(mail);}
  const result=await sendMail({from:{name:'FABI Conciergerie',address:env.GMAIL_USER},to:message.email,subject:'Nouveau message dans FABI',text:`Bonjour ${message.name},\n\n${message.sender} vous a envoyé un message dans FABI.\n\nConnectez-vous pour le lire : https://fabi-v1.vercel.app/messages\n\nFABI Conciergerie`,messageId:`<fabi-message-${id}@gmail.com>`});
  if(!result.accepted?.some(email=>email.toLowerCase()===message.email.toLowerCase()))throw Object.assign(new Error('NOT_ACCEPTED'),{code:'NOT_ACCEPTED'});
 }catch(error){
  // A lost connection during/after DATA may already have delivered the email.
  // Only definite rejections or pre-delivery failures can be retried safely.
  const definite=['NOT_ACCEPTED','EAUTH','ECONNECTION','EDNS'].includes(error.code)||Number(error.responseCode)>=400;
  if(!definite)return 'uncertain';
  await db.query("UPDATE team_messages SET email_status='failed' WHERE id=$1",[id]);return 'failed';
 }finally{transport?.close();}
 // A failure here leaves 'sending', so an uncertain SMTP result is never retried blindly.
 await db.query("UPDATE team_messages SET email_status='sent',email_sent_at=NOW() WHERE id=$1",[id]);return 'sent';
}

// Bounded batch for response callbacks and the existing daily scheduled job.
export async function deliverPendingMessageEmails(db,options={}){
 if(!gmailConfigured(options.env??process.env)){
  await db.query("UPDATE team_messages SET email_status='not_configured' WHERE email_status='not_requested'");
  return {sent:0,failed:0,configured:false};
 }
 const {rows}=await db.query(`SELECT id,sender_id FROM team_messages
  WHERE email_status IN ('not_requested','not_configured','failed') AND email_attempts<3
  ORDER BY email_attempts,id LIMIT 20`);
 const result={sent:0,failed:0,configured:true},started=Date.now();
 for(const row of rows){
  if(Date.now()-started>20000)break;
  const status=await notifyMessageEmail(db,row.id,row.sender_id,options);
  if(status==='sent')result.sent++;else if(status==='failed')result.failed++;
 }
 return result;
}
