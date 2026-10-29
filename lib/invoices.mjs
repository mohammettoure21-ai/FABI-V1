import {createHash} from 'node:crypto';
export const MAX_PDF_BYTES=2*1024*1024;
export const MAX_ARCHIVE_BYTES=100*1024*1024;
export const MAX_UPLOAD_BYTES=3*1024*1024;
export class InvoiceError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const fail=(status,code)=>{throw new InvoiceError(status,code);};
const string=(value,max,required=false)=>{
 if(value===undefined||value===null)value='';
 if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))fail(400,'INVALID_INVOICE');
 value=value.trim();if(required&&!value)fail(400,'INVALID_INVOICE');return value;
};
const id=value=>{if(value===undefined||value===null||value==='')return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>2147483647)fail(400,'INVALID_INVOICE');return n;};
export function validateInvoice(input,pdf){
 if(!Buffer.isBuffer(pdf)||!pdf.length)fail(400,'PDF_REQUIRED');
 if(pdf.length>MAX_PDF_BYTES)fail(413,'PDF_TOO_LARGE');
 // File extensions and MIME types alone cannot establish that this is a PDF.
 // PDFs are downloaded as attachments with sandbox headers, never embedded in the CRM.
 if(!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(pdf.subarray(0,16).toString('latin1'))||!/%{2}EOF\s*$/.test(pdf.subarray(-2048).toString('latin1')))fail(400,'INVALID_PDF');
 const filename=string(input.filename,200,true);
 if(!/\.pdf$/i.test(filename))fail(400,'INVALID_PDF');
 const date=string(input.issued_on,10);
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))fail(400,'INVALID_INVOICE_DATE');
 return {title:string(input.title,160,true),reference:string(input.reference,100),issued_on:date||null,
  property_id:id(input.property_id),client_id:id(input.client_id),notes:string(input.notes,2000),
  filename:filename.replace(/[^\p{L}\p{N} ._()-]/gu,'_'),pdf,sha256:createHash('sha256').update(pdf).digest('hex')};
}
export function invoiceReadAllowed(user){return Boolean(user&&['admin','manager'].includes(user.role));}
export function invoiceWriteAllowed(user){return user?.role==='admin';}
export const invoiceMessages={
 PDF_REQUIRED:'Choisissez un fichier PDF.',PDF_TOO_LARGE:'Le PDF doit peser au maximum 2 Mo.',
 INVALID_PDF:'Le fichier doit être un PDF terminé, avec une extension .pdf.',
 INVALID_INVOICE:'Vérifiez le nom et les champs de la facture.',INVALID_INVOICE_DATE:'Vérifiez la date de la facture, ou laissez-la vide.',
 INVOICE_LINK_NOT_FOUND:'Le contact ou l’appartement sélectionné n’existe plus.',
 INVOICE_ARCHIVE_FULL:'L’espace de factures est plein (100 Mo). Contactez l’administrateur avant tout nouvel ajout.',
 BODY_TOO_LARGE:'Le fichier envoyé est trop volumineux. Maximum : 2 Mo par PDF.'
};
// Call inside a transaction. Identical bytes return the original document without overwriting it.
export async function storeInvoice(db,input,pdf,user){
 if(!invoiceWriteAllowed(user))fail(403,'INVOICE_FORBIDDEN');
 const data=validateInvoice(input,pdf);
 if(data.property_id&&!(await db.query('SELECT id FROM properties WHERE id=$1 FOR SHARE',[data.property_id])).rows.length)fail(400,'INVOICE_LINK_NOT_FOUND');
 if(data.client_id&&!(await db.query('SELECT id FROM clients WHERE id=$1 FOR SHARE',[data.client_id])).rows.length)fail(400,'INVOICE_LINK_NOT_FOUND');
 // Serialize inserts to enforce the total quota even for concurrent uploads.
 await db.query("SELECT pg_advisory_xact_lock(hashtext('fabi-invoice-archive'))");
 const existing=(await db.query('SELECT id,title FROM invoice_documents WHERE sha256=$1',[data.sha256])).rows[0];
 if(existing)return {...existing,already_saved:true,download_url:'/api/factures/'+existing.id};
 const used=Number((await db.query('SELECT COALESCE(SUM(size_bytes),0)::bigint AS used FROM invoice_documents')).rows[0].used);
 if(used+pdf.length>MAX_ARCHIVE_BYTES)fail(413,'INVOICE_ARCHIVE_FULL');
 const saved=(await db.query(`INSERT INTO invoice_documents(title,reference,issued_on,property_id,client_id,notes,filename,pdf,sha256,size_bytes,created_by,integration_credential_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,title`,[data.title,data.reference,data.issued_on,data.property_id,data.client_id,data.notes,data.filename,data.pdf,data.sha256,pdf.length,user.id,user.integration_id??null])).rows[0];
 await db.query('INSERT INTO audit(user_id,action,integration_credential_id) VALUES($1,$2,$3)',[user.id,'Archivage facture PDF '+saved.id,user.integration_id??null]);
 return {...saved,already_saved:false,download_url:'/api/factures/'+saved.id};
}
export async function listInvoices(db,filters={}){
 const q=string(filters.q,120),propertyId=id(filters.property_id),page=Math.max(1,Math.min(100000,Number.parseInt(filters.page,10)||1));
 const values=['%'+q+'%',propertyId];
 const where=`WHERE (d.title ILIKE $1 OR d.reference ILIKE $1 OR COALESCE(c.name,'') ILIKE $1) AND ($2::integer IS NULL OR d.property_id=$2)`;
 const count=Number((await db.query(`SELECT count(*) AS n FROM invoice_documents d LEFT JOIN clients c ON c.id=d.client_id ${where}`,values)).rows[0].n);
 const {rows}=await db.query(`SELECT d.id,d.title,d.reference,d.issued_on,d.property_id,d.client_id,d.notes,d.filename,d.size_bytes,d.created_at,p.name AS property_name,c.name AS client_name,
 CASE WHEN d.integration_credential_id IS NULL THEN u.name ELSE ic.name END AS saved_by
 FROM invoice_documents d LEFT JOIN properties p ON p.id=d.property_id LEFT JOIN clients c ON c.id=d.client_id JOIN users u ON u.id=d.created_by
 LEFT JOIN integration_credentials ic ON ic.id=d.integration_credential_id ${where} ORDER BY d.created_at DESC,d.id DESC LIMIT 50 OFFSET $3`,[...values,(page-1)*50]);
 return {invoices:rows.map(row=>({...row,download_url:'/api/factures/'+row.id})),total:count,page,pages:Math.max(1,Math.ceil(count/50))};
}
export function pdfResponse(row){
 return new Response(new Uint8Array(row.pdf),{headers:{
  'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="facture-${row.id}.pdf"; filename*=UTF-8''${encodeURIComponent(row.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,
  'Content-Length':String(row.pdf.length),'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'
 }});
}
