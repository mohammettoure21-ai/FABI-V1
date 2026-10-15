'use client';
import {useState} from 'react';
const monthNames=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const shortMonths=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
const money=value=>new Intl.NumberFormat('fr-SN',{style:'currency',currency:'XOF',maximumFractionDigits:0}).format(value);
export default function RevenueChart({data,year,initialMonth,scopeName='FABI',isProperty=false}) {
 const [selected,setSelected]=useState(initialMonth-1);
 const maximum=Math.max(...data.map(m=>m.total),1);
 const scale=Math.max(10000,Math.ceil(maximum/10000)*10000);
 const total=data.reduce((sum,m)=>sum+m.total,0);
 const current=data[selected];
 return <section className="revenue-panel" aria-label={'Revenus mensuels de '+scopeName}>
  <div className="revenue-heading"><div><span className="dashboard-eyebrow">{isProperty?'REVENUS DE L’APPARTEMENT '+scopeName:'REVENUS DE LA CONCIERGERIE'}</span><h2>{money(total)}</h2><p>{isProperty?'Recettes locatives':'Commissions enregistrées'} en {year}</p></div><span className="chart-legend"><i/> {isProperty?scopeName:'FABI Conciergerie'}</span></div>
  <div className="chart-scroll"><div className="revenue-chart"><div className="chart-axis" aria-hidden="true">{[1,.75,.5,.25,0].map(r=><span key={r}>{new Intl.NumberFormat('fr-SN',{notation:'compact',maximumFractionDigits:1}).format(scale*r)}</span>)}</div><div className="chart-plot"><div className="chart-grid" aria-hidden="true">{[0,1,2,3,4].map(n=><i key={n}/>)}</div><div className="chart-columns">{data.map((month,index)=><button type="button" key={index} className={'chart-column'+(selected===index?' is-selected':'')} onClick={()=>setSelected(index)} aria-pressed={selected===index} aria-label={monthNames[index]+' '+year+' : '+money(month.total)} title={monthNames[index]+' : '+money(month.total)}><span className="chart-bar-zone"><span className={'chart-bar'+(!month.total?' is-zero':'')} style={{height:Math.max(month.total/scale*100,1)+'%'}}/></span><span className="chart-month">{shortMonths[index]}</span></button>)}</div></div></div></div>
  <div className="chart-selection" aria-live="polite"><div><span>{monthNames[selected]} {year}</span><strong>{money(current.total)}</strong><small>{current.count} {isProperty?'recette':'commission'}{current.count>1?'s':''}</small></div><div className="chart-breakdown">{current.activities.length?current.activities.map(a=><span key={a.activity}>{a.activity}<b>{money(a.total)}</b></span>):<p>Aucun revenu enregistré ce mois-ci.</p>}</div></div>
  <p className="chart-note">Cliquez sur un mois pour voir le détail. {isProperty?'Les commissions FABI ne sont pas ajoutées aux recettes locatives.':'Les recettes locatives ne sont pas ajoutées aux commissions FABI.'}</p>
 </section>;
}
