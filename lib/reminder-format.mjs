export function dakarDate(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dakar',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function parseReminderAction(action){
 const match=/^Rappel arrivée J-2 · séjour (\d+) · arrivée (\d{4}-\d{2}-\d{2})$/.exec(action);
 return match?{id:Number(match[1]),arrival:match[2]}:null;
}
