import {scryptSync,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function verifyPassword(password,hash){try{const [salt,key]=hash.split(':');const expected=Buffer.from(key,'hex');const actual=scryptSync(password,salt,64);return expected.length===actual.length&&timingSafeEqual(actual,expected);}catch{return false;}}
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export function text(value,max=200){return String(value??'').trim().slice(0,max);}
export function integer(value,min=0,max=1000000000){if(!/^\d+$/.test(String(value)))throw new Error('Entrez un nombre entier valide.');const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error('Montant ou quantité hors limites.');return n;}
export function dates(arrival,departure){const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;if(!valid(arrival)||!valid(departure)||departure<=arrival)throw new Error('La date de départ doit suivre une date d’arrivée valide.');return [arrival,departure];}
export const money=value=>new Intl.NumberFormat('fr-SN',{style:'currency',currency:'XOF',maximumFractionDigits:0}).format(value);
