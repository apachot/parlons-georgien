# Contribuer

Merci de contribuer à Parlons géorgien. Les rapports de bogue, propositions d’exercices et améliorations du code sont les bienvenus.

## Proposer un changement

1. Ouvrez une issue pour les changements importants afin de discuter du contenu ou de l’approche.
2. Créez une branche et faites un changement ciblé.
3. Pour les contenus pédagogiques, vérifiez les traductions, la translittération et les exemples géorgiens ; gardez les fichiers JSON valides.
4. Lancez les vérifications avant d’ouvrir une pull request :

   ```sh
   python -m unittest discover -s tests -v
   git diff --check
   ```

5. Décrivez le problème, la solution et les vérifications effectuées dans la pull request.

## Développement local

Suivez les instructions de lancement dans [`README.md`](README.md). N’ajoutez pas de base de données locale, de cache audio, de modèle de voix, de clé, de mot de passe ou de configuration propre à un serveur. Les illustrations OpenMoji et les voix Piper sont soumises à des licences séparées ; consultez [`NOTICE.md`](NOTICE.md).

Les contributions au code et aux contenus originaux sont proposées sous GNU GPL version 3 ou ultérieure, conformément à [`LICENSE`](LICENSE). En proposant une contribution, vous confirmez avoir le droit de la partager sous ces conditions.
