import {currentUser} from './auth';
import {after} from 'next/server';
import {query} from './db.mjs';
import {recordActivity as record} from './activity-email.mjs';
import {deliverActivityEmails} from './activity-email.mjs';
export function scheduleActivityEmails(){after(async()=>{try{await deliverActivityEmails({query});}catch{console.error('FABI_ACTIVITY_EMAIL_FAILED');}});}
export async function recordActivity(db,userId,action){const id=await record(db,userId,action);const actor=await currentUser();if(actor?.integration_id&&actor.id===userId)await db.query('UPDATE audit SET integration_credential_id=$1 WHERE id=$2',[actor.integration_id,id]);scheduleActivityEmails();return id;}
