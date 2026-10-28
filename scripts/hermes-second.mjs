// Run only on the second agent's machine, in its own Hermes profile.
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,dirname,join,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export async function prepareSecondHermes(directory=join(homedir(),'.fabi','hermes-2')){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),folder=resolve(directory);
 const rel=relative(root,folder);
 if(rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel)))throw new Error('PRIVATE_DIRECTORY_OUTSIDE_REPOSITORY_REQUIRED');
 const keyFile=join(folder,'hermes-2.key'),configFile=join(folder,'hermes-2-mcp.yaml'),stateFile=join(folder,'hermes-2-state.json');
 for(const file of [keyFile,configFile,stateFile]){
  try{await access(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  throw new Error('HERMES_2_FILES_ALREADY_EXIST');
 }
 await mkdir(folder,{recursive:true,mode:0o700});
 const key='fabi_'+randomBytes(32).toString('base64url');
 await writeFile(keyFile,key+'\n',{flag:'wx',mode:0o600});
 const quoted=value=>JSON.stringify(value);
 const toolNames=['fabi_properties','fabi_reservations','fabi_availability','fabi_report','fabi_prepare_reservation','fabi_prepare_expense','fabi_execute_operation','fabi_open_dashboard'];
 const config=`# Hermes 2 uniquement : fusionner dans son profil séparé, jamais dans celui du premier agent.
mcp_servers:
  fabi:
    command: ${quoted(process.execPath)}
    args:
      - ${quoted(join(root,'scripts','hermes-mcp.mjs'))}
    env:
      FABI_CRM_URL: https://fabi-v1.vercel.app
      FABI_CRM_KEY_FILE: ${quoted(keyFile)}
      FABI_HERMES_BROWSER_STATE_FILE: ${quoted(stateFile)}
    tools:
      include:
${toolNames.map(name=>'        - '+name).join('\n')}
`;
 // Never edit an existing profile or overwrite an existing file, even on retry.
 await writeFile(configFile,config,{flag:'wx',mode:0o600});
 return {name:'Hermes 2',fingerprint:createHash('sha256').update(key).digest('hex'),keyFile,configFile,stateFile};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const result=await prepareSecondHermes(process.argv[2]);
  console.log('Configuration préparée pour Hermes 2, sans modifier le premier agent.');
  console.log('Empreinte SHA-256 à enregistrer dans FABI : '+result.fingerprint);
  console.log('Clé privée conservée localement : '+result.keyFile);
  console.log('Fragment MCP pour le profil Hermes 2 : '+result.configFile);
  console.log('Futur fichier de session privé : '+result.stateFile);
  console.log('Aucune connexion au CRM n’a encore été testée. Ne partagez aucun fichier privé.');
 }catch(error){
  console.error(error.message==='HERMES_2_FILES_ALREADY_EXIST'?'Arrêt : des fichiers Hermes 2 existent déjà. Aucun remplacement. Conservez-les ; ne regénérez pas la clé.':'Préparation arrêtée. Vérifiez le dossier privé et ses droits ; les fichiers déjà créés restent conservés.');
  process.exitCode=1;
 }
}
