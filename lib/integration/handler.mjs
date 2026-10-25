import {requestDashboard,redeemDashboard} from './dashboard.mjs';
import {authenticate,accessLog,deny,IntegrationError} from './auth.mjs';
import {properties,reservations,availability,report} from './business.mjs';
import {jsonBody,apiResponse} from './http.mjs';
const routes={
 'GET properties':['properties:read',properties],
 'GET reservations':['reservations:read',reservations],
 'GET availability':['reservations:read',availability],
 'GET report':['reports:read',report],
 'POST dashboard-requests':['dashboard:admin',requestDashboard],
 'POST dashboard-session':['dashboard:admin',redeemDashboard],

};
export async function integrationHandler(request,path,{db,transaction,env=process.env}){
 let credential,operation=`${request.method} ${path}`;
 const route=routes[operation];if(!route)return apiResponse({error:'NOT_FOUND'},404);
 try{
  credential=await authenticate(db,request.headers.get('authorization'),route[0],env);
  const recent=await db.query("SELECT count(*)::int n FROM integration_access_log WHERE credential_id=$1 AND at>NOW()-INTERVAL '1 minute'",[credential.id]);
  if(recent.rows[0].n>=120)deny(429,'RATE_LIMITED');
  const input=request.method==='GET'?Object.fromEntries(new URL(request.url).searchParams):await jsonBody(request);
  const result=request.method==='GET'?await route[1](db,credential,input,env):await transaction(async tx=>{
   const fresh=await authenticate(tx,request.headers.get('authorization'),route[0],env,true);
   return path==='dashboard-requests'?requestDashboard(tx,fresh,input.task):redeemDashboard(tx,fresh,input.request_id);
  });
  if(path==='dashboard-session'){
   await accessLog(db,credential,operation,'session_issued');
   const response=apiResponse({expires_at:result.expires,confirmation_scope:'Session administrateur pour la tâche approuvée, maximum 10 minutes.'});
   const secure=new URL(request.url).protocol==='https:';
   response.headers.set('Set-Cookie',`fabi_session=${result.secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${secure?'; Secure':''}`);return response;
  }
  await accessLog(db,credential,operation,'ok');return apiResponse(result,200);
 }catch(error){
  const status=error.status??(error.code==='23P01'?409:500),code=error instanceof IntegrationError?error.code:error.code==='23P01'?'BOOKING_OVERLAP':'INTEGRATION_UNAVAILABLE';
  try{if(credential)await accessLog(db,credential,operation,code);else if(env.FABI_INTEGRATION_ENABLED==='true'&&status===401){const n=(await db.query("SELECT count(*)::int n FROM integration_access_log WHERE credential_id IS NULL AND at>NOW()-INTERVAL '1 minute'")).rows[0].n;if(n<30)await accessLog(db,null,operation,code);}}catch{}
  return apiResponse({error:code},status);
 }
}
