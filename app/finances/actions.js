'use server';
import {redirect} from 'next/navigation';
import {requireManager} from '../../lib/auth';
import {transaction} from '../../lib/db.mjs';
import {integer} from '../../lib/security.mjs';

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
