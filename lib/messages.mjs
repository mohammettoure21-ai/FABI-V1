// Call within a transaction: serialize cleanup with sends, so a reply cannot
// race expiry and lose the conversation's earlier messages.
export async function expireConversations(db){
 await db.query('LOCK TABLE team_messages IN SHARE ROW EXCLUSIVE MODE');
 return db.query(`DELETE FROM team_messages m USING (
  SELECT LEAST(sender_id,recipient_id) AS a,GREATEST(sender_id,recipient_id) AS b
  FROM team_messages GROUP BY 1,2
  HAVING MAX(created_at)<=NOW()-INTERVAL '7 days'
 ) expired WHERE LEAST(m.sender_id,m.recipient_id)=expired.a
 AND GREATEST(m.sender_id,m.recipient_id)=expired.b`);
}
export async function insertMessage(db,user,recipient,body,key){
 await expireConversations(db);
 const target=(await db.query('SELECT id,role FROM users WHERE id=$1 AND active=TRUE FOR SHARE',[recipient])).rows[0];
 if(!target||recipient===user.id||(user.role!=='admin'&&target.role!=='admin'))throw new Error('Destinataire non autorisé');
 return (await db.query('INSERT INTO team_messages(sender_id,recipient_id,body,request_key) VALUES($1,$2,$3,$4) ON CONFLICT(request_key) DO NOTHING RETURNING id',[user.id,recipient,body,key])).rows[0]?.id;
}
