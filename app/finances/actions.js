'use server';
import {redirect} from 'next/navigation';
import {requireManager} from '../../lib/auth';
import {transaction} from '../../lib/db.mjs';
import {integer,text} from '../../lib/security.mjs';
import {activities} from '../../lib/finance.mjs';

export async function saveFinanceEntry(form) {
 const user=await requireManager();
 let entry;
 try {
  const kind=text(form.get('kind'),20);
  if(!['recette','depense','commission','loyer'].includes(kind))throw new Error();
  const cleaning=form.get('cleaning')==='1';
  if(cleaning&&kind!=='depense')throw new Error();
  const activity=cleaning?'Ménage':text(form.get('activity'),30);
  if(!activities.includes(activity))throw new Error();
  const date=text(form.get('date'),10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error();
  const year=integer(date.slice(0,4),2000,2200),month=integer(date.slice(5,7),1,12);
  const propertyId=form.get('property_id')?integer(form.get('property_id'),1):null;
  const quantity=cleaning?integer(form.get('quantity'),1,100):1;
  const unit=cleaning?5000:integer(form.get('amount'),1);
  const amount=unit*quantity;
  const description=cleaning?'Passage ménage':text(form.get('description'),200);
  if(!description)throw new Error();
  const requestKey=text(form.get('request_key'),36);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey))throw new Error();
  entry={kind,activity,date,year,month,propertyId,quantity,unit,amount,description,requestKey,
   provider:text(form.get('provider'),120),detail:text(form.get('detail'),200),comment:text(form.get('comment'),1000),
   paymentStatus:['depense','loyer'].includes(kind)?(form.get('paid')==='1'?'Payé':'À payer'):'Encaissé'};
 }catch{redirect('/finances?erreur=Vérifiez+la+date,+le+montant+et+les+champs+obligatoires');}
 try {
  await transaction(async db=>{
   if(entry.propertyId&&!(await db.query('SELECT id FROM properties WHERE id=$1 FOR SHARE',[entry.propertyId])).rows.length)throw new Error('INVALID');
   const result=await db.query(`INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,original_date,description,detail,amount,comment,activity,provider,quantity,unit_amount,payment_status,request_key,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(request_key) DO NOTHING RETURNING id`,
    [entry.propertyId,entry.kind,entry.year,entry.month,entry.date,entry.description,entry.detail,entry.amount,entry.comment,entry.activity,entry.provider,entry.quantity,entry.unit,entry.paymentStatus,entry.requestKey,user.id]);
   if(result.rows.length)await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[user.id,'Création écriture financière '+result.rows[0].id]);
  });
 }catch{redirect('/finances?erreur=Écriture+non+enregistrée');}
 redirect('/finances?annee='+entry.year+'&succes=Écriture+enregistrée');
}

export async function markExpensePaid(form) {
 const user=await requireManager();
 let id;
 try{id=integer(form.get('entry_id'),1);}catch{redirect('/finances?erreur=Écriture+invalide');}
 await transaction(async db=>{
  const result=await db.query("UPDATE finance_entries SET payment_status='Payé' WHERE id=$1 AND kind IN ('depense','loyer') AND payment_status<>'Payé' RETURNING id",[id]);
  if(result.rows.length)await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[user.id,'Paiement écriture financière '+id]);
 });
 redirect('/finances?succes=Paiement+noté,+sans+nouvelle+dépense');
}

export async function saveMonthlyRent(form) {
 const user=await requireManager();
 let propertyId,amount;
 try{propertyId=integer(form.get('property_id'),1);amount=integer(form.get('amount'));}
 catch{redirect('/finances?erreur=Montant+ou+appartement+invalide');}
 try{
  await transaction(async db=>{
   const property=await db.query('SELECT id FROM properties WHERE id=$1 FOR SHARE',[propertyId]);
   if(!property.rows.length)throw new Error('INVALID');
   await db.query('INSERT INTO property_monthly_rents(property_id,amount) VALUES($1,$2) ON CONFLICT(property_id) DO UPDATE SET amount=EXCLUDED.amount,updated_at=NOW()',[propertyId,amount]);
   await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[user.id,'Mise à jour loyer mensuel appartement '+propertyId]);
  });
 }catch{redirect('/finances?erreur=Enregistrement+impossible');}
 redirect('/finances?succes=Loyer+mensuel+enregistré');
}
