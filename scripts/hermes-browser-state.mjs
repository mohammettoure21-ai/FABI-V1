import {writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function saveBrowserState(response,base,expiresAt,filename){
 if(!filename)throw new Error('BROWSER_STATE_FILE_REQUIRED');
 const value=response.headers.get('set-cookie')?.match(/(?:^|;\s*)fabi_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!value)throw new Error('SESSION_COOKIE_MISSING');
 const file=resolve(filename),repo=resolve('.');const within=(parent,child)=>{const r=relative(parent,child);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));};if(within(repo,file)&&!within(resolve('instance'),file))throw new Error('PRIVATE_STATE_PATH_REQUIRED');
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 const temp=file+'.'+randomUUID()+'.tmp';
 const expires=expiresAt===null?-1:Math.floor(Date.parse(expiresAt)/1000);if(!Number.isFinite(expires))throw new Error('INVALID_SESSION_EXPIRY');
 const state={cookies:[{name:'fabi_session',value,domain:base.hostname,path:'/',expires,httpOnly:true,secure:base.protocol==='https:',sameSite:'Lax'}],origins:[]};
 try{await writeFile(temp,JSON.stringify(state),{flag:'wx',mode:0o600});await rename(temp,file);}finally{await rm(temp,{force:true});}
 return file;
}
