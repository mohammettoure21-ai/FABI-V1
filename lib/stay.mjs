import {integer,dates} from './security.mjs';
const dayMs=86400000;
export function stayAmount(stay) {
 if(stay.agreed_total!==null&&stay.agreed_total!==undefined)return Number(stay.agreed_total);
 if(stay.nightly===null||stay.nightly===undefined)return null;
 return Math.round((Date.parse(stay.departure)-Date.parse(stay.arrival))/dayMs)*Number(stay.nightly);
}
export function editStayValues(form) {
 const [arrival,departure]=dates(String(form.get('edit_arrival')??''),String(form.get('edit_departure')??''));
 const mode=String(form.get('price_mode'));
 if(!['nightly','total'].includes(mode))throw new Error('Choisissez un prix par nuit ou un prix total.');
 const price=String(form.get('price')??'').trim();
 const amount=price===''?null:integer(price);
 const commission=String(form.get('expected_commission')??'').trim();
 return {arrival,departure,nightly:mode==='nightly'?amount:null,total:mode==='total'?amount:null,commission:commission===''?null:integer(commission)};
}

// Allocate integer FCFA across nights, preserving the agreed total exactly.
export function projectedRevenue(stays,year,today,propertyId=null) {
 const months=Array.from({length:12},()=>({total:0,count:0}));
 const start=Math.max(Date.parse(year+'-01-01'),Date.parse(today)),end=Date.UTC(year+1,0,1);
 let missing=0;
 for(const stay of stays) {
  if(stay.status!=='Confirmée'||stay.calendar_event_kind==='blocked'||(propertyId!==null&&stay.property_id!==propertyId))continue;
  const arrival=Date.parse(stay.arrival),departure=Date.parse(stay.departure);
  if(departure<=start||arrival>=end)continue;
  const total=propertyId!==null?stayAmount(stay):(stay.expected_commission==null?null:Number(stay.expected_commission));
  if(total===null){missing++;continue;}
  const nights=Math.round((departure-arrival)/dayMs);if(nights<=0)continue;
  const perNight=Math.floor(total/nights),extra=total%nights,seen=new Set();
  for(let day=Math.max(arrival,start);day<Math.min(departure,end);day+=dayMs) {
   const month=new Date(day).getUTCMonth(),night=Math.round((day-arrival)/dayMs);
   months[month].total+=perNight+(night<extra?1:0);seen.add(month);
  }
  for(const month of seen)months[month].count++;
 }
 return {months,total:months.reduce((sum,m)=>sum+m.total,0),missing};
}
