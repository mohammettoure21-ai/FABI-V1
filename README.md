# FABI CRM — Phase 1

Application gratuite, locale, en français. Python / Flask / SQLite / Waitress.
Aucun abonnement, API, Docker, domaine ou compte GitHub nécessaire à son utilisation.

## Installation sur Windows

1. Installez Python 3.12 ou 3.13 depuis python.org (gratuit), avec l'option « Add Python to PATH ». Internet est nécessaire uniquement pour télécharger Python et les dépendances.
2. Copiez le dossier complet FABI-V1 sur votre ordinateur, dans un dossier privé de votre compte Windows (évitez les dossiers partagés).
3. Ouvrez le dossier `scripts`, puis double-cliquez sur `setup_windows.bat`. Il installe les dépendances, initialise la base et lance les tests. Attendez le message « Installation terminee ».
4. Double-cliquez sur `creer_admin.bat`. Choisissez votre identifiant, votre nom et un mot de passe personnel d'au moins 12 caractères. Le mot de passe ne s'affiche pas pendant la saisie. Aucun compte ou mot de passe par défaut n'est fourni.
5. Double-cliquez sur `start_windows.bat`. Gardez la fenêtre ouverte et saisissez `http://127.0.0.1:8080` dans le navigateur **de cet ordinateur Windows**.
6. Après chaque redémarrage de Windows, double-cliquez de nouveau sur `start_windows.bat`.

L'application exécutée dans l'environnement cloud n'est pas accessible à l'adresse locale de votre ordinateur : copiez d'abord le projet sur Windows. Les scripts Windows sont fournis, mais leur exécution doit encore être vérifiée sur Windows.

## Tester simplement

Connectez-vous avec votre compte. Consultez le tableau de bord puis « Équipe & accès ». Créez un employé avec un mot de passe individuel. Déconnectez-vous, connectez-vous avec cet employé : l'administration et le journal sont réservés à l'administrateur. Reconnectez-vous en administrateur pour désactiver cet employé et vérifier qu'il ne peut plus accéder au CRM.

Tests techniques : `.venv\Scripts\python -m pytest -q` depuis le dossier principal.
Sous Linux : `python -m venv .venv`, `.venv/bin/pip install -r requirements.txt`, `.venv/bin/python -m flask --app fabi init-db`, `.venv/bin/python -m flask --app fabi create-admin`, puis `.venv/bin/python run.py`.

## Données et sécurité

La base est `instance/fabi.sqlite`. La clé des sessions est créée dans `instance/secret.key` et reste persistante. Ne partagez pas ces fichiers. Restreignez l'accès au dossier avec les permissions Windows, verrouillez votre session et activez le chiffrement du disque si disponible. Les mots de passe sont hachés ; la base entière n'est pas chiffrée par l'application.

Protection CSRF, contrôle des rôles côté serveur, cookies HttpOnly / SameSite, expiration après 30 minutes, journal d'activité et limitation à 5 échecs par identifiant ou adresse sur 15 minutes. Aucun service externe ne reçoit les données. Les droits financiers et l'affectation des réservations seront ajoutés avec leurs modules.

## Sauvegarde et restauration

Exécutez `.venv\Scripts\python scripts\backup.py`. Une sauvegarde datée, vérifiée et sans écrasement apparaît dans `backups`. Copiez-la régulièrement sur un support privé protégé. La sauvegarde contient les comptes et leurs mots de passe hachés : elle est confidentielle.

Pour restaurer : arrêtez le serveur (Ctrl+C), faites une nouvelle sauvegarde, conservez l'ancienne base dans un autre dossier privé, puis copiez la sauvegarde choisie dans `instance` et nommez-la `fabi.sqlite`. Conservez `secret.key` ou supprimez-la pour générer une nouvelle clé et invalider toutes les sessions au prochain démarrage. Redémarrez et vérifiez les comptes et le journal. Ne restaurez jamais pendant que le serveur tourne. Testez cette procédure sur une copie du dossier avant toute utilisation réelle.

## Accès des employés : pas encore activé

Cette phase écoute uniquement sur 127.0.0.1 : aucun autre ordinateur ne peut y accéder. N'ouvrez aucun port sur votre routeur et ne configurez jamais de redirection publique.

HTTP sur un réseau local permet l'interception des mots de passe et des données. Avant des données réelles et l'accès réseau, la phase 5 devra configurer HTTPS avec un certificat approuvé sur chaque poste, un proxy local gratuit, des cookies Secure et une règle du pare-feu limitée au réseau privé. Ne changez pas simplement l'adresse d'écoute pour activer le réseau. Le réseau local de confiance ne remplace pas le chiffrement.

## Périmètre livré

Phase 1 : connexion/déconnexion, comptes administrateur/responsable/employé, création et désactivation de comptes par l'administrateur, journal, navigation responsive, base persistante, procédure de sauvegarde et tests.
Le tableau de bord présente des emplacements clairement marqués « À venir », sans données commerciales inventées.

À réaliser : phase 2 (clients, pipeline, appartements, réservations et calendrier), phase 3 (finances en XOF entier, commissions et rapports), phase 4 (factures/PDF, WhatsApp et imports CSV/XLSX), phase 5 (HTTPS local, accès employés, tests de sécurité complets et validation Windows). Les filtres et indicateurs réels arriveront avec ces modules. Aucun document financier original n'a été utilisé ou modifié.

Aucun compte de démonstration permanent. Les tests utilisent uniquement des comptes fictifs dans une base temporaire. Ne considérez pas cette phase comme une application métier complète validée pour la production.
