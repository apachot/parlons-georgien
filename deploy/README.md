# Déploiement sur example.org

Parlons géorgien est monté sous `/kartuli/` sur `example.org`, avec le même modèle Apache/Gunicorn que les autres applications du serveur. Le compte `parlonsgeorgien` exécute le service ; il réutilise le venv partagé de DeescoPass, où Flask, Flask-SQLAlchemy, Werkzeug et Gunicorn sont déjà installés. Les données SQLite résident dans `instance/georgien.db` à côté du code.

- Unit systemd : `kartuli.service`, bind loopback `127.0.0.1:8000`.
- Extrait Apache : `apache-kartuli.conf`, à insérer dans le vhost TLS `example.org`.
- WSGI applique `ProxyFix` pour transformer l’en-tête `X-Forwarded-Prefix: /kartuli` en `SCRIPT_NAME`; liens, ressources et API restent donc sous `/kartuli/`.

## Vhosts de parlonsgeorgien.fr

Les vhosts actifs sont préparés dans `parlonsgeorgien-http.conf` et `parlonsgeorgien-https.conf`. Le domaine sert Parlons géorgien à la racine (`/`) sur le Gunicorn existant (`127.0.0.1:8000`) : ne pas ajouter `X-Forwarded-Prefix` à ces vhosts. `www.parlonsgeorgien.fr` redirige vers `parlonsgeorgien.fr` en HTTP comme en HTTPS, et HTTP est redirigé vers HTTPS. Certificat Let’s Encrypt émis le 12 novembre 2026 pour les deux noms, avec renouvellement automatique.

Avant activation, vérifier que les deux noms DNS pointent vers `SERVER_IPV4`. Au dernier contrôle (12 novembre 2026), `www.parlonsgeorgien.fr` pointait vers le serveur, mais `parlonsgeorgien.fr` résolvait encore vers `PREVIOUS_SERVER_IPV4`. Tant que l’apex n’est pas corrigé/propagé, Certbot ne pourra pas émettre un certificat valide pour les deux noms.

Pour réinstaller les vhosts, une fois les deux enregistrements DNS propagés et le dossier ACME créé, installer et activer le vhost HTTP, puis (ré)émettre le certificat :

```sh
sudo install -d -o root -g root -m 0755 /var/lib/letsencrypt/.well-known/acme-challenge
sudo install -o root -g root -m 0644 /srv/parlons-georgien/deploy/parlonsgeorgien-http.conf /etc/apache2/sites-available/parlonsgeorgien.fr.conf
sudo a2ensite parlonsgeorgien.fr.conf
sudo apachectl configtest && sudo systemctl reload apache2
sudo certbot certonly --webroot -w /var/lib/letsencrypt -d parlonsgeorgien.fr -d www.parlonsgeorgien.fr
```

Après validation du certificat, installer le vhost HTTPS :

```sh
sudo install -o root -g root -m 0644 /srv/parlons-georgien/deploy/parlonsgeorgien-https.conf /etc/apache2/sites-available/parlonsgeorgien-https.conf
sudo a2ensite parlonsgeorgien-https.conf
```

Le vhost HTTP redirige vers HTTPS (en laissant passer les requêtes ACME) ; le vhost HTTPS redirige `www` vers le domaine nu. Vérifier `sudo apachectl configtest` et recharger Apache. Contrôler enfin `https://parlonsgeorgien.fr/` et `https://www.parlonsgeorgien.fr/`.

Le compte SSH de déploiement peut déposer les fichiers, mais `sudo` demande un mot de passe pour les opérations Apache et Certbot.

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
