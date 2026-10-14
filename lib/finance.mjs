export const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export const kinds = {recette:'Recette',depense:'Dépense',commission:'Commission',loyer:'Loyer'};
export const activities=['Appartement','Chauffeur','Ménage','Wifi','Transport','Employé','Autre'];
export function summarize(entries) {
 const totals = {recette:0,depense:0,commission:0,loyer:0};
 for (const entry of entries) totals[entry.kind] += Number(entry.amount);
 return {...totals, balance:totals.recette-totals.depense};
}
export function cleaningSummary(entries) {
 const grouped=new Map();
 for(const e of entries.filter(e=>e.kind==='depense'&&e.activity==='Ménage')) {
  const key=JSON.stringify([e.property_id??null,e.property_id?null:e.detail,e.provider,e.reporting_year,e.reporting_month]);
  if(!grouped.has(key))grouped.set(key,{property:e.property_name||e.detail||'Sans appartement',provider:e.provider||'Ménagère non précisée',year:e.reporting_year,month:e.reporting_month,visits:0,total:0,due:0});
  const row=grouped.get(key);row.visits+=Number(e.quantity);row.total+=Number(e.amount);
  if(e.payment_status!=='Payé')row.due+=Number(e.amount);
 }
 return [...grouped.values()];
}
