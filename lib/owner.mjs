// Every query derives the property from the authenticated account, never a URL ID.
export async function ownerData(db,userId,year){
 const owner=(await db.query(`SELECT p.id,p.name,p.reference,p.neighborhood,p.category,p.bedrooms,p.nightly,p.status
  FROM users u JOIN properties p ON p.id=u.owner_property_id WHERE u.id=$1 AND u.active AND u.role='owner'`,[userId])).rows[0];
 if(!owner)return null;
 const [finance,stays]=await Promise.all([
  db.query(`SELECT e.id,e.kind,e.reporting_year,e.reporting_month,e.original_date,e.description,e.amount,e.activity,e.payment_status
   FROM finance_entries e JOIN users u ON u.owner_property_id=e.property_id
   WHERE u.id=$1 AND u.active AND u.role='owner' AND e.reporting_year=$2 AND e.kind IN ('recette','depense','loyer')
   ORDER BY e.reporting_month DESC,e.original_date DESC,e.id DESC`,[userId,year]),
  db.query(`SELECT r.id,r.property_id,r.arrival,r.departure,r.status,r.source,r.calendar_event_kind,r.nightly,r.agreed_total,
   CASE WHEN r.calendar_event_kind='blocked' THEN 'Indisponibilité' ELSE 'Séjour' END AS label
   FROM reservations r JOIN users u ON u.owner_property_id=r.property_id
   WHERE u.id=$1 AND u.active AND u.role='owner' AND r.status<>'Annulée' ORDER BY r.arrival`,[userId])
 ]);
 return {property:owner,entries:finance.rows,stays:stays.rows};
}
