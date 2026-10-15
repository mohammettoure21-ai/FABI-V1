import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectedRevenue,stayAmount,editStayValues} from '../lib/stay.mjs';
import {calendarWeeks} from '../lib/reservation-calendar.mjs';
test('Prix et dates : total convenu ou prix par nuit, zéro explicite et prix inconnu',()=>{
 assert.equal(stayAmount({arrival:'2026-11-01',departure:'2026-11-04',nightly:40000,agreed_total:null}),120000);
 assert.equal(stayAmount({arrival:'2026-11-01',departure:'2026-11-04',nightly:null,agreed_total:'100000'}),100000);
 assert.equal(stayAmount({arrival:'2026-11-01',departure:'2026-11-04',nightly:null,agreed_total:null}),null);
 const form=new FormData();Object.entries({edit_arrival:'2026-11-01',edit_departure:'2026-11-04',price_mode:'total',price:'0'}).forEach(([k,v])=>form.set(k,v));
 assert.equal(editStayValues(form).total,0);form.set('edit_departure','2026-10-31');assert.throws(()=>editStayValues(form));
});
test('Prévisionnel : nuits futures, montants exacts sur deux années, aucun revenu inventé',()=>{
 const stays=[{property_id:1,arrival:'2026-12-30',departure:'2027-01-02',nightly:null,agreed_total:100001,expected_commission:10001,status:'Confirmée',calendar_event_kind:'reservation'},
 {property_id:1,arrival:'2026-11-01',departure:'2026-11-03',nightly:null,agreed_total:null,status:'Confirmée',calendar_event_kind:'reservation'},
 {property_id:1,arrival:'2026-11-05',departure:'2026-11-06',nightly:40000,status:'Annulée',calendar_event_kind:'reservation'},
 {property_id:1,arrival:'2026-11-10',departure:'2026-11-11',nightly:40000,status:'Confirmée',calendar_event_kind:'blocked'}];
 const current=projectedRevenue(stays,2026,'2026-10-15',1),next=projectedRevenue(stays,2027,'2026-10-15',1);
 assert.equal(current.total+next.total,100001);assert.equal(current.missing,1);assert.equal(current.months[11].count,1);
 assert.equal(projectedRevenue(stays,2026,'2026-12-31',1).total,33334);
 assert.equal(projectedRevenue(stays,2026,'2026-10-15',2).total,0);
 assert.equal(projectedRevenue(stays,2026,'2026-10-15').total+projectedRevenue(stays,2027,'2026-10-15').total,10001);
});
test('Calendrier : départ exclusif, continuations sur plusieurs semaines et annulation masquée',()=>{
 const stays=[{id:1,arrival:'2026-11-01',departure:'2026-11-10',status:'Confirmée'}, {id:2,arrival:'2026-11-10',departure:'2026-11-11',status:'Confirmée'}, {id:3,arrival:'2026-11-11',departure:'2026-11-15',status:'Annulée'}];
 const weeks=calendarWeeks(2026,10,stays);
 assert.ok(weeks.some(w=>w.segments.some(s=>s.id===1&&s.continuesLeft)));
 assert.ok(weeks.every(w=>!w.segments.some(s=>s.id===3)));
 const segments=weeks.find(w=>w.segments.some(s=>s.id===2)).segments;
 assert.equal(segments.find(s=>s.id===1).end,segments.find(s=>s.id===2).start);
 assert.equal(segments.find(s=>s.id===1).lane,segments.find(s=>s.id===2).lane);
});
