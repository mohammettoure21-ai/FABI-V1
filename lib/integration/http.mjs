import {deny} from './auth.mjs';
export async function bodyText(request,max=16384){
 const length=Number(request.headers.get('content-length')??0);if(length>max)deny(413,'BODY_TOO_LARGE');
 if(!request.body)return '';
 const reader=request.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();deny(413,'BODY_TOO_LARGE');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
export function apiResponse(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}

export async function jsonBody(request){try{const value=JSON.parse(await bodyText(request));if(!value||Array.isArray(value)||typeof value!=='object')deny(400,'INVALID_JSON_OBJECT');return value;}catch(e){if(e.status)throw e;deny(400,'INVALID_JSON');}}
