// Connection check and an installation rehearsal that always rolls back.
import {database} from '../lib/db.mjs';
import {schema} from '../lib/schema.mjs';
let client;
try {
  client=await database().connect();
  await client.query('SELECT 1');
  console.log('FABI_DB_OK: authenticated with verified TLS');
  await client.query('BEGIN');
  await client.query(schema);
  await client.query('SELECT id FROM users LIMIT 1');
  await client.query('ROLLBACK');
  console.log('FABI_INSTALL_OK: schema and permissions verified; rehearsal rolled back');
} catch(error) {
  if(client)await client.query('ROLLBACK').catch(()=>{});
  console.error('FABI_DB_CHECK_FAILED:',String(error.code||error.name).replace(/[^A-Z0-9_]/gi,''));
  process.exitCode=1;
} finally {
  client?.release();
  await database().end();
}
