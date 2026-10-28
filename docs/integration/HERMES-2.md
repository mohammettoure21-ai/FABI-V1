# Ajouter Hermes 2 sans changer le premier agent

Le serveur existant prend en charge plusieurs clés. Aucun déploiement ni changement du premier accès n’est nécessaire pour enregistrer Hermes 2. Cette procédure doit être exécutée sur **la machine ou le profil du deuxième agent**. Ne pas utiliser la première clé, la première empreinte, le premier fichier de navigateur ou le premier profil.

## Préparer les fichiers sur Windows

Dans une nouvelle fenêtre PowerShell réservée au deuxième agent, avec Node.js 22 ou supérieur :

```powershell
$Hermes2Repo = Join-Path $env:USERPROFILE 'FABI-Hermes-2'
git clone --branch setup/hermes-2 https://github.com/mohammettoure21-ai/FABI-V1.git "$Hermes2Repo"
node (Join-Path $Hermes2Repo 'scripts\hermes-second.mjs')
```

Si cette copie existe déjà, ne la remplacez pas : utilisez son chemin et lancez seulement la commande `node`. Si GitHub réclame une connexion pour un dépôt privé, authentifiez Git normalement ; ne placez pas de jeton dans la commande ou dans le chat. Le connecteur utilise les bibliothèques intégrées de Node ; `npm install` et une base PostgreSQL locale ne sont pas nécessaires.

Le script crée uniquement :

- `%USERPROFILE%\.fabi\hermes-2\hermes-2.key` : nouvelle clé privée ;
- `%USERPROFILE%\.fabi\hermes-2\hermes-2-mcp.yaml` : fragment MCP avec les chemins absolus réels de Node et du dépôt ;
- le chemin `%USERPROFILE%\.fabi\hermes-2\hermes-2-state.json` est réservé à sa future session navigateur, créée uniquement lors d’une connexion autorisée.

Il affiche seulement l’empreinte et les chemins, jamais la clé. Il refuse de remplacer un fichier déjà présent. En cas d’exécution interrompue, conserver les fichiers créés : ne pas les supprimer pour forcer une nouvelle génération. Le script `hermes-key.mjs` n’est pas à relancer sur la première clé.

Protégez **uniquement le nouveau dossier** sous votre compte Windows :

```powershell
$Hermes2Identity = whoami
icacls "$env:USERPROFILE\.fabi\hermes-2" /inheritance:r /grant:r "${Hermes2Identity}:(OI)(CI)F"
```

## Variante Linux

Dans le compte système du deuxième agent :

```sh
git clone --branch setup/hermes-2 https://github.com/mohammettoure21-ai/FABI-V1.git "$HOME/FABI-Hermes-2"
node "$HOME/FABI-Hermes-2/scripts/hermes-second.mjs"
```

Les fichiers sont créés dans `~/.fabi/hermes-2/` avec les modes privés 0700 pour le dossier et 0600 pour les fichiers. Utilisez le chemin de votre copie existante si vous avez déjà cloné le dépôt.

## Enregistrer personnellement le deuxième accès dans FABI

1. Avec votre compte administrateur, ouvrir https://fabi-v1.vercel.app/integrations et le formulaire **Connecter Hermes**. **Ne pas modifier un accès existant.**
2. Nom : **Hermes 2**. Empreinte : la **nouvelle empreinte affichée sur sa machine**, jamais celle du premier Hermes.
3. Cocher **Sans expiration, jusqu’à révocation**, **Tous les appartements**, les trois permissions de consultation, les deux permissions d’ajout et **Accès autonome au CRM sur vos instructions, sans limite de 10 minutes**. L’ancien mode temporaire n’est pas nécessaire.
4. Cliquer sur **Enregistrer l’accès Hermes**. Vérifier que le premier accès et « Hermes 2 » apparaissent séparément. Ne pas révoquer ou modifier le premier.

## Installer le connecteur dans son profil

Fusionner le fragment `hermes-2-mcp.yaml` dans la configuration **du seul profil Hermes 2**, en conservant les autres réglages de ce profil. Le fragment n’est pas un fichier de configuration complet à substituer au profil. Sur le même PC, utiliser un profil Hermes distinct avec sa propre configuration et son propre navigateur. Ne jamais fusionner ce bloc `fabi` dans le profil du premier agent, car il remplacerait son connecteur.

Le chemin du fichier de profil dépend de l’installation Hermes. Le deuxième agent doit repérer la configuration de son profil actif sur sa machine ; ne pas inventer ce chemin et ne pas copier sa configuration privée dans le chat. Les chemins Node, script, clé et session sont déjà adaptés à la machine dans le fragment généré.

Recharger les outils MCP de ce profil et lui faire lire `integration/hermes/INSTRUCTIONS.md`. Le navigateur doit utiliser `hermes-2-state.json`, jamais le fichier du premier agent. Les comptes et autorisations restent bloqués. Les modules métier existants sont accessibles sur vos demandes ; pour les fonctions sans outil API spécifique, utiliser son navigateur autonome.

## Tester la consultation et la séparation

D’abord demander à **Hermes 1**, depuis son canal habituel : « Appelle `fabi_properties`, sans modifier de données. » Conserver seulement le statut de réussite, pas ses secrets.

Après l’enregistrement et le rechargement, demander à **Hermes 2** :

> Appelle `fabi_properties` avec ta propre clé Hermes 2. Affiche le résultat de consultation ou le code d’erreur, sans clé ni cookie. N’ouvre pas encore de session navigateur et ne modifie aucune donnée métier.

Alternative de diagnostic sur Windows, dans la fenêtre PowerShell du deuxième agent :

```powershell
$env:FABI_CRM_URL = 'https://fabi-v1.vercel.app'
$env:FABI_CRM_KEY_FILE = Join-Path $env:USERPROFILE '.fabi\hermes-2\hermes-2.key'
'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fabi_properties","arguments":{}}}' | node (Join-Path $Hermes2Repo 'scripts\hermes-mcp.mjs')
```

La réponse doit contenir une liste `properties` authentifiée, sans `isError:true`. Une liste vide reste une consultation réussie si aucune propriété n’est autorisée/disponible dans la réponse. Une page de connexion ou un HTTP 401 ne confirme pas la connexion.

Refaire ensuite la même consultation depuis **Hermes 1**, avec sa configuration existante. Les deux lectures réussies confirment l’accès de chacun. Sans la première clé ni sa machine, un test local ne prouve pas que son accès réel est valide.

Seulement après ces tests, autoriser Hermes 2 à ouvrir son propre navigateur avec `fabi_open_dashboard` en mode autonome. Une nouvelle ouverture ne remplace que la session de **sa propre clé**. La révocation de l’accès nommé Hermes 2 ne supprime que ses sessions ; il n’est pas nécessaire de tester une révocation réelle pour terminer l’installation.

Si WhatsApp est utilisé, limiter les commandes à l’identité du propriétaire vérifiée par la passerelle du deuxième agent. Le CRM vérifie les clés ; il ne vérifie pas lui-même les messages WhatsApp. Ne déclarer aucun succès WhatsApp ou navigateur avant son test effectif.
