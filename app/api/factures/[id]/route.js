import {currentUser} from '../../../../lib/auth';
import {query} from '../../../../lib/db.mjs';
import {downloadInvoice} from '../../../../lib/invoice-http.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,{params}){return downloadInvoice({user:await currentUser(),id:(await params).id,db:{query}});}
