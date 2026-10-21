'use server';
import {recordActivity,scheduleActivityEmails} from '../../lib/activity';
import {revalidatePath} from 'next/cache';
import {reviewStayPayment} from '../../lib/stay-payment.mjs';
import {redirect} from 'next/navigation';
import {requireAdmin} from '../../lib/auth';
import {transaction} from '../../lib/db.mjs';
import {integer,text} from '../../lib/security.mjs';
import {activities,serviceTypes} from '../../lib/finance.mjs';
import {financeReturnUrl} from '../../lib/finance-navigation.mjs';
function refreshFinanceViews(){for(const path of ['/','/finances','/depenses','/passages','/menage','/proprietaire'])revalidatePath(path);}

export async function saveFinanceEntry(form) {
 const user=await requireAdmin();
 let entry;
 try {
  const kind=text(form.get('kind'),20);
  if(!['recette','depense','commission','loyer'].includes(kind))throw new Error();
  const legacyCleaning=form.get('cleaning')==='1';
  const service=legacyCleaning||form.get('staff_service')==='1';
  if(service&&kind!=='depense')throw new Error();
  const activity=legacyCleaning?'Ménage':text(form.get('activity'),30);
  if(service&&!serviceTypes.includes(activity))throw new Error();
  if(!activities.includes(activity))throw new Error();
  const date=text(form.get('date'),10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error();
  const year=integer(date.slice(0,4),2000,2200),month=integer(date.slice(5,7),1,12);
  const propertyId=form.get('property_id')?integer(form.get('property_id'),1):null;
  const quantity=service?integer(form.get('quantity'),1,100):1;
  const unit=legacyCleaning?5000:service?integer(form.get('unit_amount'),1):integer(form.get('amount'),1);
  const amount=unit*quantity;
  const description=service&&activity!=='Autre service'?(activity==='Ménage'?'Passage ménage':'Passage de vérification'):text(form.get('description'),200);
  const provider=text(form.get('provider'),120);
  if(service&&!legacyCleaning&&!provider)throw new Error();
  if(!description)throw new Error();
  const requestKey=text(form.get('request_key'),36);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey))throw new Error();
  entry={kind,activity,date,year,month,propertyId,quantity,unit,amount,description,requestKey,service,
   provider,detail:text(form.get('detail'),200),comment:text(form.get('comment'),1000),
   paymentStatus:['depense','loyer'].includes(kind)?'Payé':'Encaissé'};
 }catch{redirect(financeReturnUrl(form,{message:'Vérifiez la date, le montant et les champs obligatoires',error:true}));}
 try {
  await transaction(async db=>{
   if(entry.propertyId&&!(await db.query('SELECT id FROM properties WHERE id=$1 FOR SHARE',[entry.propertyId])).rows.length)throw new Error('INVALID');
   const result=await db.query(`INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,original_date,description,detail,amount,comment,activity,provider,quantity,unit_amount,payment_status,request_key,created_by,staff_service)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT(request_key) DO NOTHING RETURNING id`,
    [entry.propertyId,entry.kind,entry.year,entry.month,entry.date,entry.description,entry.detail,entry.amount,entry.comment,entry.activity,entry.provider,entry.quantity,entry.unit,entry.paymentStatus,entry.requestKey,user.id,entry.service]);
   if(result.rows.length)await recordActivity(db,user.id,'Création écriture financière '+result.rows[0].id);
  });
 }catch{redirect(financeReturnUrl(form,{message:'Écriture non enregistrée',error:true}));}
 refreshFinanceViews();
 redirect(financeReturnUrl(form,{fallback:entry.service?'/passages':['depense','loyer'].includes(entry.kind)?'/depenses':'/finances',year:entry.year,message:'Écriture enregistrée'}));
}

export async function saveMonthlyRent(form) {
 const user=await requireAdmin();
 let propertyId,amount;
 try{propertyId=integer(form.get('property_id'),1);amount=integer(form.get('amount'));}
 catch{redirect('/finances?erreur=Montant+ou+appartement+invalide');}
 try{
  await transaction(async db=>{
   const property=await db.query('SELECT id FROM properties WHERE id=$1 FOR SHARE',[propertyId]);
   if(!property.rows.length)throw new Error('INVALID');
   const changed=await db.query('INSERT INTO property_monthly_rents(property_id,amount) VALUES($1,$2) ON CONFLICT(property_id) DO UPDATE SET amount=EXCLUDED.amount,updated_at=NOW() WHERE property_monthly_rents.amount IS DISTINCT FROM EXCLUDED.amount RETURNING property_id',[propertyId,amount]);
   if(changed.rows.length)await recordActivity(db,user.id,'Mise à jour loyer mensuel appartement '+propertyId);
  });
 }catch{redirect('/finances?erreur=Enregistrement+impossible');}
 refreshFinanceViews();
 redirect('/finances?succes=Loyer+mensuel+enregistré');
}

export async function confirmStayPayment(form) {
 const user=await requireAdmin();
 let id,received;
 try{id=integer(form.get('payment_stay_id'),1);if(!['yes','no'].includes(form.get('received')))throw new Error();received=form.get('received')==='yes';}
 catch{redirect('/finances?erreur=Séjour+ou+réponse+invalide');}
 try{await transaction(db=>reviewStayPayment(db,id,received,user.id));scheduleActivityEmails();}
 catch(error){redirect('/finances?erreur='+encodeURIComponent(error.message==='MISSING_PRICE'?'Ajoutez d’abord le prix du séjour.':'Ce séjour ne peut pas être encaissé.'));}
 refreshFinanceViews();revalidatePath('/reservations');
 redirect('/finances?succes='+encodeURIComponent(received?'Encaissement enregistré une seule fois.':'Paiement noté non reçu. Vous pourrez le confirmer plus tard.'));
}
