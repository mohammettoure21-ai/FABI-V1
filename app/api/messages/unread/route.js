import {requireUser} from '../../../../lib/auth';
import {query} from '../../../../lib/db.mjs';
export const dynamic='force-dynamic';
export async function GET(){const user=await requireUser();const {rows}=await query('SELECT count(*)::int AS count FROM team_messages WHERE recipient_id=$1 AND read_at IS NULL',[user.id]);return Response.json(rows[0],{headers:{'Cache-Control':'private, no-store'}});}
