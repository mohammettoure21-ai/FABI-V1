export function validateCalendarUrl(value,provider) {
 let url;try{url=new URL(value);}catch{throw new Error('Lien calendrier invalide.');}
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.hash)throw new Error('Utilisez un lien calendrier HTTPS officiel.');
 const host=url.hostname.toLowerCase();
 const airbnb=['airbnb.com','www.airbnb.com','airbnb.fr','www.airbnb.fr','airbnb.co.uk','www.airbnb.co.uk','airbnb.es','www.airbnb.es','airbnb.it','www.airbnb.it','airbnb.de','www.airbnb.de','airbnb.ca','www.airbnb.ca'];
 const valid=provider==='Airbnb'?airbnb.includes(host)&&/^\/calendar\/ical\/.+/.test(url.pathname)
  :provider==='Booking'&&(['admin.booking.com','www.booking.com'].includes(host)&&/ical/i.test(url.pathname)||host==='ical.booking.com'&&/^\/v\d+\/export(?:\/|$)/.test(url.pathname));
 if(!valid)throw new Error('Collez le lien d’export iCal Airbnb ou Booking, pas l’adresse de l’annonce.');
 if(url.href.length>4000)throw new Error('Lien calendrier trop long.');
 return url.href;
}
function date(value) {
 if(!/^\d{8}$/.test(value))throw new Error('Ce calendrier doit fournir des dates de séjour à la journée.');
 const result=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8);
 if(!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)throw new Error('Date calendrier invalide.');
 return result;
}
const unescape=value=>value.replace(/\\[nN]/g,' ').replace(/\\([,;\\])/g,'$1').trim();
export function parseICalendar(body) {
 if(Buffer.byteLength(body,'utf8')>1024*1024)throw new Error('Calendrier trop volumineux.');
 const text=body.replace(/^\uFEFF/,'').replace(/\r?\n[ \t]/g,'');
 const lines=text.split(/\r?\n/).map(l=>l.trimEnd());
 if(lines[0]!=='BEGIN:VCALENDAR'||!lines.includes('END:VCALENDAR'))throw new Error('Réponse non reconnue comme calendrier iCal complet.');
 const events=[],uids=new Set();let current=null;
 for(const line of lines) {
  if(line==='BEGIN:VEVENT'){if(current)throw new Error('Calendrier incomplet.');current={};continue;}
  if(line==='END:VEVENT'){
   if(!current?.UID)throw new Error('Événement sans identifiant.');
   const uid=unescape(current.UID);if(!uid||uid.length>1000||uids.has(uid))throw new Error('Identifiant calendrier dupliqué ou invalide.');
   uids.add(uid);
   const cancelled=current.STATUS?.toUpperCase()==='CANCELLED';
   const arrival=current.DTSTART?date(current.DTSTART):null,departure=current.DTEND?date(current.DTEND):null;
   if(!cancelled&&(!arrival||!departure||departure<=arrival))throw new Error('Dates de séjour incomplètes ou invalides.');
   const title=unescape(current.SUMMARY??'').slice(0,120);
   events.push({uid,arrival,departure,title,cancelled,kind:/not available|unavailable|blocked|indisponible|fermé|closed/i.test(title)?'blocked':'reservation'});
   if(events.length>1000)throw new Error('Trop d’événements dans ce calendrier.');
   current=null;continue;
  }
  if(current){const index=line.indexOf(':');if(index<1)continue;const key=line.slice(0,index).split(';')[0].toUpperCase();
   if(['RRULE','RDATE','EXDATE','RECURRENCE-ID'].includes(key))throw new Error('Les événements récurrents ne sont pas pris en charge pour ce calendrier.');
   if(['UID','DTSTART','DTEND','SUMMARY','STATUS'].includes(key)){if(current[key]!==undefined)throw new Error('Événement ambigu.');current[key]=line.slice(index+1);}
  }
 }
 if(current)throw new Error('Calendrier incomplet.');
 return events;
}

export async function downloadCalendar(value,provider) {
 let url=validateCalendarUrl(value,provider);
 const signal=AbortSignal.timeout(20000);
 for(let redirects=0;redirects<4;redirects++) {
  let response;
  try{response=await fetch(url,{redirect:'manual',cache:'no-store',signal,headers:{Accept:'text/calendar','User-Agent':'FABI-Calendar-Sync/1.0'}});}catch{throw new Error('Calendrier inaccessible ou trop lent. Réessayez plus tard.');}
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)throw new Error('Redirection calendrier invalide.');
   url=validateCalendarUrl(new URL(location,url).href,provider);continue;
  }
  if(!response.ok){await response.body?.cancel();throw new Error('Le lien calendrier ne répond pas. Vérifiez son export sur la plateforme.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Calendrier vide ou illisible.');
  let size=0;const chunks=[];
  while(true){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.length;if(size>1024*1024){await reader.cancel();throw new Error('Calendrier trop volumineux.');}chunks.push(chunk);}
  return parseICalendar(Buffer.concat(chunks).toString('utf8'));
 }
 throw new Error('Trop de redirections du calendrier.');
}
