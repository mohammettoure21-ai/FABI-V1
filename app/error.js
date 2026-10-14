'use client';
export default function ErrorPage({reset}){return <section className="panel"><h1>Cette page est momentanément indisponible.</h1><p>Vérifiez la connexion à la base de données et vos droits d’accès. Aucune donnée confidentielle n’est affichée dans ce message.</p><button onClick={()=>reset()}>Réessayer</button></section>}
