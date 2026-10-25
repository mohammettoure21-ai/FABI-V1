import {dates,integer} from '../security.mjs';
import {deny,requireProperty,propertyAllowed} from './auth.mjs';
function id(value){try{return integer(value,1,2147483647);}catch{deny(400,'INVALID_ID');}}
function period(from,to){try{dates(from,to);if((Date.parse(to)-Date.parse(from))/86400000>370)deny(400,'PERIOD_TOO_LONG');return [from,to];}catch(e){if(e.status)throw e;deny(400,'INVALID_DATES');}}
export async function properties(db,credential){
 const {rows}=await db.query("SELECT id,reference,name,neighborhood,category,bedrooms,status FROM properties ORDER BY id");
 return {properties:rows.filter(p=>propertyAllowed(credential,p.id)).map(p=>({...p,offer_type:'managed'}))};
}
export async function reservations(db,credential,query){
 const [from,to]=period(query.from,query.to);
 const {rows}=await db.query(`SELECT id,property_id,arrival::text,departure::text,guests,status,source,calendar_event_kind FROM reservations
 WHERE departure>$1::date AND arrival<$2::date ORDER BY arrival,id LIMIT 1001`,[from,to]);
 const visible=rows.filter(r=>r.property_id!==null&&propertyAllowed(credential,r.property_id));
 return {reservations:visible.slice(0,1000),truncated:rows.length>1000};
}
export async function availability(db,credential,query){
 const propertyId=id(query.property_id);requireProperty(credential,propertyId);
 const [from,to]=period(query.arrival,query.departure);
 const property=(await db.query("SELECT id,status FROM properties WHERE id=$1",[propertyId])).rows[0];
 if(!property)deny(404,'PROPERTY_NOT_FOUND');
 const conflicts=await db.query("SELECT id FROM reservations WHERE property_id=$1 AND status='Confirmée' AND arrival<$3::date AND departure>$2::date",[propertyId,from,to]);
 return {property_id:propertyId,arrival:from,departure:to,available:property.status==='Disponible'&&!conflicts.rows.length,checked_at:new Date().toISOString(),partner_confirmation_required:false};
}
export async function report(db,credential,query){
 const year=id(query.year),month=query.month?integer(query.month,1,12):null;if(year<2000||year>2200)deny(400,'INVALID_YEAR');
 const {rows}=await db.query('SELECT property_id,kind,payment_status,amount FROM finance_entries WHERE reporting_year=$1 AND ($2::int IS NULL OR reporting_month=$2)',[year,month]);
 const data=rows.filter(r=>r.property_id!==null?propertyAllowed(credential,r.property_id):credential.property_ids===null);
 const sum=(kind,test=()=>true)=>data.filter(r=>r.kind===kind&&test(r)).reduce((s,r)=>s+Number(r.amount),0);
 return {year,month,currency:'XOF',property_revenue:sum('recette',r=>r.property_id!==null),property_expenses:data.filter(r=>r.property_id!==null&&['depense','loyer'].includes(r.kind)).reduce((s,r)=>s+Number(r.amount),0),property_operating_balance:data.filter(r=>r.property_id!==null).reduce((s,r)=>s+(r.kind==='recette'?Number(r.amount):['depense','loyer'].includes(r.kind)?-Number(r.amount):0),0),fabi_commissions:sum('commission'),recorded_collections:sum('recette',r=>r.payment_status==='Encaissé'),fabi_general_expenses:data.filter(r=>r.property_id===null&&['depense','loyer'].includes(r.kind)).reduce((s,r)=>s+Number(r.amount),0),invoices_issued:null,owner_payables:null,notice:'Données enregistrées uniquement : aucune génération de charge, aucun prévisionnel ajouté aux encaissements. Les champs non disponibles restent null.'};
}
