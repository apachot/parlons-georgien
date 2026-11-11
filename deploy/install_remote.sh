#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/srv/parlons-georgien"
UNIT_SOURCE="$APP_ROOT/deploy/kartuli.service"
APACHE_SOURCE="$APP_ROOT/deploy/apache-kartuli.conf"
UNIT_TARGET="/etc/systemd/system/kartuli.service"
VHOST="/etc/apache2/sites-available/example.org-le-ssl.conf"
BACKUP="$VHOST.bak-kartuli-$(date +%Y%m%d%H%M%S)"
VHOST_CANDIDATE="/tmp/example.org-le-ssl.conf.kartuli"

sudo install -o root -g root -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
sudo systemctl daemon-reload
sudo systemctl enable --now kartuli.service
sudo systemctl is-active --quiet kartuli.service
curl -fsS -H 'X-Forwarded-Prefix: /kartuli' http://127.0.0.1:8000/api/progress >/dev/null

python3 - "$VHOST" "$APACHE_SOURCE" "$VHOST_CANDIDATE" <<'PY'
from pathlib import Path
import sys

source, snippet_path, candidate = map(Path, sys.argv[1:])
config = source.read_text()
snippet = snippet_path.read_text().strip()
if "ProxyPass        /kartuli/" not in config:
    end = config.rfind("</VirtualHost>")
    if end < 0:
        raise SystemExit("Fin du VirtualHost TLS introuvable ; Apache inchangé.")
    config = config[:end] + "\n\n    " + snippet.replace("\n", "\n    ") + "\n\n" + config[end:]
candidate.write_text(config)
PY

sudo install -o root -g root -m 0644 "$VHOST" "$BACKUP"
sudo install -o root -g root -m 0644 "$VHOST_CANDIDATE" "$VHOST"
if ! sudo /usr/sbin/apachectl configtest; then
    sudo cp "$BACKUP" "$VHOST"
    echo "La vérification Apache a échoué ; le vhost précédent a été restauré." >&2
    exit 1
fi
sudo systemctl reload apache2
echo "Kartuli est actif. Sauvegarde Apache : $BACKUP"
