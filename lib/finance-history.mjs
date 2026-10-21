// A missing historical day stays missing: month-only accounts never acquire a date.
export function financeEntryDate(value){
 const raw=String(value??'').trim();
 let iso=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:null;
 const french=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
 if(french)iso=`${french[3]}-${french[2]}-${french[1]}`;
 if(!iso||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)return null;
 return {iso,day:iso.slice(8,10),month:Number(iso.slice(5,7))};
}
export function financeHistoryGroups(entries){
 const sorted=[...entries].sort((a,b)=>b.reporting_year-a.reporting_year||b.reporting_month-a.reporting_month||(financeEntryDate(b.original_date)?.iso??'').localeCompare(financeEntryDate(a.original_date)?.iso??'')||b.id-a.id);
 const grouped=new Map();
 for(const entry of sorted){
  const key=`${entry.reporting_year}-${entry.reporting_month}`;
  if(!grouped.has(key))grouped.set(key,{key,year:entry.reporting_year,month:entry.reporting_month,entries:[]});
  grouped.get(key).entries.push(entry);
 }
 return [...grouped.values()];
}
