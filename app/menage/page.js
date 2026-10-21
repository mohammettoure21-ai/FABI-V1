import {redirect} from 'next/navigation';
import {requireStaff} from '../../lib/auth';
import {financeLegacyUrl} from '../../lib/finance-navigation.mjs';
export default async function LegacyCleaning({searchParams}){await requireStaff();redirect(financeLegacyUrl(await searchParams,'/passages'));}
