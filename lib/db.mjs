import pg from 'pg';
import {readFileSync} from 'node:fs';
import {rootCertificates} from 'node:tls';
pg.types.setTypeParser(1082, value=>value);
let pool;
// Vercel's Supabase integration maintains POSTGRES_URL automatically.
function connectionString(){
  return process.env.VERCEL === '1'
    ? process.env.POSTGRES_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL || process.env.POSTGRES_URL;
}
export function configured(){return Boolean(connectionString());}
export function connectionOptions(){
  const value=connectionString();
  if(!value)throw new Error('Base de données non configurée.');
  const url=new URL(value);
  const options={connectionString:value,max:5,connectionTimeoutMillis:10000};
  if(url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.pooler.supabase.com')){
    // URL SSL settings override pg's ssl object. Supply a trusted CA explicitly.
    for(const key of ['sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat','ssl'])url.searchParams.delete(key);
    options.connectionString=url.toString();
    options.ssl={
      rejectUnauthorized:true,
      ca:[...rootCertificates,readFileSync(new URL('./certs/supabase-ca.crt',import.meta.url),'utf8')]
    };
  }
  return options;
}
export function database(){pool??=new pg.Pool(connectionOptions());return pool;}
export const query=(sql,values=[])=>database().query(sql,values);
export async function transaction(callback){const connection=await database().connect();try{await connection.query('BEGIN');const result=await callback(connection);await connection.query('COMMIT');return result;}catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}}

