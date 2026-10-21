import {redirect} from 'next/navigation';
import {requireStaff} from '../../lib/auth';
import {financeLegacyUrl} from '../../lib/finance-navigation.mjs';
import FinanceWorkspace from './workspace';
export default async function Finances({searchParams}){
 const params=await searchParams;
 if(['depenses','menage'].includes(params.onglet)){
  await requireStaff();
  redirect(financeLegacyUrl(params,params.onglet==='menage'?'/passages':'/depenses'));
 }
 return <FinanceWorkspace params={params}/>;
}
