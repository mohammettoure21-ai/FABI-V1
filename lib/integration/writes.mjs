import {randomUUID} from 'node:crypto';
import {dates} from '../security.mjs';
import {activities,serviceTypes} from '../finance.mjs';
import {recordActivity} from '../activity-email.mjs';
import {deny,requireProperty} from './auth.mjs';

const requiredScope={reservation:'reservations:create',expense:'expenses:create'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function number(value,min=0,max=1000000000){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)deny(400,'INVALID_NUMBER');return value;}
function string(value,max,required=false){if(value===undefined&&!required)return '';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))deny(400,'INVALID_TEXT');return value.trim();}
function fields(input,allowed){if(Object.keys(input).some(k=>!allowed.includes(k)))deny(400,'UNKNOWN_FIELD');}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||Number(value.slice(0,4))<2000||Number(value.slice(0,4))>2200)deny(400,'INVALID_DATES');return value;}
async function property(db,credential,id){
 if(id===null){if(credential.property_ids!==null)deny(403,'PROPERTY_DENIED');return {id:null,name:'FABI Conciergerie'};}
 number(id,1,2147483647);requireProperty(credential,id);
 const row=(await db.query('SELECT id,name,status FROM properties WHERE id=$1 FOR SHARE',[id])).rows[0];
 if(!row)deny(404,'PROPERTY_NOT_FOUND');return row;
}
async function reservation(db,credential,input){
 fields(input,['property_id','client_id','guest_name','arrival','departure','guests','nightly','total','status','source']);
 const arrival=date(input.arrival),departure=date(input.departure);
 try{dates(arrival,departure);}catch{deny(400,'INVALID_DATES');}
 const nights=(Date.parse(departure)-Date.parse(arrival))/86400000;
 if(nights>370)deny(400,'PERIOD_TOO_LONG');
 if(!['En attente','Confirmée'].includes(input.status)||!['Direct','Airbnb','Booking','Agent','Autre'].includes(input.source))deny(400,'INVALID_BOOKING_STATUS_OR_SOURCE');
 const p=await property(db,credential,input.property_id);if(p.status!=='Disponible')deny(409,'PROPERTY_UNAVAILABLE');
 const clientId=input.client_id==null?null:number(input.client_id,1,2147483647);
 let guest=string(input.guest_name,120,clientId===null);
 if(clientId!==null){const client=(await db.query("SELECT name FROM clients WHERE id=$1 AND contact_type='client' FOR SHARE",[clientId])).rows[0];if(!client)deny(404,'CLIENT_NOT_FOUND');if(!guest)guest=client.name;}
 const payload={property_id:p.id,client_id:clientId,guest_name:guest,arrival,departure,guests:number(input.guests,1,100),nightly:input.nightly==null?null:number(input.nightly),total:input.total==null?null:number(input.total),status:input.status,source:input.source};
 if(payload.status==='Confirmée'&&(await db.query("SELECT id FROM reservations WHERE property_id=$1 AND status='Confirmée' AND calendar_event_kind='reservation' AND arrival<$3::date AND departure>$2::date LIMIT 1",[p.id,arrival,departure])).rows.length)deny(409,'BOOKING_OVERLAP');
 return {payload,summary:{...payload,property_name:p.name,nights,total_amount:payload.total??(payload.nightly===null?null:payload.nightly*nights),currency:'XOF'}};
}
async function expense(db,credential,input){
 fields(input,['property_id','date','description','amount','activity','provider','quantity','comment']);
 const when=date(input.date),p=await property(db,credential,input.property_id??null);
 if(!activities.includes(input.activity))deny(400,'INVALID_CATEGORY');
 const service=serviceTypes.includes(input.activity),quantity=number(input.quantity??1,1,100),amount=number(input.amount,1);
 if(!service&&quantity!==1)deny(400,'QUANTITY_REQUIRES_SERVICE');
 if(service&&amount%quantity!==0)deny(400,'INVALID_SERVICE_UNIT_AMOUNT');
 const payload={property_id:p.id,date:when,description:string(input.description,200,true),amount,activity:input.activity,provider:string(input.provider,120,service||input.activity==='Employé'),quantity,comment:string(input.comment,1000)};
 return {payload,summary:{...payload,property_name:p.name,payment_status:'Payé',currency:'XOF'}};
}
const normalize={reservation,expense};
async function prepare(db,credential,kind,input){
 if(!credential.scopes.includes(requiredScope[kind]))deny(403,'SCOPE_DENIED');
 const count=(await db.query('SELECT count(*)::int n FROM integration_operations WHERE credential_id=$1 AND result IS NULL AND expires_at>NOW()',[credential.id])).rows[0].n;
 if(count>=100)deny(429,'TOO_MANY_PENDING_OPERATIONS');
 const {payload,summary}=await normalize[kind](db,credential,input),id=randomUUID();
 const row=(await db.query('INSERT INTO integration_operations(id,credential_id,kind,payload,summary) VALUES($1,$2,$3,$4,$5) RETURNING expires_at',[id,credential.id,kind,JSON.stringify(payload),JSON.stringify(summary)])).rows[0];
 return {operation_id:id,kind,summary,expires_at:row.expires_at,confirmation_required:true,confirmation_channel:'Hermes : demander un accord explicite au propriétaire avant exécution.'};
}
export const prepareReservation=(db,credential,input)=>prepare(db,credential,'reservation',input);
export const prepareExpense=(db,credential,input)=>prepare(db,credential,'expense',input);

export async function executeOperation(db,credential,input){
 fields(input,['operation_id','confirmed']);
 if(!uuid.test(input.operation_id??''))deny(400,'INVALID_OPERATION_ID');
 if(input.confirmed!==true)deny(400,'HUMAN_CONFIRMATION_REQUIRED');
 const operation=(await db.query('SELECT * FROM integration_operations WHERE id=$1 AND credential_id=$2 FOR UPDATE',[input.operation_id,credential.id])).rows[0];
 if(!operation)deny(404,'OPERATION_NOT_FOUND');
 if(!credential.scopes.includes(requiredScope[operation.kind]))deny(403,'SCOPE_DENIED');
 if(operation.result)return {...operation.result,already_executed:true};
 if(new Date(operation.expires_at)<=new Date())deny(410,'OPERATION_EXPIRED');
 // Recheck inventory, property scope and client references at execution time.
 const {payload:p}=await normalize[operation.kind](db,credential,operation.payload);
 let id,action;
 if(operation.kind==='reservation'){
  const result=await db.query(`INSERT INTO reservations(client_id,property_id,arrival,departure,guests,nightly,agreed_total,status,source,assigned_to,guest_label)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,[p.client_id,p.property_id,p.arrival,p.departure,p.guests,p.nightly,p.total,p.status,p.source,credential.created_by,p.guest_name]);
  id=result.rows[0].id;action='Création réservation';
 }else{
  const service=serviceTypes.includes(p.activity);
  const result=await db.query(`INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,original_date,description,amount,comment,activity,provider,quantity,unit_amount,payment_status,request_key,created_by,staff_service,source_sheet)
   VALUES($1,'depense',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Payé',$12,$13,$14,'Hermes') RETURNING id`,[p.property_id,Number(p.date.slice(0,4)),Number(p.date.slice(5,7)),p.date,p.description,p.amount,p.comment,p.activity,p.provider,p.quantity,p.amount/p.quantity,operation.id,credential.created_by,service]);
  id=result.rows[0].id;action='Création écriture financière '+id;
 }
 const auditId=await recordActivity(db,credential.created_by,action);
 await db.query('UPDATE audit SET integration_credential_id=$1 WHERE id=$2',[credential.id,auditId]);
 const result={operation_id:operation.id,kind:operation.kind,[operation.kind==='reservation'?'reservation_id':'expense_id']:id,recorded:true};
 await db.query('UPDATE integration_operations SET result=$2,executed_at=NOW() WHERE id=$1',[operation.id,JSON.stringify(result)]);
 return {...result,already_executed:false};
}
