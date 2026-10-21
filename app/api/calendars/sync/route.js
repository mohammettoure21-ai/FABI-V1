import {scheduleMessageEmails} from '../../../../lib/message-delivery';
import {scheduleActivityEmails} from '../../../../lib/activity';
import {timingSafeEqual} from 'node:crypto';
import {expireConversations} from '../../../../lib/messages.mjs';
import {query,transaction,syncRecurringExpenses} from '../../../../lib/db.mjs';
import {syncCalendar} from '../../../../lib/calendar-sync.mjs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request) {
 const secret=process.env.CRON_SECRET,provided=request.headers.get('authorization')??'';
 const expected='Bearer '+(secret??'');
 const a=Buffer.from(provided),b=Buffer.from(expected);
 if(!secret||a.length!==b.length||!timingSafeEqual(a,b))return Response.json({error:'Unauthorized'},{status:401});
 try{
  const expenses=await syncRecurringExpenses();
  await transaction(expireConversations);
  scheduleActivityEmails();
  scheduleMessageEmails();
  const {rows}=await query('SELECT id FROM calendar_connections WHERE active=TRUE ORDER BY last_attempt_at NULLS FIRST,id LIMIT 10');
  const results=[];
  for(const connection of rows)results.push({id:connection.id,...await syncCalendar(connection.id)});
  return Response.json({expenses,synchronized:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length},{status:results.some(r=>!r.ok)?207:200});
 }catch{console.error('FABI_CALENDAR_CRON_FAILED');return Response.json({error:'Synchronization failed'},{status:500});}
}
