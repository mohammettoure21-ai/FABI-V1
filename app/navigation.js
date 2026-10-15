'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

export default function Navigation({role}) {
 const pathname=usePathname();
 const links=[['/','Tableau de bord'],['/clients','Clients & prospects'],['/appartements','Appartements'],['/reservations','Réservations']];
 if(role!=='employee')links.push(['/finances','Finances']);
 if(role==='admin')links.push(['/equipe','Équipe & accès']);
 return <nav aria-label="Navigation principale">{links.map(([href,label])=><Link key={href} href={href} aria-current={(href==='/'?pathname==='/':pathname.startsWith(href))?'page':undefined}>{label}</Link>)}</nav>;
}
