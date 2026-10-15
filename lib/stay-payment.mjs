import {stayAmount} from './stay.mjs';
// Called inside a transaction. A row lock plus a unique ledger link make retries safe.
export async function reviewStayPayment(db,id,received,userId,today=new Date().toISOString().slice(0,10)) {
 const stay=(await db.query('SELECT * FROM reservations WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!stay||stay.status!=='Confirmée'||stay.calendar_event_kind!=='reservation'||new Date(stay.arrival).toISOString().slice(0,10)>=today)throw new Error('NOT_DUE');
 if(stay.payment_received_at)return;
 const amount=stayAmount(stay);
 if(received&&(amount===null||amount<=0))throw new Error('MISSING_PRICE');
 if(received){
  await db.query(`INSERT INTO finance_entries(reservation_id,property_id,kind,reporting_year,reporting_month,original_date,description,amount,activity,payment_status,created_by)
   VALUES($1,$2,'recette',$3,$4,$5,$6,$7,'Appartement','Encaissé',$8) ON CONFLICT DO NOTHING`,[id,stay.property_id,Number(today.slice(0,4)),Number(today.slice(5,7)),today,'Encaissement séjour #'+id,amount,userId]);
 }
 await db.query('UPDATE reservations SET payment_reviewed_at=NOW(),payment_received_at=CASE WHEN $2 THEN NOW() ELSE NULL END WHERE id=$1',[id,received]);
 await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[userId,'Séjour '+id+(received?' : encaissement confirmé':' : paiement non reçu')]);
}
