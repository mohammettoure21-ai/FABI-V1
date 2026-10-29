import {MAX_UPLOAD_BYTES,invoiceReadAllowed,invoiceWriteAllowed,storeInvoice,pdfResponse,invoiceMessages,InvoiceError} from './invoices.mjs';
const error=(message,status)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
// Bound reads before parsing multipart: protects requests without Content-Length too.
export async function boundedBody(request,max=MAX_UPLOAD_BYTES){
 if(Number(request.headers.get('content-length'))>max)throw new InvoiceError(413,'BODY_TOO_LARGE');
 if(!request.body)return Buffer.alloc(0);
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new InvoiceError(413,'BODY_TOO_LARGE');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
export async function uploadInvoice(request,{user,transaction}){
 if(!user)return error('AUTHENTICATION_REQUIRED',401);
 if(!invoiceWriteAllowed(user))return error('INVOICE_FORBIDDEN',403);
 // A cookie alone is insufficient for a write: require the browser's same-origin POST.
 // Next's internal URL may use localhost behind a proxy. The browser's Host
 // remains the target authority; do not trust X-Forwarded-Host from the caller.
 const expected=new URL(request.url);expected.host=request.headers.get('host')??expected.host;
 if(request.headers.get('origin')!==expected.origin)return error('INVALID_ORIGIN',403);
 const back=(key,message)=>new Response(null,{status:303,headers:{Location:'/factures?'+new URLSearchParams({[key]:message}),'Cache-Control':'no-store'}});
 try{
  if(!/^multipart\/form-data;\s*boundary=/i.test(request.headers.get('content-type')??''))throw new InvoiceError(400,'PDF_REQUIRED');
  const bytes=await boundedBody(request);
  const form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')},body:bytes}).formData();
  const file=form.get('pdf');if(!file||typeof file.arrayBuffer!=='function')throw new InvoiceError(400,'PDF_REQUIRED');
  const input=Object.fromEntries(['title','reference','issued_on','property_id','client_id','notes'].map(name=>[name,form.get(name)]));
  input.filename=file.name;
  const pdf=Buffer.from(await file.arrayBuffer());
  const saved=await transaction(db=>storeInvoice(db,input,pdf,user));
  return back('succes',saved.already_saved?'Ce PDF est déjà enregistré. L’original est conservé.':'Facture PDF enregistrée.');
 }catch(e){return back('erreur',invoiceMessages[e.code]??'La facture n’a pas été enregistrée. Vérifiez le fichier et réessayez.');}
}
export async function downloadInvoice({user,id,db}){
 if(!user)return error('AUTHENTICATION_REQUIRED',401);
 if(!invoiceReadAllowed(user))return error('INVOICE_FORBIDDEN',403);
 if(!/^[1-9]\d{0,9}$/.test(String(id))||Number(id)>2147483647)return error('NOT_FOUND',404);
 const row=(await db.query('SELECT id,filename,pdf FROM invoice_documents WHERE id=$1',[id])).rows[0];
 if(!row)return error('NOT_FOUND',404);
 return pdfResponse(row);
}
