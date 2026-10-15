'use client';
import {useState,useRef,useMemo} from 'react';
import Link from 'next/link';
import {calendarWeeks} from '../../lib/reservation-calendar.mjs';
const names=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const money=value=>new Intl.NumberFormat('fr-SN',{notation:'compact',maximumFractionDigits:0}).format(value);
const sourceClass=source=>source==='Airbnb'?'airbnb':source==='Booking'?'booking':'crm';
export default function ReservationCalendar({properties,stays,year,month,initialPropertyId,showPrices,today,initialView='month'}) {
 const [propertyId,setPropertyId]=useState(initialPropertyId??properties[0]?.id);
 const [view,setView]=useState(initialView);
 const [period,setPeriod]=useState({year,month});
 const slider=useRef(null);
 const setDrag=value=>{if(slider.current)slider.current.style.transform=`translateX(${value}px)`;};
 const gesture=useRef(null),suppressClick=useRef(false),wheelLock=useRef(0);
 year=period.year;month=period.month;
 function shift(delta){const date=new Date(Date.UTC(year,month-1+delta,1));if(date.getUTCFullYear()<2000||date.getUTCFullYear()>2200)return;setPeriod({year:date.getUTCFullYear(),month:date.getUTCMonth()+1});}
 function startDrag(e){if(e.button!==0&&e.pointerType==='mouse')return;gesture.current={x:e.clientX,y:e.clientY,id:e.pointerId,target:e.currentTarget,locked:false};suppressClick.current=false;}
 function moveDrag(e){const g=gesture.current;if(!g)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.locked&&Math.abs(dy)>Math.abs(dx)&&Math.abs(dy)>12){gesture.current=null;return;}if(Math.abs(dx)>10){g.locked=true;suppressClick.current=true;g.target.setPointerCapture(e.pointerId);setDrag(Math.max(-100,Math.min(100,dx)));}}
 function endDrag(e){const g=gesture.current;if(!g)return;gesture.current=null;setDrag(0);if(g.locked&&Math.abs(e.clientX-g.x)>55)shift((e.clientX<g.x?1:-1)*(view==='year'?12:1));if(g.target.hasPointerCapture(e.pointerId))g.target.releasePointerCapture(e.pointerId);}
 function wheel(e){if(Math.abs(e.deltaX)<35||Math.abs(e.deltaX)<=Math.abs(e.deltaY)||Date.now()-wheelLock.current<450)return;wheelLock.current=Date.now();shift((e.deltaX>0?1:-1)*(view==='year'?12:1));}

 const property=properties.find(p=>p.id===propertyId);
 const selected=useMemo(()=>stays.filter(s=>s.property_id===propertyId),[stays,propertyId]);
 function priceForDay(day) {
  const stay=selected.find(s=>s.status==='Confirmée'&&s.calendar_event_kind!=='blocked'&&s.arrival<=day&&s.departure>day);
  if(!stay)return property?.nightly==null?null:money(property.nightly);
  if(stay.calendar_event_kind==='blocked')return '—';
  const nights=(Date.parse(stay.departure)-Date.parse(stay.arrival))/86400000;
  const rate=stay.agreed_total!=null?Number(stay.agreed_total)/nights:stay.nightly;
  return rate==null?'Prix ?':money(rate);
 }
 function renderMonth(renderYear,renderMonth) {
  const weeks=calendarWeeks(renderYear,renderMonth,selected);
  return <section className="stay-month" key={renderYear+'-'+renderMonth} aria-label={names[renderMonth]+' '+renderYear}><h3>{names[renderMonth]} <span>{renderYear}</span></h3><div className="stay-weekdays">{['L','M','M','J','V','S','D'].map((name,i)=><span key={i}>{name}</span>)}</div>{weeks.map((week,index)=><div className="stay-week" key={index} style={{minHeight:Math.max(88,50+week.lanes*27)+'px'}}>{week.days.map(day=><div className={'stay-day'+(!day.inMonth?' outside-month':'')+(day.date===today?' is-today':'')} key={day.date}><span>{day.day}</span>{day.inMonth&&showPrices&&<small>{priceForDay(day.date)}</small>}</div>)}<div className="stay-bars">{week.segments.map(stay=><Link key={stay.id} className={'stay-bar '+sourceClass(stay.source)+(stay.status==='En attente'?' tentative':'')+(stay.calendar_event_kind==='blocked'?' blocked':'')+(stay.continuesLeft?' continues-left':'')+(stay.continuesRight?' continues-right':'')} href={'/reservations?modifier='+stay.id+'&cal_annee='+year+'&cal_mois='+month+'&cal_bien='+propertyId+'#modifier-sejour'} style={{left:`calc(${stay.start/7*100}% + 2px)`,width:`calc(${(stay.end-stay.start)/7*100}% - 4px)`,top:stay.lane*27+'px'}} title={(stay.calendar_event_kind==='blocked'?'Blocage indicatif':stay.label)+' · '+stay.source+' · '+stay.arrival+' → '+stay.departure} aria-label={'Modifier '+(stay.calendar_event_kind==='blocked'?'indisponibilité':stay.label)+' '+stay.source+' '+stay.arrival+' au '+stay.departure}><span>{stay.calendar_event_kind==='blocked'?'Blocage indicatif':stay.label}</span><i/></Link>)}</div></div>)}</section>;
 }
 const next=new Date(Date.UTC(year,month,1));
 return <section className="reservation-calendar-panel"><div className="stay-calendar-heading"><div><small>DISPONIBILITÉS & SÉJOURS</small><h2>Calendrier des réservations</h2></div><div className="stay-calendar-nav"><button type="button" onClick={()=>shift(view==='year'?-12:-1)} aria-label="Période précédente">‹</button><b>{view==='year'?year:names[month-1]+' '+year}</b><button type="button" onClick={()=>shift(view==='year'?12:1)} aria-label="Période suivante">›</button><select aria-label="Vue du calendrier" value={view} onChange={e=>setView(e.target.value)}><option value="month">Mois</option><option value="year">Année</option></select></div></div>
 <div className="stay-property-tabs" role="group" aria-label="Appartement du calendrier">{properties.map(p=><button key={p.id} type="button" aria-pressed={p.id===propertyId} onClick={()=>setPropertyId(p.id)}>{p.name}</button>)}</div>
 <div className="stay-calendar-legend"><span><i className="airbnb"/> Airbnb</span><span><i className="booking"/> Booking</span><span><i className="crm"/> Saisie CRM</span><small>Glissez pour changer de mois · Cliquez sur un séjour pour le modifier.</small></div>
 {!property?<p>Ajoutez un appartement pour afficher son calendrier.</p>:<div className={'stay-month-grid swipe-calendar '+(view==='year'?'year-view':'')} ref={slider} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={()=>{gesture.current=null;setDrag(0);}} onWheel={wheel} onDragStart={e=>e.preventDefault()} onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}>{view==='year'?Array.from({length:12},(_,i)=>renderMonth(year,i)):<>{renderMonth(year,month-1)}{renderMonth(next.getUTCFullYear(),next.getUTCMonth())}</>}</div>}
 <p className="muted">Les jours libres affichent le tarif de base ; les séjours affichent leur prix convenu par nuit, ou « Prix ? » s’il manque. Les barres couvrent les nuits réservées ; le départ libère la date pour une nouvelle arrivée. Les plages en pointillé restent en attente. Les blocages des plateformes sont indicatifs : vous pouvez réserver ces dates dans FABI.</p></section>;
}
