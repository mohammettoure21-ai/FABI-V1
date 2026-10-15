const dayMs=86400000;
export const isoDay=value=>new Date(value).toISOString().slice(0,10);
export function calendarWeeks(year,month,stays) {
 const first=Date.UTC(year,month,1),offset=(new Date(first).getUTCDay()+6)%7;
 const last=Date.UTC(year,month+1,0),weeks=Math.ceil((offset+new Date(last).getUTCDate())/7);
 return Array.from({length:weeks},(_,week)=>{
  const start=first-offset*dayMs+week*7*dayMs,end=start+7*dayMs;
  const segments=stays.filter(s=>s.status!=='Annulée'&&Date.parse(s.arrival)<end&&Date.parse(s.departure)>start)
   .map(s=>({...s,start:Math.max(0,(Date.parse(s.arrival)-start)/dayMs),end:Math.min(7,(Date.parse(s.departure)-start)/dayMs),continuesLeft:Date.parse(s.arrival)<start,continuesRight:Date.parse(s.departure)>end}))
   .sort((a,b)=>a.start-b.start||b.end-a.end);
  const lanes=[];
  for(const segment of segments){let lane=lanes.findIndex(end=>end<=segment.start);if(lane<0)lane=lanes.length;lanes[lane]=segment.end;segment.lane=lane;}
  return {days:Array.from({length:7},(_,i)=>({date:isoDay(start+i*dayMs),day:new Date(start+i*dayMs).getUTCDate(),inMonth:new Date(start+i*dayMs).getUTCMonth()===month})),segments,lanes:lanes.length};
 });
}
