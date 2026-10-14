import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {database} from '../lib/db.mjs';
import {hashPassword} from '../lib/security.mjs';
let hidden=false;
const output=new Writable({write(chunk,encoding,callback){if(!hidden)process.stdout.write(chunk,encoding);callback();}});
const prompt=createInterface({input:process.stdin,output,terminal:true});
const db=database();
try{const name=(await prompt.question('Nom complet : ')).trim();const email=(await prompt.question('Adresse e-mail : ')).trim().toLowerCase();process.stdout.write('Mot de passe personnel (12 caractères minimum, saisie masquée) : ');hidden=true;const password=await prompt.question('');hidden=false;process.stdout.write('\n');if(!name||name.length>120||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||password.length<12||password.length>256)throw new Error('Nom, e-mail ou mot de passe invalide.');await db.query('INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4)',[name,email,hashPassword(password),'admin']);console.log('Compte administrateur créé.');}catch(error){console.error(error.code==='23505'?'Cet e-mail existe déjà.':error.message);process.exitCode=1;}finally{prompt.close();await db.end();}
