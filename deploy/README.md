# Déploiement sur example.org

Kartuli est monté sous `/kartuli/` avec le même modèle Apache/Gunicorn que les autres applications du serveur. Le compte `parlonsgeorgien` exécute le service ; il réutilise le venv partagé de DeescoPass, où Flask, Flask-SQLAlchemy, Werkzeug et Gunicorn sont déjà installés. Les données SQLite résident dans `instance/georgien.db` à côté du code.

- Unit systemd : `kartuli.service`, bind loopback `127.0.0.1:8000`.
- Extrait Apache : `apache-kartuli.conf`, à insérer dans le vhost TLS `example.org`.
- WSGI applique `ProxyFix` pour transformer l’en-tête `X-Forwarded-Prefix: /kartuli` en `SCRIPT_NAME`; liens, ressources et API restent donc sous `/kartuli/`.

Après installation, contrôler avec `systemctl is-active kartuli`, `curl -fsS https://example.org/kartuli/` et `curl -fsS https://example.org/kartuli/api/progress`.

## Déploiements suivants

Un `git push` met à jour GitHub, mais ne déploie pas l’application. Le serveur ne contient pas de clone Git : le code actif est dans `/srv/parlons-georgien`. Pour s’y connecter, utiliser l’alias SSH local `DEPLOY_HOST`, configuré dans `~/.ssh/config` avec la clé `~/.ssh/DEPLOY_SSH_KEY`. Ne jamais copier la clé privée dans le projet.

Depuis la racine du dépôt, sauvegarder les fichiers distants concernés, puis transférer uniquement les fichiers modifiés. Exemple pour le template et les ressources statiques du vocabulaire :

```sh
ssh DEPLOY_HOST 'stamp=$(date -u +%Y%m%dT%H%M%SZ); dest=/srv/backups/kartuli-$stamp; mkdir -p "$dest"; cp /srv/parlons-georgien/app/templates/vocabulary.html /srv/parlons-georgien/app/static/vocabulary.js /srv/parlons-georgien/app/static/style.css "$dest"/'
scp app/templates/vocabulary.html DEPLOY_HOST:/srv/parlons-georgien/app/templates/vocabulary.html
scp app/static/vocabulary.js DEPLOY_HOST:/srv/parlons-georgien/app/static/vocabulary.js
scp app/static/style.css DEPLOY_HOST:/srv/parlons-georgien/app/static/style.css
```

Adapter les chemins de sauvegarde et de transfert aux fichiers réellement modifiés. Garder les sauvegardes dans `/srv/backups/` ; ne pas remplacer la base SQLite ni le cache audio pour un déploiement de code ordinaire.

Après le transfert, recharger les workers Gunicorn afin qu’ils reprennent le nouveau code et les templates. Avec l’accès SSH actuel, `sudo systemctl restart` demande un mot de passe ; le signal `HUP` recharge Gunicorn sans couper le service :

```sh
ssh DEPLOY_HOST 'pid=$(systemctl show kartuli.service -p MainPID --value); test "$pid" -gt 1; kill -HUP "$pid"; sleep 2; systemctl is-active kartuli.service'
```

Vérifier ensuite que la page et les ressources mises à jour sont bien servies par l’application derrière Apache :

```sh
ssh DEPLOY_HOST 'curl -fsS -H "X-Forwarded-Prefix: /kartuli" http://127.0.0.1:8000/vocabulary'
ssh DEPLOY_HOST 'curl -fsS -H "X-Forwarded-Prefix: /kartuli" http://127.0.0.1:8000/static/vocabulary.js'
ssh DEPLOY_HOST 'curl -fsS -H "X-Forwarded-Prefix: /kartuli" http://127.0.0.1:8000/static/style.css'
curl -fsS https://example.org/kartuli/vocabulary
```

Pour une vérification ciblée, remplacer l’affichage complet par `grep` sur le nom du module, le texte ou le sélecteur CSS attendu. Le script `deploy/install_remote.sh` sert à l’installation initiale de l’unité systemd et de la configuration Apache TLS ; ce n’est pas la procédure normale pour publier une modification de l’application.
