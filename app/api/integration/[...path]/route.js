import {query,transaction} from '../../../../lib/db.mjs';
import {integrationHandler} from '../../../../lib/integration/handler.mjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
async function handle(request,{params}){const {path}=await params;return integrationHandler(request,path.join('/'),{db:{query},transaction});}
export {handle as GET,handle as POST};
