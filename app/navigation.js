'use client';
import {useState,useEffect} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export default function Navigation({role,unread=0}) {
 const pathname=usePathname();
 const [count,setCount]=useState(unread);
 useEffect(()=>setCount(unread),[unread]);
 useEffect(()=>{let active=true;const controller=new AbortController();async function refresh(){if(document.visibilityState!=='visible')return;try{const response=await fetch('/api/messages/unread',{cache:'no-store',signal:controller.signal});if(response.ok){const data=await response.json();if(active&&Number.isInteger(data.count))setCount(data.count);}}catch{}}const timer=setInterval(refresh,20000);window.addEventListener('focus',refresh);refresh();return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};},[pathname]);
 const links=role==='owner'?[['/proprietaire','Mon appartement'],['/messages','Messages'+(count?' ('+count+')':'')]]:[['/','Tableau de bord'],['/appartements','Appartements'],['/reservations','Réservations'],['/messages','Messages'+(count?' ('+count+')':'')]];
 if(['admin','manager'].includes(role))links.push(['/finances','Finances']);
 if(role==='admin')links.push(['/equipe','Équipe & accès'],['/integrations','Accès Hermes']);
 const item=([href,label])=><Link key={href} href={href} aria-current={(href==='/'?pathname==='/':pathname.startsWith(href))?'page':undefined}>{label}</Link>;
 const secondary=[];
 if(['admin','manager'].includes(role))secondary.push(['/depenses','Dépenses']);
 if(role!=='owner')secondary.push(['/clients','Clients et partenaires']);
 return <nav className="sidebar-navigation" aria-label="Navigation principale"><div className="nav-primary">{links.map(item)}</div>{secondary.length>0&&<div className="nav-operations" aria-label="Gestion quotidienne"><span>GESTION QUOTIDIENNE</span>{secondary.map(item)}</div>}</nav>;
}
