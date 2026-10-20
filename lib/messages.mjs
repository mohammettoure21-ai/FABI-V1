import {randomUUID} from 'node:crypto';
// Serialize cleanup and sends so replies cannot lose the earlier conversation.
export async function expireConversations(db){
 await db.query('LOCK TABLE team_messages IN SHARE ROW EXCLUSIVE MODE');
 return db.query(`DELETE FROM team_messages m USING (
  SELECT LEAST(sender_id,recipient_id) AS a,GREATEST(sender_id,recipient_id) AS b
  FROM team_messages GROUP BY 1,2
  HAVING MAX(created_at)<=NOW()-INTERVAL '7 days'
 ) expired WHERE LEAST(m.sender_id,m.recipient_id)=expired.a
 AND GREATEST(m.sender_id,m.recipient_id)=expired.b`);
}
// One transaction for all recipients. A retry cannot extend or duplicate a send.
export async function insertMessages(db,user,{recipients=[],all=false},body,key){
 if(!body?.trim()||body.length>4000||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/i.test(key))throw new Error('Message invalide');
 await expireConversations(db);
 if((await db.query('SELECT id FROM team_messages WHERE request_key=$1 OR dispatch_key=$1 LIMIT 1',[key])).rows.length)return [];
 const people=(await db.query('SELECT id,role FROM users WHERE active=TRUE AND id<>$1 ORDER BY id FOR SHARE',[user.id])).rows;
 const active=new Map(people.map(p=>[p.id,p]));
 const selected=new Set(all?people.map(p=>p.id):recipients);
 if(!selected.size||[...selected].some(id=>!Number.isSafeInteger(id)||!active.has(id)))throw new Error('Destinataire non autorisé');
 const targets=new Set(selected);
 // New employee messages are also delivered to active administrators/managers.
 if(user.role==='employee')for(const person of people)if(['admin','manager'].includes(person.role))targets.add(person.id);
 const deliveries=[];
 for(const recipient of targets){
  const result=await db.query(`INSERT INTO team_messages(sender_id,recipient_id,body,request_key,dispatch_key,is_supervision)
   VALUES($1,$2,$3,$4,$5,$6) RETURNING id,recipient_id`,[user.id,recipient,body,deliveries.length?randomUUID():key,key,!selected.has(recipient)]);
  deliveries.push(result.rows[0]);
 }
 return deliveries;
}
export async function insertMessage(db,user,recipient,body,key){
 const deliveries=await insertMessages(db,user,{recipients:[recipient]},body,key);
 return deliveries.find(row=>row.recipient_id===recipient)?.id;
}
