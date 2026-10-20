import {after} from 'next/server';
import {query} from './db.mjs';
import {deliverPendingMessageEmails} from './message-email.mjs';
export function scheduleMessageEmails(){
 after(async()=>{try{await deliverPendingMessageEmails({query});}catch{console.error('FABI_MESSAGE_EMAIL_FAILED');}});
}
