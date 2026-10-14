"""Sauvegarde cohérente SQLite ; aucune suppression des sauvegardes précédentes."""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'instance' / 'fabi.sqlite'
if not source.exists():
    raise SystemExit('Base absente. Initialisez le CRM avant la sauvegarde.')
folder = root / 'backups'
folder.mkdir(mode=0o700, exist_ok=True)
target = folder / (datetime.now(timezone.utc).strftime('fabi-%Y%m%d-%H%M%S-%f') + '.sqlite')
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src, sqlite3.connect(target) as dst:
    src.backup(dst)
    if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise SystemExit('Échec de vérification de la sauvegarde.')
target.chmod(0o600)
print('Sauvegarde vérifiée :', target)
