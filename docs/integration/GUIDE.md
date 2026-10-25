# Connecter Hermes à FABI — première étape uniquement

Cette branche prépare un accès technique avec **consultation API et fonctions administrateur du dashboard après confirmation personnelle**. Elle ne connecte ni WhatsApp, ni des actions automatiques. Elle ne crée pas de compte fictif et ne touche pas la session personnelle de l’administrateur.

## Ce qui reste à faire avant utilisation réelle

Le code doit être publié avec votre validation, et `FABI_INTEGRATION_ENABLED=true` doit être ajouté côté serveur. Cette préparation n’a pas été déployée. Aucun accès réel à Vercel/Supabase n’était disponible pendant le développement ; aucune clé de production n’a été créée. Le diagnostic n’a ouvert aucune page métier de production, car ces pages peuvent générer du Wi-Fi, des rappels ou nettoyer des messages.

## Connexion simple après publication autorisée

1. Sur la machine Hermes, récupérer le code FABI et utiliser Node.js 22 ou plus récent.
2. Demander à Hermes de générer son fichier privé avec :

   ```powershell
   node scripts/hermes-key.mjs "C:\Users\VOTRE_NOM\.fabi\hermes.key"
   ```

   Le terminal affiche uniquement l’**empreinte SHA-256**, pas la clé privée. Un fichier existant n’est ni remplacé ni supprimé. Sur Windows, conserver ce fichier dans votre profil personnel et restreindre ses autorisations à votre compte Windows. Le fichier est créé en mode 0600 sur les systèmes qui prennent en charge les permissions Unix.

3. Dans FABI, connecté comme administrateur, ouvrir **Accès Hermes**. Copier l’empreinte, choisir les informations autorisées, les appartements et l’expiration. Toutes les permissions sont cochées, conformément à votre demande ; vous pouvez les restreindre. Un accès administrateur au dashboard concerne tous les appartements, donc cette permission ne peut pas être combinée à un périmètre limité à quelques appartements. Valider.
4. Sur la machine Hermes, adapter `integration/hermes/config.example.yaml` dans le profil Hermes : indiquer le chemin absolu du script MCP et celui du fichier privé. Ne jamais copier la clé dans ce YAML ni dans le chat.
5. Relancer/recharger les outils MCP Hermes et demander : « Consulte les appartements FABI avec l’outil fabi_properties. Ne modifie rien. » Une réponse authentifiée réussie confirme la connexion. Un simple écran de connexion ne suffit pas.

Les opérations ne nécessitent pas de mot de passe administrateur dans Hermes, ni de connexion Supabase pour Hermes. Le propriétaire ne dispose pas de cet écran ; les responsables et employés ne peuvent pas accorder ou révoquer un accès technique.

## Ce que l’accès permet

- `GET /api/integration/properties` : appartements autorisés, sans identités de propriétaires ni coordonnées clients.
- `GET /api/integration/reservations?from=2026-11-01&to=2026-12-01` : séjours sur une période (début inclus, fin exclue), sans coordonnées ni notes privées.
- `GET /api/integration/availability?property_id=1&arrival=2026-11-01&departure=2026-11-04` : disponibilité à l’instant de consultation. Ne crée aucune réservation.
- `GET /api/integration/report?year=2026&month=11` : chiffres enregistrés, recettes, dépenses et commissions distinguées. Aucun bénéfice FABI n’est assimilé au solde des appartements. Les informations non implémentées restent `null`, pas zéro inventé. Les champs relatifs aux encaissements se limitent aux recettes explicitement marquées encaissées.

Chaque requête utilise `Authorization: Bearer CLE_PRIVEE`, fourni uniquement par le pont MCP côté machine Hermes. Le script propose quatre outils de lecture et deux outils de demande/ouverture du dashboard. Le serveur refuse les permissions absentes et les appartements non autorisés, même si le modèle demande autre chose. Aucune API de création de réservation ou de correction financière n’est ajoutée dans cette étape. Les fonctions existantes s’utilisent dans une session dashboard dédiée, après confirmation :

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

Les routes API ne rendent pas le layout du dashboard et n’appellent ni génération Wi-Fi, ni rappels, ni envoi de messages, ni nettoyage des conversations. Seul un journal technique (identifiant d’accès, route constante, résultat, heure) est ajouté. Aucun secret, corps de requête, numéro, contenu de message ou URL complète n’y est enregistré. Limite : 120 requêtes/minute par accès ; pas de garantie d’un anti-DDoS complet. Le journal technique peut être purgé par une opération d’entretien explicitement autorisée, jamais par une consultation métier.

## Vérifications et limites du diagnostic

- Dépôt local inspecté ; les migrations existantes peuvent réconcilier des appartements et supprimer une ancienne écriture de loyer. **Ne pas lancer `npm run build` avec une base de production pendant les essais.**
- Tests : `npm test`, `npm run build:isolated`, puis `npm run test:integration`, `node --test tests/web.integration.mjs` et `node --test tests/ui.integration.mjs`. Toutes les bases de tests sont isolées et fictives.
- `build:isolated` évite le hook de migration et vide les paramètres DB/messagerie hérités pour la compilation.
- L’installation Hermes sur votre ordinateur n’a pas été inspectée. La configuration MCP est fournie en exemple, à valider avec cette installation.
- L’API GitHub utilisée pour ouvrir une pull request est bloquée dans cet environnement. La branche et les changements sont préparés localement. Aucun push n’est effectué pour éviter un éventuel déploiement automatique Vercel avant votre validation.
- Aucun test réel de Vercel, Supabase ou Meta n’est affirmé. La lecture du dépôt officiel Hermes n’est pas une connexion à votre compte.
- WhatsApp et les autres intégrations restent à préparer avec Hermes. Les fonctions métier existantes sont accessibles via la session dashboard autorisée ; aucune nouvelle API métier d’écriture n’est ajoutée.

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
