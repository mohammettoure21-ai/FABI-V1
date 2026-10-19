import {after} from 'next/server';
import {query} from './db.mjs';
import {recordActivity as record} from './activity-email.mjs';
import {deliverActivityEmails} from './activity-email.mjs';
export function scheduleActivityEmails(){after(async()=>{try{await deliverActivityEmails({query});}catch{console.error('FABI_ACTIVITY_EMAIL_FAILED');}});}
export async function recordActivity(db,userId,action){const id=await record(db,userId,action);scheduleActivityEmails();return id;}
