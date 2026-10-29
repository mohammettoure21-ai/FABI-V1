import {currentUser} from '../../../lib/auth';
import {transaction} from '../../../lib/db.mjs';
import {uploadInvoice} from '../../../lib/invoice-http.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request){return uploadInvoice(request,{user:await currentUser(),transaction});}
