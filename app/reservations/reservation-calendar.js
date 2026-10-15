'use client';
import {useState} from 'react';
import Link from 'next/link';
import {calendarWeeks} from '../../lib/reservation-calendar.mjs';
const names=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const money=value=>new Intl.NumberFormat('fr-SN',{notation:'compact',maximumFractionDigits:0}).format(value);
const sourceClass=source=>source==='Airbnb'?'airbnb':source==='Booking'?'booking':'crm';
export default function ReservationCalendar({properties,stays,year,month,initialPropertyId,showPrices,today,initialView='month'}) {
 const [propertyId,setPropertyId]=useState(initialPropertyId??properties[0]?.id);
 const [view,setView]=useState(initialView);
 const property=properties.find(p=>p.id===propertyId),selected=stays.filter(s=>s.property_id===propertyId);
 const shift=(delta)=>{const date=new Date(Date.UTC(year,month-1+delta,1));return '/reservations?cal_annee='+date.getUTCFullYear()+'&cal_mois='+(date.getUTCMonth()+1)+'&cal_bien='+propertyId+'&cal_vue='+view;};
 function priceForDay(day) {
  const stay=selected.find(s=>s.status==='Confirmée'&&s.arrival<=day&&s.departure>day);
  if(!stay)return property?.nightly==null?null:money(property.nightly);
  if(stay.calendar_event_kind==='blocked')return '—';
  const nights=(Date.parse(stay.departure)-Date.parse(stay.arrival))/86400000;
  const rate=stay.agreed_total!=null?Number(stay.agreed_total)/nights:stay.nightly;
  return rate==null?'Prix ?':money(rate);
 }
 function renderMonth(renderYear,renderMonth) {
  const weeks=calendarWeeks(renderYear,renderMonth,selected);
  return <section className="stay-month" key={renderYear+'-'+renderMonth} aria-label={names[renderMonth]+' '+renderYear}><h3>{names[renderMonth]} <span>{renderYear}</span></h3><div className="stay-weekdays">{['L','M','M','J','V','S','D'].map((name,i)=><span key={i}>{name}</span>)}</div>{weeks.map((week,index)=><div className="stay-week" key={index} style={{minHeight:Math.max(88,50+week.lanes*27)+'px'}}>{week.days.map(day=><div className={'stay-day'+(!day.inMonth?' outside-month':'')+(day.date===today?' is-today':'')} key={day.date}><span>{day.day}</span>{day.inMonth&&showPrices&&<small>{priceForDay(day.date)}</small>}</div>)}<div className="stay-bars">{week.segments.map(stay=><Link key={stay.id} className={'stay-bar '+sourceClass(stay.source)+(stay.status==='En attente'?' tentative':'')+(stay.calendar_event_kind==='blocked'?' blocked':'')+(stay.continuesLeft?' continues-left':'')+(stay.continuesRight?' continues-right':'')} href={'/reservations?modifier='+stay.id+'&cal_annee='+year+'&cal_mois='+month+'&cal_bien='+propertyId+'#modifier-sejour'} style={{left:`calc(${stay.start/7*100}% + 2px)`,width:`calc(${(stay.end-stay.start)/7*100}% - 4px)`,top:stay.lane*27+'px'}} title={(stay.calendar_event_kind==='blocked'?'Blocage plateforme (indicatif)':stay.label)+' · '+stay.source+' · '+stay.arrival+' → '+stay.departure} aria-label={'Modifier '+(stay.calendar_event_kind==='blocked'?'indisponibilité':stay.label)+' '+stay.source+' '+stay.arrival+' au '+stay.departure}><span>{stay.calendar_event_kind==='blocked'?'Blocage plateforme (indicatif)':stay.label}</span><i/></Link>)}</div></div>)}</section>;
 }
 const next=new Date(Date.UTC(year,month,1));
 return <section className="reservation-calendar-panel"><div className="stay-calendar-heading"><div><small>DISPONIBILITÉS & SÉJOURS</small><h2>Calendrier des réservations</h2></div><div className="stay-calendar-nav"><Link href={shift(view==='year'?-12:-1)} aria-label="Période précédente">‹</Link><b>{view==='year'?year:names[month-1]+' '+year}</b><Link href={shift(view==='year'?12:1)} aria-label="Période suivante">›</Link><select aria-label="Vue du calendrier" value={view} onChange={e=>setView(e.target.value)}><option value="month">Mois</option><option value="year">Année</option></select></div></div>
 <div className="stay-property-tabs" role="group" aria-label="Appartement du calendrier">{properties.map(p=><button key={p.id} type="button" aria-pressed={p.id===propertyId} onClick={()=>setPropertyId(p.id)}>{p.name}</button>)}</div>
 <div className="stay-calendar-legend"><span><i className="airbnb"/> Airbnb</span><span><i className="booking"/> Booking</span><span><i className="crm"/> Saisie CRM</span><small>Cliquez sur un séjour pour modifier les dates ou le prix.</small></div>
 {!property?<p>Ajoutez un appartement pour afficher son calendrier.</p>:<div className={'stay-month-grid '+(view==='year'?'year-view':'')}>{view==='year'?Array.from({length:12},(_,i)=>renderMonth(year,i)):<>{renderMonth(year,month-1)}{renderMonth(next.getUTCFullYear(),next.getUTCMonth())}</>}</div>}
 <p className="muted">Les jours libres affichent le tarif de base ; les séjours affichent leur prix convenu par nuit, ou « Prix ? » s’il manque. Les barres couvrent les nuits réservées ; le départ libère la date pour une nouvelle arrivée. Les plages en pointillé restent en attente. Les blocages des plateformes sont indicatifs : vous pouvez réserver ces dates dans FABI.</p></section>;
}
