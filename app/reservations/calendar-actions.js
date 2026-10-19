'use server';
import {createHash} from 'node:crypto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '../../lib/auth';
import {query,transaction} from '../../lib/db.mjs';
import {integer,text} from '../../lib/security.mjs';
import {validateCalendarUrl} from '../../lib/ical.mjs';
import {syncCalendar} from '../../lib/calendar-sync.mjs';
const path='/reservations';
function fail(message){redirect(path+'?erreur='+encodeURIComponent(message)+'#calendriers');}

export async function connectCalendar(form) {
 const user=await requireAdmin();let propertyId,provider,url;
 try{propertyId=integer(form.get('calendar_property_id'),1);provider=text(form.get('provider'),20);url=validateCalendarUrl(text(form.get('calendar_url'),4001),provider);}
 catch(error){fail(error.message);}
 let id;
 try{
  await transaction(async db=>{
   if(!(await db.query('SELECT id FROM properties WHERE id=$1 FOR SHARE',[propertyId])).rows.length)throw new Error('INVALID');
   const result=await db.query(`INSERT INTO calendar_connections(property_id,provider,calendar_url,url_hash,assigned_to) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(property_id,provider) DO UPDATE SET calendar_url=EXCLUDED.calendar_url,url_hash=EXCLUDED.url_hash,active=TRUE,last_error='',assigned_to=EXCLUDED.assigned_to RETURNING id`,[propertyId,provider,url,createHash('sha256').update(url).digest('hex'),user.id]);
   id=result.rows[0].id;
   await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[user.id,'Connexion calendrier '+id]);
  });
 }catch(error){fail(error.code==='23505'?'Ce calendrier est déjà connecté à un autre appartement.':'Connexion non enregistrée. Vérifiez l’appartement.');}
 const result=await syncCalendar(id);
 if(!result.ok)fail('Lien enregistré. '+result.message);
 revalidatePath('/');revalidatePath('/reservations');
 redirect(path+'?succes='+encodeURIComponent('Calendrier connecté : '+result.imported+' événements importés'+(result.conflicts?', '+result.conflicts+' chevauchements à vérifier.':'.'))+'#calendriers');
}

export async function synchronizeCalendar(form) {
 await requireAdmin();let id;try{id=integer(form.get('connection_id'),1);}catch{fail('Connexion invalide.');}
 const result=await syncCalendar(id);
 if(!result.ok)fail(result.message);
 revalidatePath('/');revalidatePath('/reservations');
 redirect(path+'?succes='+encodeURIComponent('Synchronisation terminée : '+result.imported+' événements'+(result.conflicts?', '+result.conflicts+' chevauchements à vérifier.':'.'))+'#calendriers');
}

export async function disconnectCalendar(form) {
 const user=await requireAdmin();let id;try{id=integer(form.get('connection_id'),1);}catch{fail('Connexion invalide.');}
 await transaction(async db=>{
  await db.query('UPDATE calendar_connections SET active=FALSE WHERE id=$1',[id]);
  await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[user.id,'Déconnexion calendrier '+id+' ; réservations conservées']);
 });
 redirect(path+'?succes=Calendrier+déconnecté.+Les+réservations+existantes+sont+conservées.#calendriers');
}
