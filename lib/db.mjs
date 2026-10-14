import pg from 'pg';
pg.types.setTypeParser(1082, value=>value);
let pool;
export function configured(){return Boolean(process.env.DATABASE_URL);}
export function database(){if(!configured())throw new Error('Base de données non configurée.');pool??=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000});return pool;}
export const query=(sql,values=[])=>database().query(sql,values);
export async function transaction(callback){const connection=await database().connect();try{await connection.query('BEGIN');const result=await callback(connection);await connection.query('COMMIT');return result;}catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}}
