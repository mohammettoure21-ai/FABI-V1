export function revenueMonths(rows) {
 const months=Array.from({length:12},()=>({total:0,count:0,activities:[]}));
 for(const row of rows) {
  const month=months[Number(row.month)-1];
  if(!month)continue;
  const total=Number(row.total),count=Number(row.count);
  month.total+=total;month.count+=count;
  const existing=month.activities.find(a=>a.activity===row.activity);
  if(existing){existing.total+=total;existing.count+=count;}else month.activities.push({activity:row.activity,total,count});
 }
 return months;
}

export function scopeRevenue(rows,propertyId=null) {
 const income=rows.filter(r=>propertyId!==null?r.property_id===propertyId&&r.kind==='recette':r.kind==='commission');
 const charges=rows.filter(r=>['depense','loyer'].includes(r.kind)&&(propertyId!==null?r.property_id===propertyId:r.property_id===null)).reduce((sum,r)=>sum+Number(r.total),0);
 const monthly=revenueMonths(income),annual=monthly.reduce((sum,m)=>sum+m.total,0);
 return {monthly,annual,charges,result:annual-charges};
}
