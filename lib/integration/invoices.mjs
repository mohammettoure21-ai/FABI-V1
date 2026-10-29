import {deny} from './auth.mjs';
import {MAX_PDF_BYTES,storeInvoice,listInvoices} from '../invoices.mjs';
// The existing full-business dashboard grant already permits these same operations
// through the browser. Reuse it; never silently upgrade a read-only credential.
export async function invoices(db,credential,input){
 if(credential.property_ids!==null)deny(403,'PROPERTY_DENIED');
 return listInvoices(db,input);
}
export async function saveInvoice(db,credential,input){
 if(credential.property_ids!==null)deny(403,'PROPERTY_DENIED');
 if(input.confirmed!==true)deny(400,'CONFIRMATION_REQUIRED');
 const encoded=input.pdf_base64;
 if(typeof encoded!=='string'||encoded.length>Math.ceil(MAX_PDF_BYTES/3)*4)deny(413,'PDF_TOO_LARGE');
 if(!encoded.length||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))deny(400,'INVALID_PDF');
 const pdf=Buffer.from(encoded,'base64');
 if(pdf.toString('base64')!==encoded)deny(400,'INVALID_PDF');
 const result=await storeInvoice(db,input,pdf,{id:credential.created_by,role:'admin',integration_id:credential.id});
 return {...result,archived:true,accounting_changed:false};
}
