export async function removeImportedRent(db) {
 const key='remove_unwanted_imported_rent_20261015';
 if((await db.query('SELECT name FROM app_migrations WHERE name=$1',[key])).rows.length)return;
 const deleted=await db.query("DELETE FROM finance_entries WHERE kind='loyer' AND amount=600000 AND source_sheet='Ecrin' AND source_row=31 AND import_id IS NOT NULL AND lower(trim(description))='dubai loyer' RETURNING import_id");
 for(const {import_id} of deleted.rows) {
  await db.query(`UPDATE finance_imports SET
   notes=COALESCE((SELECT jsonb_agg(note) FROM jsonb_array_elements(notes) note WHERE lower(note::text) NOT LIKE '%dubai%'),'[]'::jsonb),
   source_data=jsonb_set(source_data,'{Ecrin}',COALESCE((SELECT jsonb_agg(row_data) FROM jsonb_array_elements(source_data->'Ecrin') row_data WHERE (row_data->>'row')::int<>31),'[]'::jsonb)) WHERE id=$1`,[import_id]);
 }
 await db.query('INSERT INTO audit(action) VALUES($1)',['Suppression de l’écriture de loyer importée à la demande de l’administrateur ; lignes supprimées : '+deleted.rows.length]);
 await db.query('INSERT INTO app_migrations(name) VALUES($1)',[key]);
 console.log('FABI : ancienne écriture de loyer supprimée :',deleted.rows.length);
}
