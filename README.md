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

Finances conserve le bilan, les recettes et les commissions FABI. Les rubriques Dépenses et Employés / passages sont accessibles séparément, en bas du menu de gauche, avec un appartement facultatif. Chaque passage indique le service (Ménage, Vérification ou Autre service), le nom de l’intervenant, la quantité et le prix unitaire librement saisi. Il crée une seule dépense. Les anciens montants de ménage restent conservés. Le récapitulatif groupe les passages par mois, appartement, intervenant et service. Marquer payé met à jour le statut sans créer de nouvelle dépense. Le résultat global compte les dépenses dues ; il ne représente pas la trésorerie encaissée. Les agrégats historiques « ménage et achats » ne sont pas transformés en passages.

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


## Messages internes, destinataires et conservation

Tous les comptes actifs (administrateurs, responsables et employés) peuvent écrire à un collaborateur, cocher plusieurs destinataires ou choisir « Tous les collaborateurs actifs ». Un envoi collectif crée une copie par destinataire et des discussions séparées ; les réponses ne sont pas envoyées automatiquement à tout le groupe. L’auteur ne se reçoit pas son propre message et les comptes désactivés sont exclus. Un destinataire individuel devenu inactif fait échouer toute la saisie plutôt que produire un envoi partiel.

Les administrateurs et responsables disposent d’une rubrique **« Suivi des employés »** qui ouvre la discussion complète entre un employé (par exemple Mbagnick) et son interlocuteur. Elle montre les messages dans les deux sens, y compris les réponses administrateur/responsable et l’historique encore conservé. Les anciennes copies fragmentées de suivi restent en base mais ne sont plus présentées comme des conversations réelles.

Un employé ne peut consulter que ses propres discussions. Les échanges entre administrateurs et responsables restent réservés à leurs participants. Les propriétaires ne participent pas au suivi des employés et ne peuvent échanger qu’avec les administrateurs. Le formulaire indique explicitement ces règles. Elles sont vérifiées côté serveur, y compris pour une URL de conversation forgée.

Chaque nouveau message dans une discussion impliquant un employé notifie les administrateurs et responsables actifs, dans les deux sens. La notification de suivi possède son propre état de lecture : consulter le suivi ne marque pas le message comme lu par son destinataire. Aucun e-mail n’est envoyé pour l’ancien historique. Les comptes participant directement au message reçoivent leur notification normale, sans notification de suivi supplémentaire pour ce même message. Les réponses à une diffusion collective restent des conversations individuelles.

Les copies de destinataires d’un envoi collectif sont enregistrées dans une seule transaction, avec une clé empêchant les doubles validations. La notification Gmail ne reprend pas le contenu du message et renvoie vers une page exigeant une connexion et les droits appropriés. « Transmis » signifie accepté par SMTP, pas une preuve de réception en boîte de réception.

Les notifications sont traitées après la réponse HTTP par lots bornés (20 par traitement), avec une reprise par la tâche quotidienne existante. Trois échecs au maximum sont tentés ; une absence de configuration Gmail ne consomme pas une tentative. Un compte désactivé n’est plus notifié. Un résultat SMTP incertain reste « sending » sans réémission automatique. Les messages restent disponibles dans le CRM même si Gmail échoue. Les messages anciens restent accessibles par « Voir les messages précédents ».

Une discussion complète est supprimée lorsque son dernier message date de 7 jours ou plus, dans les deux sens. Un nouveau message avant expiration relance le délai pour tout l’historique. Lire un message ou réessayer une notification ne relance pas le délai. Le nettoyage s’effectue à l’ouverture de Messages, avant l’envoi, et dans la tâche quotidienne existante à 04 h UTC, même sans visite. Les suppressions et les envois sont sérialisés pour éviter une course au moment de l’expiration. Le nettoyage porte uniquement sur les messages du CRM, sans supprimer les e-mails déjà reçus ni modifier les clients, séjours ou finances.

## Notifications d’activité à toute l’équipe

Les actions métier disponibles dans le CRM (contacts, appartements, réservations, finances, comptes et connexions de calendriers) notifient les collaborateurs actifs, y compris l’auteur. Les actions financières notifient uniquement les administrateurs et responsables, jamais les employés. Les propriétaires ne reçoivent aucune notification générale d’activité. Les anciennes notifications financières encore en attente pour un employé sont ignorées au moment de l’envoi ; un e-mail déjà envoyé ne peut pas être retiré. Chaque e-mail indique l’auteur et la nature du changement, avec un lien soumis aux droits habituels. Les coordonnées des clients, montants, mots de passe, liens iCal privés et contenu des messages ne sont pas inclus. Les connexions utilisateur ne sont pas diffusées à l’équipe. Les messages internes suivent uniquement leurs destinataires et la règle de suivi des discussions employés décrite ci-dessus, sans notification d’activité supplémentaire.

Les notifications sont mises en attente dans la transaction de la modification puis envoyées après la réponse HTTP via Gmail. Une opération annulée par erreur ou un doublon de saisie ne produit pas de nouvelle notification. Une synchronisation de calendrier ne notifie que si les séjours ont effectivement changé. Le traitement utilise une prise en charge atomique par destinataire, des tentatives limitées à trois et une reprise par la tâche quotidienne existante. Si Gmail est absent ou indisponible, l’action métier reste enregistrée. Un succès SMTP incertain n’est pas relancé automatiquement. Les métadonnées de notification sont nettoyées après sept jours. Les e-mails déjà livrés restent dans les boîtes des destinataires.


## Espace propriétaire

Dans **Équipe & accès**, un administrateur peut créer un compte au rôle **Propriétaire**, avec un mot de passe individuel et un appartement obligatoire. Aucun compte ni propriétaire fictif n’est créé en production par les tests ou les migrations.

Après connexion, le propriétaire arrive sur `/proprietaire`. Il consulte uniquement les informations de l’appartement attribué, ses recettes, dépenses et loyers enregistrés, avec un filtre annuel, ainsi que son calendrier en lecture seule. Les noms et coordonnées des clients, les autres biens, les commissions FABI, les fichiers sources, avertissements d’import et notes internes ne sont pas fournis à cette page. Le solde d’exploitation n’est pas présenté comme un bénéfice de FABI ni comme une somme automatiquement due au propriétaire.

Le bien est déterminé par le compte authentifié dans chaque requête, jamais par un identifiant donné dans l’URL ou un formulaire. Les routes du CRM interne redirigent le propriétaire vers son espace ; leurs mutations sont refusées côté serveur. Un compte désactivé perd immédiatement ses accès. La base impose qu’un compte propriétaire soit rattaché à un appartement existant.

La messagerie du propriétaire propose seulement les administrateurs. Les employés et responsables ne peuvent pas envoyer à un propriétaire, même en forgeant une requête. Les comptes propriétaires sont exclus des notifications générales ; seules leurs notifications de messages adressés par un administrateur sont prévues. La réaffectation d’un appartement ou l’ajout de plusieurs appartements par propriétaire ne disposent pas encore d’interface dédiée.

La carte « À venir · FABI » est retirée de l’aperçu général. Le prévisionnel des appartements reste disponible.


## Navigation des conversations et historique financier

L’ouverture d’une conversation place la discussion à l’écran et montre les derniers messages, sans déployer le formulaire « Nouveau message ». Celui-ci et les règles de confidentialité sont repliés par défaut. Un rafraîchissement automatique conserve la position de lecture ; les nouveaux messages ne font défiler l’historique que si l’utilisateur était déjà près de sa fin. Les liens de suivi, retours après envoi et pagination ciblent la conversation.

Les pages `/depenses` et `/passages` lisent et modifient le registre `finance_entries` existant : aucun transfert ni copie de données n’est effectué. Dépenses présente les dépenses générales et les loyers ; Employés / passages présente les prestations identifiées comme passages. Les anciens passages de ménage dont le prix unitaire est connu sont identifiés sans modifier leur montant. Les achats et agrégats historiques restent des dépenses générales. L’ancienne adresse `/menage` redirige vers `/passages`. Les deux restent comptés une seule fois dans les charges du bilan, du tableau de bord et des vues propriétaire. Les anciennes adresses `/finances?onglet=depenses` et `/finances?onglet=menage` redirigent vers la rubrique correspondante avec les filtres conservés.

Les historiques sont présentés en cartes groupées par période comptable, avec une date, une description, un appartement, un montant et un statut. « Détails de l’opération » révèle les commentaires, intervenants, dates originales et références de source. Une ligne historique sans jour précis reste mensuelle : aucun premier du mois n’est inventé. « Marquer payé » modifie le statut de la même écriture, sans ajouter de dépense, et conserve la rubrique et les filtres actifs.

L’administrateur peut saisir et régler les dépenses et passages des employés. Les responsables disposent d’une consultation seule ; employés et propriétaires n’accèdent pas à ces registres généraux. L’espace propriétaire conserve uniquement les finances de son appartement.

Vérification visuelle automatisée : `npm run test:ui` compile puis utilise Chromium, PostgreSQL embarqué et des comptes fictifs pour vérifier le défilement, les cartes, les filtres, les paiements sans doublons et l’affichage mobile. Le test nécessite Chromium installé ; `CHROMIUM_PATH` peut indiquer son exécutable (par défaut `/usr/bin/chromium`). Aucun navigateur n’est requis pour héberger le site sur Vercel. Les captures de test restent dans `/tmp`, hors du dépôt.

## Clients et partenaires

La rubrique est placée tout en bas du menu. À la création, choisissez Client, Propriétaire ou Partenaire — apporteur de clients. La recherche peut être filtrée par type ; les étapes commerciales concernent les clients. Les anciens contacts sont conservés avec le type Client. Les réservations proposent uniquement les contacts de type Client.

Une fiche Propriétaire ne crée pas de compte de connexion : les accès au portail propriétaire se gèrent séparément dans Équipe & accès. Une fiche Partenaire ne génère pas de commission automatique. Les droits et restrictions des employés sur leurs contacts restent appliqués.
