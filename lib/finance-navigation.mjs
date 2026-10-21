const routes=new Set(['/finances','/depenses','/passages','/menage']);
// Hidden return fields are untrusted: never accept an external URL.
export function financeReturnUrl(form,{fallback='/finances',year,message,error=false}={}){
 const candidate=String(form.get('return_to')??'');
 const chosen=routes.has(candidate)?candidate:routes.has(fallback)?fallback:'/finances';
 const path=['/menage','/passages'].includes(chosen)?'/depenses':chosen;
 const params=new URLSearchParams();
 const reportingYear=String(year??form.get('return_year')??'');
 if(/^(20\d{2}|21\d{2}|2200)$/.test(reportingYear))params.set('annee',reportingYear);
 const month=String(form.get('return_month')??'');
 if(/^(?:[1-9]|1[0-2])$/.test(month))params.set('mois',month);
 const scope=String(form.get('return_scope')??'');
 if(scope==='fabi'||/^[1-9]\d{0,9}$/.test(scope))params.set('bien',scope);
 const provider=String(form.get('return_provider')??'').trim().slice(0,120);
 if(path==='/depenses'&&provider)params.set('intervenant',provider);
 if(path==='/finances'&&form.get('return_tab')==='commissions')params.set('onglet','commissions');
 const activity=String(form.get('return_activity')??'').slice(0,30);
 if(path==='/depenses'&&activity)params.set('activite',activity);
 if(message)params.set(error?'erreur':'succes',message);
 return path+(params.size?'?'+params.toString():'');
}
export function financeLegacyUrl(params,path){
 const query=new URLSearchParams();
 for(const key of ['annee','mois','bien','intervenant','activite','succes','erreur'])if(typeof params[key]==='string')query.set(key,params[key]);
 return path+(query.size?'?'+query.toString():'');
}
