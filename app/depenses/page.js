import FinanceWorkspace from '../finances/workspace';
export default async function Expenses({searchParams}){return <FinanceWorkspace params={await searchParams} section="depenses"/>;}
