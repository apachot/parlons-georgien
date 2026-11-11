# Déploiement sur example.org

Kartuli est monté sous `/kartuli/` avec le même modèle Apache/Gunicorn que les autres applications du serveur. Le compte `parlonsgeorgien` exécute le service ; il réutilise le venv partagé de DeescoPass, où Flask, Flask-SQLAlchemy, Werkzeug et Gunicorn sont déjà installés. Les données SQLite résident dans `instance/georgien.db` à côté du code.

- Unit systemd : `kartuli.service`, bind loopback `127.0.0.1:8000`.
- Extrait Apache : `apache-kartuli.conf`, à insérer dans le vhost TLS `example.org`.
- WSGI applique `ProxyFix` pour transformer l’en-tête `X-Forwarded-Prefix: /kartuli` en `SCRIPT_NAME`; liens, ressources et API restent donc sous `/kartuli/`.

Après installation, contrôler avec `systemctl is-active kartuli`, `curl -fsS https://example.org/kartuli/` et `curl -fsS https://example.org/kartuli/api/progress`.
