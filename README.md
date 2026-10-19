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

Modification des contacts/biens, réaffectation, réinitialisation des mots de passe, calendrier graphique, normalisation des téléphones, pagination complète, champs avancés (propriétaires, équipements, WhatsApp…), interface du journal, factures/PDF, paiements, imports CSV/XLSX en libre-service, exports et sauvegardes automatisées. Les listes sont limitées à 200 entrées ; ce n’est pas une version métier complète.

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

## Finances et import FABI

La page `/finances` est réservée aux administrateurs et responsables. Les écritures sont séparées en recettes, dépenses hors loyers, commissions de FABI Conciergerie et loyers. Le solde d’exploitation correspond uniquement aux recettes moins les dépenses hors loyers. Les loyers mensuels contractuels sont conservés dans `property_monthly_rents` : ils ne créent pas de paiement ou de dépense.

`lib/finance-schema.mjs` complète le schéma de façon additive. Les trois tables financières ont RLS activé et leurs droits publics sont révoqués. Un import conserve la source dans la base privée, avec une empreinte unique du fichier et une unicité par feuille/ligne/type pour éviter les doublons. Aucun document financier ni ses écritures ne doivent être ajoutés au dépôt GitHub public. Les données sont importées via une connexion administrateur autorisée, sans route publique d’import.

Les biens importés dont les chambres et le tarif sont inconnus gardent des valeurs NULL et restent inactifs jusqu’à complétion. Les dates originales, les mois du bilan, les commentaires et les incohérences sont conservés. Les totaux et synthèses du classeur ne sont pas transformés en recettes ou dépenses supplémentaires.

## Réservations et opérations quotidiennes

Une réservation peut être créée sans fiche client ni appartement : nom libre, agent, source Airbnb/Booking/Agent et appartement libre sont facultatifs. Aucun faux contact n’est créé. Les dates, voyageurs et prix restent contrôlés. La contrainte de chevauchement s’applique aux appartements liés ; un séjour sans bien ne bloque pas le calendrier.

Dans Finances & loyers, les onglets Commissions FABI, Dépenses et Ménage permettent la saisie par activité avec appartement facultatif. Chaque passage de ménage vaut 5 000 FCFA et crée une seule dépense. Le récapitulatif groupe les passages par mois, appartement et ménagère. Marquer payé met à jour le statut sans créer de nouvelle dépense. Le résultat global compte les dépenses dues ; il ne représente pas la trésorerie encaissée. Les agrégats historiques « ménage et achats » ne sont pas transformés en passages.

Le build exécute `scripts/migrate-db.mjs` avant compilation : la migration additive et idempotente utilise la même connexion que le déploiement, sans document financier dans le dépôt. Sans configuration de base, le build local ignore cette étape.

## Tableau de bord et parc FABI

Le tableau de bord affiche les appartements disponibles, les séjours confirmés et les mouvements du jour. Les responsables voient un histogramme interactif des commissions FABI par mois et activité, filtrable par année. Les recettes locatives ne sont pas ajoutées aux commissions. Les employés ne reçoivent pas les données financières du graphique.

La correction ponctuelle du parc du 15 octobre 2026 fusionne les fiches OCÉAN, conserve leurs réservations, écritures et loyers et conserve un état antérieur dans le journal. Les deux appartements deviennent des F2 disponibles à 40 000 FCFA par nuit : OCÉAN à Cité Biagui et ÉCRIN aux Mamelles. Les prix des séjours déjà enregistrés restent inchangés. Une trace dans `app_migrations` évite de réappliquer cette correction lors des déploiements suivants. Si des réservations confirmées se chevauchent ou si des loyers contractuels se contredisent entre doublons, la transaction est annulée pour préserver les données.

Les boutons FABI / OCÉAN / ÉCRIN du tableau de bord changent l’histogramme et les indicateurs. Les vues appartement lisent les recettes, dépenses et loyers déjà présents dans `finance_entries`, reliés au bien ; aucune nouvelle écriture ni copie de montants n’est créée. FABI regroupe les commissions, et déduit pour son résultat les charges sans appartement. Les résultats incluent les charges à payer et ne constituent pas un solde de trésorerie.

## Calendriers Airbnb et Booking

Dans Réservations, la liste apparaît avant l’ajout manuel. Les responsables disposent ensuite de la section Calendriers : choisir le bien, la plateforme et coller son lien HTTPS d’export iCal officiel. Un seul lien par bien et plateforme ; le lien reste masqué dans la liste. Enregistrer un lien lance un import, et « Synchroniser maintenant » force une nouvelle lecture. La déconnexion conserve les séjours déjà importés.

`vercel.json` planifie une synchronisation quotidienne vers 04 h UTC (fenêtre d’exécution selon le plan Vercel). Le secret de production `CRON_SECRET`, géré uniquement dans Vercel, protège `/api/calendars/sync`. La tâche traite jusqu’à dix connexions par passage ; FABI dispose actuellement de deux biens et jusqu’à quatre connexions Airbnb/Booking. Ce n’est pas une synchronisation en temps réel et les calendriers des plateformes peuvent être retardés.

Les dates de départ iCal sont exclusives. Les identifiants UID évitent les doublons ; les dates sont mises à jour et les événements futurs retirés d’un flux complet sont annulés dans FABI. Les plages indisponibles sont distinguées des séjours et ne gonflent pas les compteurs de réservations. En cas de chevauchement, le nouvel événement reste en attente avec une alerte ; aucune réservation manuelle n’est écrasée. Les imports sont transactionnels et un flux illisible ne déclenche pas d’annulation. Les liens, redirections et tailles des réponses sont contrôlés. Les erreurs et les journaux ne révèlent pas les liens privés.

Les flux Airbnb/Booking à la journée sont pris en charge. Les récurrences et événements horaires sont refusés explicitement. Les calendriers ne fournissent pas les tarifs, voyageurs ni coordonnées complètes : ces champs restent inconnus. Aucun paiement ni recette n’est créé à partir d’un import. Les modifications faites dans FABI ne sont pas réexportées vers les plateformes ; les dates d’un séjour importé peuvent aussi être ajustées localement avec un indicateur et un bouton pour reprendre les dates du calendrier.

La correction ponctuelle `remove_unwanted_imported_rent_20261015` supprime l’écriture importée ciblée par l’administrateur ainsi que sa mention dans les contrôles et l’instantané de l’import. Les autres écritures, y compris les futures saisies de loyers, restent conservées. Les finances proposent un filtre par appartement ou FABI ; les recettes et les charges ne sont pas dupliquées pour ces vues.

## Calendrier visuel, édition et prévisionnel

La page Réservations commence par un calendrier à deux mois, avec une vue annuelle et un sélecteur d’appartement. Les séjours apparaissent en noir : trait rose Airbnb, bleu Booking et blanc pour les saisies CRM. Les séjours en attente sont en pointillé, les indisponibilités distinguées, et les départs restent exclusifs. Le calendrier respecte les droits de lecture des employés et ne leur transmet pas les tarifs des biens.

Le bouton Modifier (ou un clic sur la barre) permet de changer les dates et le prix par nuit ou total du séjour. Les séjours manuels peuvent changer de bien et de statut. Les prix saisis ne sont pas écrasés par iCal. Un changement local des dates d’un séjour importé active une exception explicite ; la synchronisation continue à suivre les dates d’origine et les annulations, tout en conservant l’exception locale. Le bouton de reprise restaure les dates d’origine sous contrôle des chevauchements.

Le graphique garde les recettes du registre en plein et affiche les nuits à venir tarifées en clair. Le prix convenu est réparti sur les nuits au FCFA près, y compris entre deux années. Le prévisionnel ne crée pas de recette comptable et n’est pas présenté comme un encaissement. Pour un appartement, il utilise les prix du séjour ; pour FABI, la commission prévue explicitement saisie par le responsable. Les montants inconnus restent à compléter. Les annulations, séjours en attente et plages indisponibles sont exclus. Le compteur du parc reste limité à la vue FABI.

Les blocages iCal Airbnb/Booking sont indicatifs et restent visibles : ils n’empêchent pas une réservation manuelle FABI. Seuls les vrais séjours confirmés empêchent les chevauchements. Cette saisie ne modifie pas le calendrier sur la plateforme.


## Discussions privées et conservation

Messages regroupe les échanges par collaborateur, dans l’ordre chronologique. L’administrateur peut écrire à chaque collaborateur ; les employés et responsables peuvent écrire à un administrateur et lui répondre. Seuls les deux participants peuvent lire leur discussion. Les notifications Gmail et leurs reprises fonctionnent dans les deux sens. Les messages anciens restent accessibles par « Voir les messages précédents ».

Une discussion complète est supprimée lorsque son dernier message date de 7 jours ou plus, dans les deux sens. Un nouveau message avant expiration relance le délai pour tout l’historique. Lire un message ou réessayer une notification ne relance pas le délai. Le nettoyage s’effectue à l’ouverture de Messages, avant l’envoi, et dans la tâche quotidienne existante à 04 h UTC, même sans visite. Les suppressions et les envois sont sérialisés pour éviter une course au moment de l’expiration. Le nettoyage porte uniquement sur les messages du CRM, sans supprimer les e-mails déjà reçus ni modifier les clients, séjours ou finances.

## Notifications d’activité à toute l’équipe

Les actions métier disponibles dans le CRM (contacts, appartements, réservations, finances, comptes et connexions de calendriers) enregistrent une notification par compte actif, y compris l’auteur. Chaque e-mail indique l’auteur et la nature du changement, avec un lien soumis aux droits habituels. Les coordonnées des clients, montants, mots de passe, liens iCal privés et contenu des messages ne sont pas inclus. Les connexions utilisateur et messages privés ne sont pas diffusés à l’équipe ; les messages privés gardent leur notification au seul destinataire.

Les notifications sont mises en attente dans la transaction de la modification puis envoyées après la réponse HTTP via Gmail. Une opération annulée par erreur ou un doublon de saisie ne produit pas de nouvelle notification. Une synchronisation de calendrier ne notifie que si les séjours ont effectivement changé. Le traitement utilise une prise en charge atomique par destinataire, des tentatives limitées à trois et une reprise par la tâche quotidienne existante. Si Gmail est absent ou indisponible, l’action métier reste enregistrée. Un succès SMTP incertain n’est pas relancé automatiquement. Les métadonnées de notification sont nettoyées après sept jours. Les e-mails déjà livrés restent dans les boîtes des destinataires.
