'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireUser} from '../../lib/auth';
import {transaction} from '../../lib/db.mjs';
import {integer,text} from '../../lib/security.mjs';
import {editStayValues} from '../../lib/stay.mjs';
function fail(id,message){redirect('/reservations?modifier='+id+'&erreur='+encodeURIComponent(message)+'#modifier-sejour');}
export async function updateStay(form) {
 const user=await requireUser();let id,values,savedPropertyId;
 try{id=integer(form.get('stay_id'),1);values=editStayValues(form);}catch(error){fail(id??'',error.message);}
 try{
  await transaction(async db=>{
   const {rows}=await db.query("SELECT r.*,c.active AS calendar_active FROM reservations r LEFT JOIN calendar_connections c ON c.id=r.calendar_connection_id WHERE r.id=$1 AND ($2<>'employee' OR r.assigned_to=$3) FOR UPDATE OF r",[id,user.role,user.id]);
   const stay=rows[0];if(!stay)throw new Error('NOT_FOUND');
   const propertyId=stay.calendar_connection_id?stay.property_id:(form.get('edit_property_id')?integer(form.get('edit_property_id'),1):null);
   savedPropertyId=propertyId;
   if(propertyId&&!(await db.query('SELECT id FROM properties WHERE id=$1 FOR SHARE',[propertyId])).rows.length)throw new Error('INVALID_PROPERTY');
   const changedDates=values.arrival!==stay.arrival||values.departure!==stay.departure;
   const status=stay.calendar_active?(stay.calendar_conflict&&changedDates?'Confirmée':stay.status):text(form.get('edit_status'),30);
   if(!['Confirmée','En attente','Annulée'].includes(status))throw new Error('INVALID');
   const override=Boolean(stay.calendar_connection_id)&&(values.arrival!==stay.calendar_arrival||values.departure!==stay.calendar_departure);
   const convert=stay.calendar_event_kind==='blocked'&&form.get('confirm_reservation')==='1';
   if(stay.calendar_event_kind==='blocked'&&!convert&&(values.nightly!==null||values.total!==null))throw new Error('CONFIRM_RESERVATION');
   if(stay.calendar_event_kind==='blocked'&&!convert){values.nightly=null;values.total=null;values.commission=null;}
   const commission=user.role==='employee'?stay.expected_commission:values.commission;
   await db.query(`UPDATE reservations SET arrival=$2,departure=$3,nightly=$4,agreed_total=$5,expected_commission=$6,property_id=$7,status=$8,
    local_reservation_override=local_reservation_override OR $10,calendar_event_kind=CASE WHEN $10 THEN 'reservation' ELSE calendar_event_kind END,local_dates_override=$9,calendar_conflict=CASE WHEN $9 THEN FALSE ELSE calendar_conflict END WHERE id=$1`,[id,values.arrival,values.departure,values.nightly,values.total,commission,propertyId,status,override,convert]);
   await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[user.id,'Modification séjour '+id+' : dates et prix']);
  });
 }catch(error){fail(id,error.message==='CONFIRM_RESERVATION'?'Cochez « Ce blocage correspond à un séjour » pour ajouter son prix.':error.code==='23P01'?'Ces dates chevauchent un séjour confirmé. Aucune modification conservée.':'Modification impossible. Vérifiez le séjour et l’appartement.');}
 revalidatePath('/');revalidatePath('/reservations');
 redirect('/reservations?cal_annee='+values.arrival.slice(0,4)+'&cal_mois='+Number(values.arrival.slice(5,7))+(savedPropertyId?'&cal_bien='+savedPropertyId:'')+'&succes=Séjour+modifié.+Le+prévisionnel+est+mis+à+jour.');
}
export async function restoreCalendarDates(form) {
 const user=await requireUser();let id;try{id=integer(form.get('stay_id'),1);}catch{fail('','Séjour invalide.');}
 try{
  await transaction(async db=>{
   const result=await db.query("UPDATE reservations SET arrival=calendar_arrival,departure=calendar_departure,local_dates_override=FALSE WHERE id=$1 AND calendar_arrival IS NOT NULL AND calendar_departure IS NOT NULL AND ($2<>'employee' OR assigned_to=$3) RETURNING id",[id,user.role,user.id]);
   if(!result.rows.length)throw new Error('NOT_FOUND');
   await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[user.id,'Reprise des dates du calendrier pour le séjour '+id]);
  });
 }catch{fail(id,'Les dates du calendrier ne peuvent pas être reprises : vérifiez les chevauchements.');}
 revalidatePath('/');revalidatePath('/reservations');
 redirect('/reservations?succes=Dates+du+calendrier+reprises.+Prix+conservé.');
}
