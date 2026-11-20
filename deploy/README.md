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

## Validation des adresses e-mail

Les nouveaux comptes doivent confirmer leur adresse avant de pouvoir se connecter. Les comptes existants sont conservés comme déjà validés. Utilisez un relais SMTP transactionnel (l’exemple est prérempli pour Brevo) plutôt qu’un MTA d’envoi direct depuis le serveur. Dans le fournisseur, activez l’envoi transactionnel, authentifiez `parlonsgeorgien.fr` (DKIM et DMARC, plus les éventuels CNAME/SPF demandés) et vérifiez le sender `contact@parlonsgeorgien.fr`. Laissez les MX OVH en place pour la réception. Si le fournisseur demande une autorisation SPF, fusionnez-la dans l’unique enregistrement SPF existant ; ne créez jamais un second SPF.

Copiez `deploy/mail.env.example` vers `/etc/parlons-georgien/mail.env`, remplacez les deux valeurs SMTP avec le login SMTP et la clé SMTP (pas une clé API), puis protégez le fichier (`chmod 600`). L’application n’active l’inscription que si l’hôte, le login, la clé, le sender et STARTTLS sur le port 587 ou 2525 sont tous configurés. Si cette même adresse sert aussi aux newsletters ou messages marketing, envoyez-les avec l’outil de campagnes du fournisseur, avec un consentement distinct et un moyen simple de se désinscrire ; gardez les confirmations de compte comme messages transactionnels. Ne placez jamais ces secrets dans Git.

Le relais doit accepter TLS sur le port configuré. Le lien de validation est signé par la clé Flask du serveur et expire après 24 heures. Le formulaire de renvoi limite les envois à un message par minute et ne révèle pas si une adresse est associée à un compte.
