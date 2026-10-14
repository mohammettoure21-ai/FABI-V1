import {database} from '../lib/db.mjs';
import {schema} from '../lib/schema.mjs';
const db=database();try{await db.query(schema);console.log('Base initialisée. Les données existantes sont conservées.');}finally{await db.end();}
