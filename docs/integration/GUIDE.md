# Connecter Hermes à FABI — accès autonome et demandes WhatsApp

Hermes utilise sa clé privée dédiée, indépendante du mot de passe et du navigateur personnel de l’administrateur. L’accès peut être **sans expiration, jusqu’à révocation**, avec un navigateur Hermes autonome sans limite de 10 minutes. Les outils API peuvent aussi ajouter des réservations et dépenses après préparation et confirmation dans sa conversation. Le branchement WhatsApp est géré par votre installation Hermes ; aucun compte WhatsApp, fournisseur ou envoi payant n’est créé par FABI.

## Ce qui reste à faire avant utilisation réelle

Cette mise à jour doit être publiée avant de configurer les nouveaux droits. Aucune clé ni permission n’est créée automatiquement en production. `FABI_INTEGRATION_ENABLED=false` bloque toutes les requêtes et sessions techniques ; `FABI_INTEGRATION_WRITES_ENABLED=false` bloque uniquement les outils d’ajout par API. L’absence de ce second réglage laisse agir seulement les clés auxquelles les permissions d’ajout ont été explicitement accordées. Il ne désactive pas les modifications par navigateur autonome : pour couper tout accès, révoquez la clé ou désactivez l’intégration entière.

## Connexion simple après publication autorisée

1. Sur la machine Hermes, récupérer le code FABI et utiliser Node.js 22 ou plus récent.
2. **Si Hermes possède déjà sa clé, conservez-la et passez à l’étape 3.** Seulement pour une toute première connexion sans clé existante :

   ```powershell
   node scripts/hermes-key.mjs "C:\Users\VOTRE_NOM\.fabi\hermes.key"
   ```

   Le terminal affiche uniquement l’**empreinte SHA-256**, pas la clé privée. Un fichier existant n’est ni remplacé ni supprimé. Sur Windows, conserver ce fichier dans votre profil personnel et restreindre ses autorisations à votre compte Windows. Le fichier est créé en mode 0600 sur les systèmes qui prennent en charge les permissions Unix.

3. Dans FABI, connecté personnellement comme administrateur, ouvrir **Accès Hermes**. Pour un accès existant, utiliser **Accès enregistrés → Modifier les autorisations**, sans ressaisir l’empreinte ni recréer la clé. Choisir **Sans expiration, jusqu’à révocation**, les informations autorisées, les droits d’ajout et **Accès autonome au CRM sur vos instructions, sans limite de 10 minutes**. L’accès autonome concerne tous les appartements. Valider une fois. Les permissions existantes ne changent pas lors du déploiement.
4. Sur la machine Hermes, adapter `integration/hermes/config.example.yaml` dans le profil Hermes : indiquer le chemin absolu du script MCP et celui du fichier privé. Ne jamais copier la clé dans ce YAML ni dans le chat.
5. Recharger les outils MCP Hermes et lui transmettre [les instructions d’utilisation](../../integration/hermes/INSTRUCTIONS.md), notamment la vérification de votre numéro WhatsApp. Commencer par « Consulte les appartements FABI avec `fabi_properties`. Ne modifie rien. » Une réponse authentifiée réussie confirme la consultation. La connexion WhatsApp et les enregistrements se vérifient ensuite séparément avec des exemples fictifs approuvés.

Les opérations ne nécessitent pas de mot de passe administrateur dans Hermes, ni de connexion Supabase pour Hermes. Le propriétaire ne dispose pas de cet écran ; les responsables et employés ne peuvent pas accorder ou révoquer un accès technique.

## Élargir un accès déjà enregistré sans refaire la clé

Le créateur de l’accès peut modifier les permissions, les appartements et la durée, puis cliquer sur **Enregistrer les autorisations**. L’enregistrement conserve la clé privée existante, ferme les anciennes sessions techniques et expire les préparations en cours. Avec le droit autonome, Hermes peut se reconnecter lui-même depuis sa machine ; aucun nouveau clic de confirmation dans FABI n’est requis pour cette connexion. Un accès révoqué ne peut pas être réactivé de cette façon.

L’accès autonome autorise les fonctions métier du CRM : consulter et utiliser les formulaires existants, sous les contrôles serveur habituels. La gestion des comptes et des autorisations techniques reste réservée à la connexion personnelle de l’administrateur. Votre accord par message est recueilli par Hermes : le CRM authentifie le connecteur, pas l’expéditeur WhatsApp. La restriction aux demandes du propriétaire dépend donc de la configuration et des instructions de votre agent, pas d’une preuve WhatsApp vérifiée par FABI. Une fois une session autonome ouverte, le serveur ne valide pas séparément votre accord pour chaque formulaire. Un simple champ `confirmed:true` ne doit pas être présenté comme une vérification indépendante de votre identité.

## Ce que l’accès permet

- `GET /api/integration/properties` : appartements autorisés, sans identités de propriétaires ni coordonnées clients.
- `GET /api/integration/reservations?from=2026-11-01&to=2026-12-01` : séjours sur une période (début inclus, fin exclue), sans coordonnées ni notes privées.
- `GET /api/integration/availability?property_id=1&arrival=2026-11-01&departure=2026-11-04` : disponibilité à l’instant de consultation. Ne crée aucune réservation.
- `GET /api/integration/report?year=2026&month=11` : chiffres enregistrés, recettes, dépenses et commissions distinguées. Aucun bénéfice FABI n’est assimilé au solde des appartements. Les informations non implémentées restent `null`, pas zéro inventé. Les champs relatifs aux encaissements se limitent aux recettes explicitement marquées encaissées.
- `POST /api/integration/reservations/prepare` : prépare les dates, voyageurs, appartement, nom, source, statut et prix fourni. Aucun faux client ni encaissement n’est créé. Un prix inconnu reste `null`.
- `POST /api/integration/expenses/prepare` : prépare une dépense avec date exacte, catégorie, description et montant entier. Le nom de l’intervenant est obligatoire pour les prestations et les employés. La dépense sera marquée payée.
- `POST /api/integration/operations/execute` : enregistre la préparation indiquée par `operation_id`, avec `confirmed:true`. Le contenu préparé ne peut pas être modifié lors de cette étape. Un nouvel essai avec le même identifiant retourne le résultat initial, sans nouvel enregistrement. La préparation expire après 15 minutes ; cette durée protège la validité du récapitulatif et n’expire pas l’accès personnel d’Hermes.

Chaque requête utilise `Authorization: Bearer CLE_PRIVEE`, fourni uniquement par le pont MCP côté machine Hermes. Le serveur refuse les permissions absentes et les appartements non autorisés. Les ajouts sont tracés dans le journal et utilisent les notifications existantes ; aucune notification financière n’est envoyée aux employés. Aucun outil d’édition ou suppression des écritures financières existantes n’est ajouté par API.

## Navigateur Hermes autonome, sans votre session personnelle

Avec `dashboard:direct`, Hermes appelle `fabi_open_dashboard` avec `task` et `confirmed:true`, après votre accord sur son canal. Le fichier privé de session navigateur est créé sur sa machine. Il le charge dans son propre navigateur et le conserve pour les prochaines demandes. La session côté serveur et la clé sans expiration restent valides jusqu’à révocation ou désactivation du compte créateur. La perte du navigateur local n’impose pas de revenir sur votre ordinateur : Hermes peut recréer sa session avec sa clé. Une nouvelle ouverture remplace l’ancienne session autonome de cette clé. Le fichier ne doit jamais être envoyé dans le chat ni ajouté à GitHub.

Les autres permissions ne sont pas implicitement accordées par `dashboard:direct` aux outils API : cochez aussi les permissions de consultation et d’ajout souhaitées.

## Ancien mode court, conservé pour les accès existants

Le mode `dashboard:admin` garde sa validation personnelle dans FABI et ses sessions courtes. Il n’est pas nécessaire au mode autonome. Son fonctionnement reste :

1. Hermes appelle `fabi_request_dashboard` en décrivant la tâche précise.
2. Vous ouvrez **Accès Hermes** depuis votre connexion personnelle et confirmez la tâche.
3. Hermes appelle `fabi_open_dashboard` avec l’identifiant de demande : un fichier privé de session navigateur est créé sur sa machine. Aucun cookie n’est affiché dans la conversation.
4. La session utilise les permissions administrateur métier pendant au maximum **10 minutes**. L’autorisation attendue expire après 15 minutes si elle n’est pas utilisée, et n’est utilisable qu’une fois.
5. Hermes doit demander confirmation avant chaque autre modification. Cette règle de dialogue complète l’autorisation technique : la session de 10 minutes n’impose pas une restriction à un seul formulaire ou à une seule action. Les pages du dashboard gardent leurs effets de bord existants ; les consultations pures doivent passer par l’API.

Les sessions techniques ne peuvent ni approuver leurs propres demandes, ni créer/désactiver des comptes ou changer les autorisations techniques. Ces contrôles restent réservés à votre connexion personnelle pour empêcher l’assistant de rendre ses droits permanents. Les mutations métier sont tracées avec l’identifiant d’intégration dans l’audit.

## Révocation, expiration et rotation

Dans **Accès Hermes**, « Révoquer l’accès » bloque immédiatement les prochaines requêtes et supprime les sessions dashboard liées, sans fermer votre session personnelle. Un accès expiré ou créé par un compte administrateur ensuite désactivé est également refusé. Pour une rotation, générer un **nouveau fichier** privé, enregistrer sa nouvelle empreinte dans FABI, tester ce nouvel accès, puis révoquer l’ancien. Ne pas écraser une clé avant d’avoir vérifié sa remplaçante.

La base ne conserve que le hash SHA-256 d’une clé aléatoire de 256 bits. Ni l’API ni le navigateur ne retournent la clé. L’empreinte publique n’est pas acceptée comme clé Bearer. La révocation ne déconnecte pas les sessions personnelles du dashboard.

## Consultation sans effets métier

Les routes API GET ne rendent pas le layout du dashboard et n’appellent ni génération Wi-Fi, ni rappels, ni envoi de messages, ni nettoyage des conversations. Seul un journal technique (identifiant d’accès, route constante, résultat, heure) est ajouté. Aucun secret, corps de requête, numéro, contenu de message ou URL complète n’y est enregistré. Les préparations privées conservent leurs données métier dans une table protégée. Les écritures exécutées créent le journal et les notifications autorisées. Limite : 120 requêtes/minute par accès ; pas de garantie d’un anti-DDoS complet. Les pages métier du navigateur conservent leurs effets automatiques existants.

## Vérifications et limites du diagnostic

- Le build utilise maintenant une migration limitée aux tables et colonnes d’accès Hermes. Il n’exécute plus les anciennes fusions d’appartements ou suppressions de loyers du script historique. Les tests de compilation se font malgré tout avec `build:isolated`, sans connexion de production.
- Tests : `npm test`, `npm run build:isolated`, puis `npm run test:integration`, `node --test tests/web.integration.mjs` et `node --test tests/ui.integration.mjs`. Toutes les bases de tests sont isolées et fictives.
- `build:isolated` évite le hook de migration et vide les paramètres DB/messagerie hérités pour la compilation.
- L’installation Hermes sur votre ordinateur n’a pas été inspectée. La configuration MCP est fournie en exemple, à valider avec cette installation.
- L’API GitHub utilisée pour ouvrir une pull request est bloquée dans cet environnement. Les changements sont conservés dans la branche dédiée et publiés uniquement après validation de la mise en ligne. Le statut réel du déploiement Vercel doit être vérifié séparément du push GitHub.
- Aucun test réel de Vercel, Supabase ou Meta n’est affirmé. La lecture du dépôt officiel Hermes n’est pas une connexion à votre compte.
- Le fondateur indique que WhatsApp est relié à Hermes. La passerelle, la vérification du numéro autorisé et l’exécution depuis son téléphone doivent encore être vérifiées sur sa machine. Aucun message WhatsApp réel ni écriture de production n’est utilisé pour les tests de développement.

## Import de session dans un navigateur Hermes local

La configuration d’exemple indique `FABI_HERMES_BROWSER_STATE_FILE`, un fichier privé sur la même machine que le navigateur. Le format est le `storageState` standard de Playwright. Le fichier contient un cookie HttpOnly sensible : **ne pas afficher son contenu dans le chat**. Le navigateur doit l’importer directement.

Le code officiel Hermes inspecté au commit `b02fa681328bae7071412677d76448ff46582f68` possède un navigateur local avec un helper Python `cdp`. Sa version installée chez vous reste à vérifier. Si cette interface est disponible, le principe d’import local est :

```python
import json
with open(r"C:\CHEMIN_PRIVE\fabi-state.json", encoding="utf-8") as f:
    state = json.load(f)
cdp("Storage.setCookies", cookies=state["cookies"])
new_tab("https://fabi-v1.vercel.app")
print(page_info())
```

Ne pas imprimer `state` ou les cookies. Si votre navigateur Hermes ne prend pas en charge cet import local, l’accès API reste utilisable et le branchement navigateur doit être adapté sans communiquer les secrets. Aucun navigateur cloud payant n’est requis ou activé ici.
