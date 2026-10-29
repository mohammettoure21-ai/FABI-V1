import {parseReminderAction,dakarDate} from './reminder-format.mjs';
import nodemailer from 'nodemailer';
import {gmailConfigured} from './message-email.mjs';
import {emailPolicy,teamEmailsEnabled,pausePendingActivityEmails} from './email-policy.mjs';
// Explicit summaries keep private field values, calendar URLs and account emails
// out of team-wide notifications. Unknown audit entries are never broadcast.
export function activitySummary(action){
 const kinds=[
  [/^Rappel arrivée J-2 · séjour \d+ · arrivée \d{4}-\d{2}-\d{2}$/,"Une arrivée est à préparer dans les deux prochains jours.",'/reservations'],
  [/^Suppression (client|contact|appartement|réservation|séjour|écriture|compte) /,'Un élément a été supprimé du CRM.','/'],
  [/^Création client$/,'Un contact a été ajouté.','/clients'],
  [/^Création appartement$/,'Un appartement a été ajouté.','/appartements'],
  [/^Création réservation$/,'Une réservation a été ajoutée.','/reservations'],
  [/^Annulation réservation /,'Une réservation a été annulée.','/reservations'],
  [/^Modification séjour /,'Un séjour a été modifié.','/reservations'],
  [/^Reprise des dates du calendrier /,'Les dates d’un séjour ont été mises à jour.','/reservations'],
  [/^Création écriture financière /,'Une écriture financière a été ajoutée.','/finances'],
  [/^Paiement écriture financière /,'Le statut d’un paiement a été mis à jour.','/finances'],
  [/^Mise à jour loyer mensuel /,'Un loyer mensuel a été mis à jour.','/finances'],
  [/^Séjour \d+ : /,'Le suivi d’un paiement de séjour a été mis à jour.','/finances'],
  [/^Création compte /,'Un compte collaborateur a été ajouté.','/equipe'],
  [/^Changement statut compte /,'Le statut d’un compte collaborateur a été modifié.','/equipe'],
  [/^Connexion calendrier /,'Un calendrier a été connecté.','/reservations'],
  [/^Déconnexion calendrier /,'Un calendrier a été déconnecté.','/reservations'],
  [/^Mise à jour des séjours par calendrier /,'Des réservations ont changé après synchronisation du calendrier.','/reservations']
 ];
 const match=kinds.find(([pattern])=>pattern.test(action));return match?{text:match[1],path:match[2]}:null;
}
// Same transaction as the change: failed or rolled-back changes send no email.
export async function recordActivity(db,userId,action,{env=process.env}={}){
 const {rows}=await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2) RETURNING id',[userId,action]);
 const summary=activitySummary(action);
 if(summary)await db.query(`INSERT INTO activity_email_deliveries(audit_id,recipient_id,status)
  SELECT $1,id,CASE WHEN $3::boolean OR (role='admin' AND id=(SELECT min(id) FROM users)) THEN 'pending' ELSE 'skipped' END
  FROM users WHERE active=TRUE AND role<>'owner' AND (NOT $2::boolean OR role IN ('admin','manager')) ON CONFLICT DO NOTHING`,[rows[0].id,summary.path==='/finances',teamEmailsEnabled(env)]);
 return rows[0].id;
}
export async function deliverActivityEmails(db,{env=process.env,sendMail,limit=50,now=new Date()}={}){
 // Retain delivery metadata for one week, rather than accumulating it forever.
 await db.query("DELETE FROM activity_email_deliveries WHERE created_at<NOW()-INTERVAL '7 days'");
 const policy=await emailPolicy(db,env);
 await pausePendingActivityEmails(db,policy);
 if(!gmailConfigured(env))return {sent:0,failed:0,configured:false};
 let transport;const totals={sent:0,failed:0,configured:true},started=Date.now();
 try{
  if(!sendMail){transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:env.GMAIL_USER,pass:env.GMAIL_APP_PASSWORD.replace(/\s/g,'')},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});sendMail=mail=>transport.sendMail(mail);}
  for(let i=0;i<limit&&Date.now()-started<20000;i++){
   const {rows}=await db.query(`UPDATE activity_email_deliveries SET status='sending',attempts=attempts+1 WHERE id=(
    SELECT id FROM activity_email_deliveries WHERE status IN ('pending','failed') AND attempts<3 ORDER BY attempts,id FOR UPDATE SKIP LOCKED LIMIT 1
   ) RETURNING id,audit_id,recipient_id`);
   const delivery=rows[0];if(!delivery)break;
   const row=(await db.query(`SELECT a.action,u.name AS actor,r.id,r.email,r.active,r.role FROM audit a LEFT JOIN users u ON u.id=a.user_id JOIN users r ON r.id=$2 WHERE a.id=$1`,[delivery.audit_id,delivery.recipient_id])).rows[0];
   const summary=row&&activitySummary(row.action);
   if(!policy.allows(row)||!summary||row.role==='owner'||(summary.path==='/finances'&&row.role==='employee')){await db.query("UPDATE activity_email_deliveries SET status='skipped' WHERE id=$1",[delivery.id]);continue;}
   const path=(summary.path==='/finances'&&row.role==='employee')||(summary.path==='/equipe'&&row.role!=='admin')?'/':summary.path;
   const reminder=parseReminderAction(row.action);
   let stay;
   if(reminder){
    stay=(await db.query(`SELECT r.arrival::text,p.name AS property_name,r.property_label FROM reservations r LEFT JOIN properties p ON p.id=r.property_id
     JOIN reservation_reminders n ON n.reservation_id=r.id AND n.arrival=r.arrival AND n.audit_id=$3
     WHERE r.id=$1 AND r.arrival=$2::date AND r.status='Confirmée' AND r.calendar_event_kind='reservation'
     AND r.arrival BETWEEN $4::date AND $4::date+2`,[reminder.id,reminder.arrival,delivery.audit_id,dakarDate(now)])).rows[0];
    if(!stay){await db.query("UPDATE activity_email_deliveries SET status='skipped' WHERE id=$1",[delivery.id]);continue;}
   }
   const text=reminder?`Rappel d’arrivée : ${stay.property_name||stay.property_label||'Appartement à préciser'}.\nArrivée prévue le ${new Date(stay.arrival).toLocaleDateString('fr-FR',{timeZone:'Africa/Dakar'})}.\nPréparez l’accueil et vérifiez que l’appartement est prêt.`:`${row.actor??'Synchronisation automatique'} : ${summary.text}`;
   try{
    const result=await sendMail({from:{name:'FABI Conciergerie',address:env.GMAIL_USER},to:row.email,subject:reminder?'FABI — Arrivée à préparer (J−2)':'FABI — Nouvelle activité dans le CRM',text:`${text}\n\nConsultez le CRM avec vos accès habituels : https://fabi-v1.vercel.app${path}\n\nFABI Conciergerie`,messageId:`<fabi-activity-${delivery.id}@gmail.com>`});
    if(!result.accepted?.some(email=>email.toLowerCase()===row.email.toLowerCase()))throw new Error('NOT_ACCEPTED');
   }catch{await db.query("UPDATE activity_email_deliveries SET status='failed' WHERE id=$1",[delivery.id]);totals.failed++;continue;}
   // Do not retry an uncertain SMTP success if persisting its status fails.
   await db.query("UPDATE activity_email_deliveries SET status='sent' WHERE id=$1",[delivery.id]);totals.sent++;
  }
 }finally{transport?.close();}
 return totals;
}
