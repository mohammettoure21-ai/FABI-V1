// Pause requested by the founder. Only an explicit future configuration change
// can resume team email. The original installation account is never replaced
// by a different administrator when inactive or demoted.
export const teamEmailsEnabled=(env=process.env)=>env.FABI_TEAM_EMAILS_ENABLED==='true';
export async function emailPolicy(db,env=process.env){
 const founderId=(await db.query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0]?.id??null;
 const team=teamEmailsEnabled(env);
 return {founderId,team,allows:user=>Boolean(user?.active&&(team||(user.role==='admin'&&user.id===founderId)))};
}
export async function pausePendingMessageEmails(db,policy){
 if(policy.team)return;
 // Keep bodies, unread state, original recipients and SMTP history intact.
 // Sent or uncertain SMTP outcomes must never be relabelled as paused.
 await db.query(`UPDATE team_messages m SET email_paused=TRUE
  WHERE NOT m.email_paused AND m.email_status IN ('not_requested','not_configured','failed')
  AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=m.recipient_id AND u.id=$1 AND u.active AND u.role='admin')`,[policy.founderId]);
 await db.query(`UPDATE team_message_observers o SET email_paused=TRUE
  WHERE NOT o.email_paused AND o.email_status IN ('not_requested','not_configured','failed')
  AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=o.user_id AND u.id=$1 AND u.active AND u.role='admin')`,[policy.founderId]);
}
export async function pausePendingActivityEmails(db,policy){
 if(policy.team)return;
 await db.query(`UPDATE activity_email_deliveries d SET status='skipped'
  WHERE d.status IN ('pending','failed') AND NOT EXISTS(
   SELECT 1 FROM users u WHERE u.id=d.recipient_id AND u.id=$1 AND u.active AND u.role='admin')`,[policy.founderId]);
}
