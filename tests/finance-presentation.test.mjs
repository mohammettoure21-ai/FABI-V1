import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financeEntryDate,financeHistoryGroups} from '../lib/finance-history.mjs';
import {financeReturnUrl} from '../lib/finance-navigation.mjs';

test('Historique : mois comptable conservé, dates réelles seulement, aucun jour inventé',()=>{
 assert.equal(financeEntryDate('Octobre'),null);assert.equal(financeEntryDate('21'),null);
 assert.equal(financeEntryDate('2026-02-30'),null);
 assert.deepEqual(financeEntryDate('21/10/2026'),{iso:'2026-10-21',day:'21',month:10});
 const entries=[{id:1,reporting_year:2025,reporting_month:12,original_date:''},{id:2,reporting_year:2026,reporting_month:10,original_date:'2026-10-01'},{id:3,reporting_year:2026,reporting_month:10,original_date:''},{id:4,reporting_year:2026,reporting_month:10,original_date:'2026-10-21'}];
 const groups=financeHistoryGroups(entries);
 assert.deepEqual(groups.map(g=>g.key),['2026-10','2025-12']);
 assert.deepEqual(groups[0].entries.map(e=>e.id),[4,2,3]);
 assert.equal(entries[2].original_date,'');assert.equal(entries[0].id,1);
});
test('Retour après paiement : rubrique et filtres conservés, redirection externe refusée',()=>{
 const form=new FormData();for(const [name,value] of Object.entries({return_to:'/menage',return_year:'2026',return_month:'10',return_scope:'2'}))form.set(name,value);
 assert.equal(financeReturnUrl(form,{message:'Paiement noté'}),'/passages?annee=2026&mois=10&bien=2&succes=Paiement+not%C3%A9');
 form.set('return_provider','Employé test');assert.equal(new URL(financeReturnUrl(form),'http://localhost').searchParams.get('intervenant'),'Employé test');
 form.set('return_to','https://malicious.invalid');
 assert.match(financeReturnUrl(form),/^\/finances\?/);
 form.set('return_month','99');assert.doesNotMatch(financeReturnUrl(form),/mois=/);
});
