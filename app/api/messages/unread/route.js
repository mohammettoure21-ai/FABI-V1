import {requireUser} from '../../../../lib/auth';
import {query} from '../../../../lib/db.mjs';
import {unreadMessageCount} from '../../../../lib/messages.mjs';
export const dynamic='force-dynamic';
export async function GET(){const user=await requireUser();const count=await unreadMessageCount({query},user);return Response.json({count},{headers:{'Cache-Control':'private, no-store'}});}
