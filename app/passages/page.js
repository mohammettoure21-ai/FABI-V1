import FinanceWorkspace from '../finances/workspace';
export default async function StaffServices({searchParams}){return <FinanceWorkspace params={await searchParams} section="passages"/>;}
