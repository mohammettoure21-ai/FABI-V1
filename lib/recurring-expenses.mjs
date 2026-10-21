export const recurringExpenseSchema=`
CREATE TABLE IF NOT EXISTS recurring_expenses (
 id SERIAL PRIMARY KEY, property_id INTEGER REFERENCES properties(id),
 description TEXT NOT NULL, amount BIGINT NOT NULL CHECK(amount>0 AND amount<=1000000000),
 start_date DATE NOT NULL CHECK(start_date BETWEEN DATE '2000-01-01' AND DATE '2200-12-31'),
 active BOOLEAN NOT NULL DEFAULT TRUE, created_by INTEGER NOT NULL REFERENCES users(id),
 request_key UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(request_key,property_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS recurring_wifi_active ON recurring_expenses(COALESCE(property_id,0)) WHERE active;
CREATE TABLE IF NOT EXISTS recurring_expense_months (
 rule_id INTEGER NOT NULL REFERENCES recurring_expenses(id),
 period TEXT NOT NULL, entry_id INTEGER NOT NULL REFERENCES finance_entries(id),
 reused_existing BOOLEAN NOT NULL DEFAULT FALSE, warning TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(rule_id,period)
);
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expense_months ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON recurring_expenses,recurring_expense_months FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON recurring_expenses,recurring_expense_months FROM authenticated; END IF;
END $$;
`;
export function dueMonths(start,today){
 const first=start instanceof Date?start.toISOString().slice(0,10):String(start).slice(0,10),now=today instanceof Date?today.toISOString().slice(0,10):String(today).slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(first)||!/^\d{4}-\d{2}-\d{2}$/.test(now))throw new Error('INVALID_DATE');
 const [year,month,day]=first.split('-').map(Number),[endYear,endMonth]=now.split('-').map(Number);
 if(year<2000||year>2200||endYear>2200||!Number.isFinite(Date.parse(first))||new Date(first).toISOString().slice(0,10)!==first||!Number.isFinite(Date.parse(now))||new Date(now).toISOString().slice(0,10)!==now)throw new Error('INVALID_DATE');
 const rows=[];
 for(let y=year,m=month;y<endYear||(y===endYear&&m<=endMonth);m===12?(y++,m=1):m++){
  const period=String(y)+'-'+String(m).padStart(2,'0');
  const date=period+'-'+String(Math.min(day,new Date(Date.UTC(y,m,0)).getUTCDate())).padStart(2,'0');
  if(date<=now)rows.push({period,date,year:y,month:m});
 }
 return rows;
}
// Caller supplies a transaction. A lock makes generation safe across cron, page reads and retries.
export async function generateRecurringExpenses(db,today=new Date().toISOString().slice(0,10)){
 await db.query("SELECT pg_advisory_xact_lock(hashtext('fabi-recurring-wifi'))");
 const {rows:rules}=await db.query('SELECT * FROM recurring_expenses WHERE active ORDER BY id FOR UPDATE');
 let created=0,reused=0;
 for(const rule of rules){
  const done=new Set((await db.query('SELECT period FROM recurring_expense_months WHERE rule_id=$1',[rule.id])).rows.map(r=>r.period));
  for(const due of dueMonths(rule.start_date,today)){
   if(done.has(due.period))continue;
   // Reuse a Wi-Fi charge already recorded in this accounting month, without changing its date or amount.
   const existing=await db.query("SELECT id,amount FROM finance_entries WHERE kind='depense' AND activity='Wifi' AND property_id IS NOT DISTINCT FROM $1 AND reporting_year=$2 AND reporting_month=$3 ORDER BY (amount=$4) DESC,id LIMIT 1 FOR UPDATE",[rule.property_id,due.year,due.month,rule.amount]);
   let id=existing.rows[0]?.id;
   if(id)reused++;
   else{
    const result=await db.query(`INSERT INTO finance_entries(property_id,kind,reporting_year,reporting_month,original_date,description,amount,activity,payment_status,created_by,comment,source_sheet)
     VALUES($1,'depense',$2,$3,$4,$5,$6,'Wifi','Payé',$7,$8,'Wi-Fi mensuel automatique') RETURNING id`,[rule.property_id,due.year,due.month,due.date,rule.description,rule.amount,rule.created_by,'Dépense mensuelle automatique · Wi-Fi']);
    id=result.rows[0].id;created++;
    await db.query("INSERT INTO audit(user_id,action) VALUES($1,$2)",[rule.created_by,'Dépense Wi-Fi mensuelle '+due.period+' · écriture '+id]);
   }
   await db.query('INSERT INTO recurring_expense_months(rule_id,period,entry_id,reused_existing,warning) VALUES($1,$2,$3,$4,$5)',[rule.id,due.period,id,Boolean(existing.rows.length),existing.rows.length&&Number(existing.rows[0].amount)!==Number(rule.amount)?'Wi-Fi déjà présent avec un montant différent : écriture existante conservée, aucun ajout automatique.':'']);
  }
 }
 return {created,reused};
}

export async function createRecurringWifi(db,{propertyIds,date,amount,description,requestKey,userId},today){
 await db.query("SELECT pg_advisory_xact_lock(hashtext('fabi-recurring-wifi'))");
 for(const propertyId of propertyIds){
  if(propertyId!==null&&!(await db.query('SELECT id FROM properties WHERE id=$1 FOR SHARE',[propertyId])).rows.length)throw new Error('PROPERTY_INVALID');
  const replay=await db.query('SELECT id FROM recurring_expenses WHERE request_key=$1 AND property_id IS NOT DISTINCT FROM $2',[requestKey,propertyId]);
  if(replay.rows.length)continue;
  if((await db.query('SELECT id FROM recurring_expenses WHERE active AND property_id IS NOT DISTINCT FROM $1',[propertyId])).rows.length)throw new Error('WIFI_ALREADY_ACTIVE');
  await db.query('INSERT INTO recurring_expenses(property_id,description,amount,start_date,created_by,request_key) VALUES($1,$2,$3,$4,$5,$6)',[propertyId,description,amount,date,userId,requestKey]);
  await db.query('INSERT INTO audit(user_id,action) VALUES($1,$2)',[userId,'Activation Wi-Fi mensuel · '+amount+' FCFA · '+(propertyId??'FABI')+' · début '+date]);
 }
 return generateRecurringExpenses(db,today);
}
