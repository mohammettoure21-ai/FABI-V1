// Run on the Hermes machine. The private key never leaves the chosen private file.
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
const output=process.argv[2];
if(!output){console.error('Indiquez le chemin du fichier privé, hors du dépôt ou dans instance/.');process.exit(1);}
try{
 const file=resolve(output),repo=resolve('.');const within=(parent,child)=>{const r=relative(parent,child);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));};if(within(repo,file)&&!within(resolve('instance'),file))throw new Error();
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 const token='fabi_'+randomBytes(32).toString('base64url');
 await writeFile(file,token+'\n',{mode:0o600,flag:'wx'});
 console.log('Empreinte à enregistrer dans FABI (ceci n’est pas la clé privée) :');
 console.log(createHash('sha256').update(token).digest('hex'));
 console.log('La clé privée reste dans le fichier choisi. Ne la collez pas dans le chat.');
}catch{console.error('Fichier non créé. Vérifiez le chemin privé ; un fichier existant ne sera jamais remplacé ni supprimé.');process.exitCode=1;}
