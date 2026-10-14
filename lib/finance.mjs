export const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export const kinds = {recette:'Recette',depense:'Dépense',commission:'Commission',loyer:'Loyer'};
export function summarize(entries) {
 const totals = {recette:0,depense:0,commission:0,loyer:0};
 for (const entry of entries) totals[entry.kind] += Number(entry.amount);
 return {...totals, balance:totals.recette-totals.depense};
}
