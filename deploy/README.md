# Déploiement

Cette application Flask peut être publiée à la racine d’un domaine ou sous un préfixe tel que `/kartuli/`. Les exemples ci-dessous utilisent Apache, Gunicorn et systemd. Adaptez le compte de service, les chemins, le nom d’hôte SSH et les noms de vhost à votre serveur ; gardez ces valeurs propres à votre infrastructure dans votre configuration locale.

## Installation

Préparez un environnement Python, installez `requirements.txt`, créez un compte système dédié et donnez-lui accès au répertoire de l’application et à `instance/`. L’unité `kartuli.service` est un modèle à adapter avant installation. Elle écoute sur `127.0.0.1:8000` ; le vhost Apache correspondant relaie les requêtes vers ce port.

Pour servir l’application sous `/kartuli/`, insérez `apache-kartuli.conf` dans un vhost TLS et transmettez `X-Forwarded-Prefix: /kartuli`. Pour la servir à la racine de `parlonsgeorgien.fr`, installez les vhosts `parlonsgeorgien-http.conf` et `parlonsgeorgien-https.conf`. Ils prévoient HTTPS, la redirection de `www` vers le domaine nu et le renouvellement du certificat avec Certbot. Vérifiez les enregistrements DNS et adaptez les chemins du certificat avant l’activation.

L’installation initiale de systemd et l’insertion du vhost nécessitent `sudo`. Le script `install_remote.sh` est un exemple à personnaliser ; vérifiez chaque chemin et chaque vhost avant de l’exécuter.

## Déploiements suivants

Définissez localement un alias SSH dans `~/.ssh/config` et les variables suivantes dans votre terminal. Ne stockez jamais de clé privée, mot de passe ou secret de déploiement dans le dépôt.

```sh
export DEPLOY_HOST=mon-serveur
export APP_ROOT=/srv/parlons-georgien
```

Sauvegardez les fichiers distants concernés, puis transférez uniquement les fichiers modifiés. Exemple :

```sh
ssh "$DEPLOY_HOST" "mkdir -p /srv/backups && cp -a '$APP_ROOT/app/static/style.css' /srv/backups/style.css.bak"
scp app/static/style.css "$DEPLOY_HOST:$APP_ROOT/app/static/style.css"
```

Adaptez les chemins de sauvegarde et de transfert. Ne remplacez pas la base SQLite ni le cache audio lors d’un déploiement de code ordinaire. Après transfert, rechargez Gunicorn selon la configuration du serveur, puis vérifiez la page derrière Apache. Pour un déploiement sous `/kartuli/`, l’application attend l’en-tête `X-Forwarded-Prefix`; à la racine du domaine, cet en-tête n’est pas nécessaire.
