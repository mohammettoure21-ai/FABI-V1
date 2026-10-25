// Local MCP stdio bridge. No credentials in tool arguments, responses, URLs or logs.
import {createInterface} from 'node:readline';
import {readFile,stat} from 'node:fs/promises';
const string={type:'string'},integer={type:'integer'};
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const tools=[
 {name:'fabi_properties',description:'Consulter les appartements gérés. Lecture sans effet métier.',inputSchema:schema({}),method:'GET',path:'properties'},
 {name:'fabi_reservations',description:'Consulter les séjours sur une période [from,to[ en dates ISO exactes.',inputSchema:schema({from:string,to:string},['from','to']),method:'GET',path:'reservations'},
 {name:'fabi_availability',description:'Vérifier un appartement géré, sans garantie pour une offre partenaire.',inputSchema:schema({property_id:integer,arrival:string,departure:string},['property_id','arrival','departure']),method:'GET',path:'availability'},
 {name:'fabi_request_dashboard',description:'Demander une session administrateur pour une tâche précise ; confirmation personnelle dans FABI obligatoire.',inputSchema:schema({task:string},['task']),method:'POST',path:'dashboard-requests'},
 {name:'fabi_open_dashboard',description:'Après confirmation personnelle dans FABI, préparer une session navigateur de 10 minutes. Aucun cookie n’est affiché.',inputSchema:schema({request_id:string},['request_id']),method:'POST',path:'dashboard-session'},
 {name:'fabi_report',description:'Consulter les chiffres enregistrés, commissions et soldes distincts, sans génération de dépense.',inputSchema:schema({year:integer,month:integer},['year']),method:'GET',path:'report'},
];
async function callTool(name,args){
 const tool=tools.find(t=>t.name===name);if(!tool)throw new Error('UNKNOWN_TOOL');
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(tool.inputSchema.properties,k)))throw new Error('INVALID_ARGUMENTS');
 const base=new URL(process.env.FABI_CRM_URL??'https://fabi-v1.vercel.app');
 const local=process.env.FABI_CRM_ALLOW_LOCAL==='true'&&['127.0.0.1','localhost'].includes(base.hostname);
 if(base.username||base.password||base.search||base.hash||(!local&&base.protocol!=='https:'))throw new Error('INVALID_SERVER');
 const path=process.env.FABI_CRM_KEY_FILE;if(!path)throw new Error('KEY_FILE_REQUIRED');
 const info=await stat(path);if(process.platform!=='win32'&&(info.mode&0o077)!==0)throw new Error('PRIVATE_KEY_FILE_PERMISSIONS_REQUIRED');
 const key=(await readFile(path,'utf8')).trim();if(!/^fabi_[\w-]{43}$/.test(key))throw new Error('INVALID_KEY_FILE');
 if(tool.path==='dashboard-session'&&!process.env.FABI_HERMES_BROWSER_STATE_FILE)throw new Error('BROWSER_STATE_FILE_REQUIRED');
 const url=new URL('/api/integration/'+tool.path,base),headers={Authorization:'Bearer '+key};
 const body={...args};if(tool.path==='bookings'){headers['Idempotency-Key']=body.idempotency_key;delete body.idempotency_key;}
 if(tool.method==='GET')for(const [k,v] of Object.entries(args))url.searchParams.set(k,String(v));else headers['Content-Type']='application/json';
 const response=await fetch(url,{method:tool.method,headers,body:tool.method==='POST'?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw new Error(/^[A-Z_]+$/.test(data.error??'')?data.error:'CRM_UNAVAILABLE');
 if(tool.path==='dashboard-session'){
  const {saveBrowserState}=await import('./hermes-browser-state.mjs');
  const file=await saveBrowserState(response,base,data.expires_at,process.env.FABI_HERMES_BROWSER_STATE_FILE);
  return {content:[{type:'text',text:JSON.stringify({storage_state_file:file,expires_at:data.expires_at,notice:'Importer ce fichier directement dans un navigateur Playwright local ; ne pas lire ni afficher son contenu.'})}]};
 }
 return {content:[{type:'text',text:JSON.stringify(data)}]};
}
async function handle(message){
 if(message.method==='initialize')return {protocolVersion:message.params?.protocolVersion??'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fabi-crm',version:'1.0.0'}};
 if(message.method==='ping')return {};
 if(message.method==='tools/list')return {tools:tools.map(({name,description,inputSchema})=>({name,description,inputSchema}))};
 if(message.method==='tools/call'){try{return await callTool(message.params?.name,message.params?.arguments??{});}catch(e){return {isError:true,content:[{type:'text',text:/^[A-Z_]+$/.test(e.message)?e.message:'CRM_UNAVAILABLE'}]};}}
 throw new Error('METHOD_NOT_FOUND');
}
const input=createInterface({input:process.stdin,crlfDelay:Infinity});let queue=Promise.resolve();
input.on('line',line=>{queue=queue.then(async()=>{
 let request;try{if(Buffer.byteLength(line)>32768)throw new Error();request=JSON.parse(line);}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}})+'\n');return;}
 if(request.id===undefined)return;
 try{const result=await handle(request);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');}
 catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method not found'}})+'\n');}
 });});
input.on('close',()=>queue.then(()=>{}));
