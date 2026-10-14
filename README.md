# FABI CRM — version web

FABI s’utilise désormais dans un navigateur. La version Python/Windows a été remplacée par Next.js (JavaScript) et PostgreSQL. L’ancienne version reste récupérable dans l’historique Git ; ses données locales n’ont pas été supprimées. Aucune migration de SQLite n’a été effectuée.

## Comprendre les trois pièces

- **GitHub** conserve le code et l’historique des modifications.
- **Vercel** peut exécuter le site et fournir une adresse HTTPS.
- **PostgreSQL** garde les comptes, clients, appartements et réservations. Une base externe est nécessaire : les fichiers locaux de Vercel ne sont pas un stockage durable.

Le code n’appelle aucune API payante ou service d’IA. Le coût et l’éligibilité de l’hébergement dépendent de ses conditions. Vérifiez les offres actuelles avant de choisir : l’offre Vercel Hobby est destinée à un usage personnel non commercial, elle ne doit pas être présentée comme un hébergement gratuit garanti pour l’activité commerciale de FABI. La première mise en ligne doit rester une démonstration avec données fictives. Aucun site n’est déployé automatiquement par ce dépôt.

## Mise en ligne de démonstration, pas à pas

1. Créez votre compte Vercel et reliez-le à votre GitHub. Dans « Add New Project », importez `mohammettoure21-ai/FABI-V1`. Le framework est **Next.js**. Gardez les commandes proposées (`npm run build`).
2. Créez une base PostgreSQL chez un fournisseur compatible, par exemple Neon, après vérification de ses conditions gratuites et de sa région d’hébergement. Copiez son URL de connexion **privée**, avec TLS activé, uniquement dans les paramètres sécurisés Vercel.
3. Dans « Settings → Environment Variables » du projet Vercel, ajoutez `DATABASE_URL` avec cette URL. Ne publiez jamais cette valeur dans GitHub ou dans un message. Les connexions utilisent le certificat du fournisseur ; le code ne désactive pas sa vérification.
4. Ajoutez aussi `FABI_SETUP_TOKEN` : un code secret aléatoire d’au moins 32 caractères. Ce code est uniquement destiné à la première installation. Vous pouvez générer une valeur dans un gestionnaire de mots de passe.
5. Déployez (ou redéployez après avoir ajouté les variables). Ouvrez l’adresse HTTPS donnée par Vercel, suivie de `/installation`.
6. Saisissez votre code d’installation, votre nom, votre e-mail et un mot de passe personnel d’au moins 12 caractères. Le site crée les tables et votre compte administrateur. Cette opération n’efface pas les données et ne peut pas recréer un premier compte quand un compte existe déjà.
7. Retirez `FABI_SETUP_TOKEN` des paramètres Vercel et redéployez. Ouvrez `/connexion` et connectez-vous. Vous pouvez maintenant ajouter des contacts, des appartements et des séjours fictifs.

Si `/connexion` indique que la base n’est pas configurée : vérifiez `DATABASE_URL`, l’environnement Vercel sélectionné et redéployez. Si la connexion échoue avant installation, commencez par `/installation`. Ne partagez pas le code d’installation ou le mot de passe de la base.

Les données sont hébergées chez votre fournisseur PostgreSQL, pas sur votre PC. Avant d’importer des clients réels, validez les règles de confidentialité, les sauvegardes et l’hébergement retenu. Aucun document financier original n’a été importé.

## Ce qui fonctionne dans cette version

- Connexion et déconnexion, sessions expirant après 30 minutes, mots de passe salés/hachés, limitation à cinq échecs par e-mail sur quinze minutes.
- Rôles administrateur, responsable et employé côté serveur. Les employés ne lisent que leurs contacts et réservations. Ils peuvent lire le parc immobilier, créer des contacts et séjours affectés à eux-mêmes ; ils ne peuvent pas créer des biens. Les montants des listes sont réservés aux responsables et administrateurs ; le prix convenu est demandé pour saisir une réservation.
- Tableau de bord avec nombres réels de clients, prospects, biens, séjours confirmés à venir/en cours, arrivées et départs du jour, calculés à Dakar.
- Création de contacts, recherche, étapes commerciales, notes et détection de doublons par téléphone exact ou e-mail insensible à la casse.
- Création d’appartements : référence, nom, quartier, catégorie, chambres, tarif XOF entier, état.
- Création et annulation de réservations : client, bien, dates, voyageurs, prix convenu, source et statut. Montant calculé depuis le nombre de nuits ; ce montant n’est pas une recette encaissée.
- Interdiction des chevauchements confirmés directement dans PostgreSQL, y compris lors de demandes concurrentes. Départ et arrivée le même jour autorisés.
- Journal des créations, connexions et annulations conservé dans la base.

## Ce qui reste à développer

Modification des contacts/biens/séjours, réaffectation, réinitialisation des mots de passe, calendrier graphique, normalisation des téléphones, pagination complète, champs avancés (propriétaires, équipements, WhatsApp…), interface du journal, finances, commissions, factures/PDF, paiements, imports CSV/XLSX, exports et sauvegardes automatisées. Les listes sont limitées à 200 entrées ; ce n’est pas une version métier complète.

L’administrateur peut créer et désactiver les comptes dans « Équipe & accès ». La désactivation révoque les sessions. Aucune donnée ou identité de propriétaire n’est inventée. Seuls les tests utilisent des exemples fictifs.

## Développement et vérification

Node.js 22 ou supérieur, sans Python et sans Docker.

```sh
npm ci
npm test
npm run build
npm run test:web
```

Pour démarrer localement : copiez `.env.example` vers `.env.local`, fournissez votre connexion PostgreSQL et votre code d’installation privé, puis `npm run dev`. Ouvrez `http://127.0.0.1:3000/installation` sur la même machine. En production, `npm run build` puis `npm start` ; ce serveur local écoute uniquement sur localhost. Vercel gère son propre démarrage HTTPS.

Autre initialisation en console : `npm run db:init`, puis `npm run admin:create` (mot de passe masqué). Les scripts utilisent `.env.local`. L’initialisation conserve les données. Les tests exécutent un moteur PostgreSQL embarqué PGlite avec l’extension btree_gist, isolé et sans secret externe. `npm run test:web` compile puis lance un vrai serveur Next.js et vérifie les formulaires par HTTP : première installation, connexion, création de compte et de données, doublons, chevauchements, annulation et restriction des accès employés. Le serveur PostgreSQL de test est limité à localhost et n’est jamais utilisé en production.

Next.js contrôle l’origine des Server Actions, les mutations utilisent POST, les sessions sont opaques et stockées sous forme de hash en base, les cookies sont HttpOnly/SameSite et Secure en production. Les requêtes sont paramétrées. Ne désactivez pas TLS. La limitation par adresse IP, l’authentification multifacteur et une revue de sécurité complète restent à faire avant des données réelles.

Pour une sauvegarde réelle, utilisez les exports PostgreSQL (`pg_dump`) et/ou les sauvegardes du fournisseur ; vérifiez la restauration sur une base séparée. La sauvegarde SQLite de l’ancienne version ne couvre pas cette base. Un guide opérationnel validé et des sauvegardes automatiques restent à livrer.

## Test manuel conseillé

Avec uniquement des données fictives : connectez-vous, créez un client, un appartement avec un tarif choisi par vous, puis un séjour confirmé. Essayez un deuxième séjour qui chevauche le premier : il doit être refusé. Essayez un séjour commençant le jour du départ : il doit être accepté. Annulez un séjour, vérifiez la baisse du compteur, déconnectez-vous puis reconnectez-vous pour constater la conservation des données.


## Connexion Supabase sur Vercel

Sur Vercel, le CRM utilise en priorité `POSTGRES_URL`, fourni et maintenu par l’intégration Supabase. `DATABASE_URL` reste le réglage principal en local et le secours si aucune intégration n’est configurée. Ne recopiez pas manuellement les secrets de l’intégration.

Le certificat public Supabase Root 2021 CA est fourni dans `lib/certs/supabase-ca.mjs`, depuis https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt (expiration : 26 avril 2031). La vérification du certificat et du nom de serveur reste active.

`node scripts/check-db.mjs` vérifie la connexion et répète la création du schéma dans une transaction annulée, sans créer de compte ni conserver de données. Les tables du CRM ont RLS activé et ne sont pas accessibles aux rôles publics `anon` et `authenticated` : les droits métier sont contrôlés par le serveur. Les erreurs d’installation journalisent uniquement un code technique, jamais les secrets.

Après un déploiement, rechargez la page avant de soumettre un formulaire resté ouvert sur l’ancienne version.
