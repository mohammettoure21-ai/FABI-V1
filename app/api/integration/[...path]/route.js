import {query,transaction} from '../../../../lib/db.mjs';
import {integrationHandler} from '../../../../lib/integration/handler.mjs';
import {after} from 'next/server';
import {deliverActivityEmails} from '../../../../lib/activity-email.mjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
async function handle(request,{params}){
 const {path}=await params,operation=path.join('/');
 const response=await integrationHandler(request,operation,{db:{query},transaction});
 if(request.method==='POST'&&operation==='operations/execute'&&response.ok)after(async()=>{try{await deliverActivityEmails({query});}catch{console.error('FABI_ACTIVITY_EMAIL_FAILED');}});
 return response;
}
export {handle as GET,handle as POST};
