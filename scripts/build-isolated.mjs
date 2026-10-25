import {spawn} from 'node:child_process';
// Never executes the migration hook and never inherits a production database or messaging credential.
const env={...process.env,DATABASE_URL:'',POSTGRES_URL:'',VERCEL:'',FABI_SETUP_TOKEN:'',GMAIL_USER:'',GMAIL_APP_PASSWORD:'',FABI_INTEGRATION_ENABLED:'false',FABI_INTEGRATION_WRITES_ENABLED:'false',FABI_WHATSAPP_ENABLED:'false',FABI_WHATSAPP_SEND_ENABLED:'false',WHATSAPP_ACCESS_TOKEN:'',NEXT_TELEMETRY_DISABLED:'1'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{env,stdio:'inherit'});child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
