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
 const actor=(await db.query('SELECT id,role FROM users WHERE id=$1 AND active FOR SHARE',[user.id])).rows[0];
 if(!actor)throw new Error('Compte inactif');
 const people=(await db.query(`SELECT id,role FROM users WHERE active=TRUE AND id<>$1
  AND ($2<>'owner' OR role='admin') AND ($2='admin' OR role<>'owner') ORDER BY id FOR SHARE`,[user.id,actor.role])).rows;
 const active=new Map(people.map(p=>[p.id,p]));
 const selected=new Set(all?people.map(p=>p.id):recipients);
 if(!selected.size||[...selected].some(id=>!Number.isSafeInteger(id)||!active.has(id)))throw new Error('Destinataire non autorisé');
 const targets=new Set(selected);

 const deliveries=[];
 for(const recipient of targets){
  const result=await db.query(`INSERT INTO team_messages(sender_id,recipient_id,body,request_key,dispatch_key,is_supervision)
   VALUES($1,$2,$3,$4,$5,$6) RETURNING id,recipient_id`,[user.id,recipient,body,deliveries.length?randomUUID():key,key,!selected.has(recipient)]);
  const delivery=result.rows[0];
  // Every new message in an employee thread (including the reply) notifies
  // supervisors separately, without manufacturing an extra conversation.
  await db.query(`INSERT INTO team_message_observers(message_id,user_id)
   SELECT $1,u.id FROM users u WHERE u.active=TRUE AND u.role IN ('admin','manager')
    AND u.id<>$2 AND u.id<>$3
    AND EXISTS(SELECT 1 FROM users p WHERE p.id IN ($2,$3) AND p.role='employee')
   ON CONFLICT DO NOTHING`,[delivery.id,user.id,recipient]);
  deliveries.push(delivery);
 }
 return deliveries;
}
export async function insertMessage(db,user,recipient,body,key){
 const deliveries=await insertMessages(db,user,{recipients:[recipient]},body,key);
 return deliveries.find(row=>row.recipient_id===recipient)?.id;
}

export const employeePairSQL=`CASE WHEN s.role='employee' AND (r.role<>'employee' OR s.id<r.id) THEN s.id ELSE r.id END`;
export async function employeeThreads(db,user){
 return (await db.query(`WITH pairs AS (
  SELECT m.*,${employeePairSQL} AS employee_id,
   CASE WHEN ${employeePairSQL}=s.id THEN r.id ELSE s.id END AS partner_id
  FROM team_messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
  WHERE NOT m.is_supervision AND (s.role='employee' OR r.role='employee')
   AND EXISTS(SELECT 1 FROM users v WHERE v.id=$1 AND v.active AND v.role IN ('admin','manager'))
 ) SELECT DISTINCT ON (p.employee_id,p.partner_id) p.employee_id,p.partner_id,e.name AS employee,pn.name AS partner,p.created_at,p.body,
  (SELECT count(*)::int FROM pairs n JOIN team_message_observers o ON o.message_id=n.id
   WHERE n.employee_id=p.employee_id AND n.partner_id=p.partner_id AND o.user_id=$1 AND o.read_at IS NULL) AS unread
  FROM pairs p JOIN users e ON e.id=p.employee_id JOIN users pn ON pn.id=p.partner_id
  ORDER BY p.employee_id,p.partner_id,p.id DESC`,[user.id])).rows;
}
export async function employeeThread(db,user,employeeId,partnerId,before=2147483647){
 const allowed=(await db.query(`SELECT e.id AS employee_id,e.name AS employee,e.active AS employee_active,
  p.id AS partner_id,p.name AS partner FROM users e JOIN users p ON p.id=$2
  WHERE e.id=$1 AND e.role='employee' AND e.id<>p.id
   AND EXISTS(SELECT 1 FROM users v WHERE v.id=$3 AND v.active AND v.role IN ('admin','manager'))`,[employeeId,partnerId,user.id])).rows[0];
 if(!allowed)return null;
 const {rows}=await db.query(`SELECT m.*,s.name AS sender,r.name AS recipient,
  o.read_at AS observer_read_at,o.user_id AS observer_id,o.email_status AS observer_email_status,o.email_attempts AS observer_email_attempts
  FROM team_messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
  LEFT JOIN team_message_observers o ON o.message_id=m.id AND o.user_id=$3
  WHERE NOT m.is_supervision AND ((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1))
   AND m.id<$4 ORDER BY m.id DESC LIMIT 201`,[employeeId,partnerId,user.id,before]);
 return {...allowed,messages:rows};
}
export async function unreadMessageCount(db,user){
 return (await db.query(`SELECT (
  (SELECT count(*) FROM team_messages m JOIN users sender ON sender.id=m.sender_id JOIN users viewer ON viewer.id=$1 WHERE m.recipient_id=$1 AND NOT m.is_supervision AND m.read_at IS NULL AND (viewer.role<>'owner' OR sender.role='admin') AND (viewer.role='admin' OR sender.role<>'owner'))+
  (SELECT count(*) FROM team_message_observers o JOIN team_messages m ON m.id=o.message_id
   JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
   WHERE o.user_id=$1 AND o.read_at IS NULL AND (s.role='employee' OR r.role='employee')
    AND EXISTS(SELECT 1 FROM users v WHERE v.id=$1 AND v.active AND v.role IN ('admin','manager')))
 )::int AS count`,[user.id])).rows[0].count;
}
export async function readObservedMessage(db,user,id){
 return db.query(`UPDATE team_message_observers o SET read_at=COALESCE(o.read_at,NOW())
  WHERE o.message_id=$1 AND o.user_id=$2
   AND EXISTS(SELECT 1 FROM users v WHERE v.id=$2 AND v.active AND v.role IN ('admin','manager'))
   AND EXISTS(SELECT 1 FROM team_messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
    WHERE m.id=$1 AND (s.role='employee' OR r.role='employee'))`,[id,user.id]);
}
