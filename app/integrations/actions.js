'use server';
import {approveDashboard} from '../../lib/integration/dashboard.mjs';
import {requireHumanAdmin} from '../../lib/auth';
import {transaction} from '../../lib/db.mjs';
import {registerCredential,revokeCredential,updateCredential} from '../../lib/integration/auth.mjs';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
function back(message,error=false){redirect('/integrations?'+new URLSearchParams({[error?'erreur':'succes']:message}));}
function credentialExpiry(form){
 if(form.get('permanent')==='1')return null;
 const date=String(form.get('expires')??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error();
 return date+'T23:59:59Z';
}
export async function registerHermes(form){
 const user=await requireHumanAdmin();
 try{
  const properties=form.get('all_properties')==='1'?null:[...new Set(form.getAll('property_ids').map(Number))];
  const permissions=form.getAll('scopes').map(String),expiresAt=credentialExpiry(form);
  await transaction(db=>registerCredential(db,{name:String(form.get('name')??'').trim(),createdBy:user.id,permissions,properties,expiresAt,tokenHash:String(form.get('fingerprint')??'').trim()}));
 }catch{back('Accès non créé. Vérifiez l’empreinte, les permissions, les appartements et la date d’expiration (maximum un an).',true);}
 revalidatePath('/integrations');back('Accès Hermes enregistré. La clé privée reste sur sa machine.');
}
export async function revokeHermes(form){
 const user=await requireHumanAdmin(),id=Number(form.get('credential_id'));if(!Number.isSafeInteger(id)||id<1)back('Accès invalide.',true);
 await transaction(db=>revokeCredential(db,id,user.id));revalidatePath('/integrations');back('Accès révoqué immédiatement, y compris ses sessions dashboard.');
}

export async function updateHermes(form){
 const user=await requireHumanAdmin();
 try{
  const expiresAt=credentialExpiry(form);
  await transaction(db=>updateCredential(db,{
   id:Number(form.get('edit_credential_id')),actor:user.id,
   permissions:form.getAll('scopes').map(String),
   properties:form.get('all_properties')==='1'?null:[...new Set(form.getAll('property_ids').map(Number))],
   expiresAt
  }));
 }catch{back('Autorisations non modifiées. Vérifiez les permissions, les appartements et l’expiration. Seul le créateur peut modifier un accès non révoqué.',true);}
 revalidatePath('/integrations');back('Autorisations mises à jour. Hermes conserve sa clé. Ses anciennes sessions sont fermées ; il peut se reconnecter selon les permissions choisies.');
}

export async function approveHermesTask(form){
 const user=await requireHumanAdmin();
 try{await transaction(db=>approveDashboard(db,String(form.get('request_id')??''),user.id));}
 catch{back('Demande expirée ou non autorisée.',true);}
 revalidatePath('/integrations');back('Tâche autorisée : Hermes peut ouvrir une session de 10 minutes.');
}
