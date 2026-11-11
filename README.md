# Kartuli — apprendre le géorgien en français

Petite application Flask pour commencer à lire, comprendre et parler géorgien dans les situations courantes. Tout le parcours fonctionne localement, sans compte, clé API ni service payant. Le contenu pédagogique se trouve dans `content/` et la progression locale dans SQLite.

## Lancer l’application

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python init_db.py
python run.py
```

Ouvrez ensuite <http://127.0.0.1:5000>. La base est créée dans `instance/georgien.db`. Les boutons audio lisent les extraits pré-générés lorsqu’ils sont installés ; sans fichiers audio, l’application affiche leur indisponibilité.

### Audio local géorgien et français

Le serveur de démonstration utilise Piper avec les voix `ka_GE-natia-medium` pour le géorgien et `fr_FR-siwis-medium` pour le français. La synthèse s’exécute localement, sans envoi des phrases à un fournisseur externe ; eSpeak NG reste disponible comme solution de repli pour le géorgien si le modèle Piper n’est pas installé. Les extraits préparés sont mis en cache sous `instance/audio/`; la route `/api/audio` ne sert que les fichiers déjà générés. Pour préparer ou compléter les extraits après une modification du contenu :

```bash
python3 -m venv .venv-tts
.venv-tts/bin/pip install piper-tts
sudo apt install espeak-ng
mkdir -p instance/tts-voices
.venv-tts/bin/python -m piper.download_voices --data-dir instance/tts-voices fr_FR-siwis-medium
.venv-tts/bin/python -m piper.download_voices --data-dir instance/tts-voices ka_GE-natia-medium
PIPER_KA_MODEL=instance/tts-voices/ka_GE-natia-medium.onnx PIPER_FR_MODEL=instance/tts-voices/fr_FR-siwis-medium.onnx .venv-tts/bin/python scripts/generate_tts.py
```

La voix française s’appuie sur la base SIWIS, sous licence CC BY 4.0 ; attribution : Junichi Yamagishi, Pierre-Edouard Honnet, Philip Garner et Alexandros Lazaridis, Université d’Édimbourg ([fiche du modèle](https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR/siwis/medium)). La voix géorgienne « Natia » est autorisée pour un usage individuel personnel ; elle n’est pas destinée aux produits d’organisations ([licence source](https://huggingface.co/datasets/rhasspy/piper-checkpoints/commit/fff501d5f5edcf22c76791c70b7247d83510921d)). Les moteurs Piper et eSpeak NG sont distribués sous GPL-3.0. Pour remplacer les extraits géorgiens déjà en cache :

```bash
PIPER_KA_MODEL=instance/tts-voices/ka_GE-natia-medium.onnx PIPER_FR_MODEL=instance/tts-voices/fr_FR-siwis-medium.onnx .venv-tts/bin/python scripts/generate_tts.py --force-language ka
```

## Ce qui est inclus

- Tableau de bord, 10 leçons de situation et séance de quiz à choix multiples.
- Les 33 lettres mkhedruli, une activité de reconnaissance, exemples, translittération et aide de prononciation en français.
- 120 mots et expressions contextualisés, recherche, exemples traduits et fiches de grammaire graduées.
- Quatre dialogues guidés autonomes.
- SQLite conserve les réponses, les erreurs récentes, les compteurs et les dates de révision. Une réponse difficile est proposée de nouveau après dix minutes ; une réponse réussie revient à intervalle croissant.
- Export JSON depuis le lien en bas de page.

## Organisation

`app/__init__.py` contient la fabrique Flask, les modèles SQLAlchemy et les routes. Les vues Jinja se trouvent dans `app/templates/`; le CSS et le JavaScript léger dans `app/static/`. Les contenus sont éditables dans les cinq fichiers JSON de `content/`.

La translittération suit une convention latine cohérente avec les correspondances présentées par le groupe d’experts des Nations unies sur les noms géographiques : `sh`, `zh`, `ch`, `ts`, `kh`, `gh`, et apostrophe pour les éjectives (`k'`, `p'`, `t'`, `ts'`). L’aide de prononciation en français est séparée et explicitement approximative. Le repère sur les 33 lettres, les consonnes et les éjectives s’appuie sur le manuel *Basic Georgian* de l’Université Ilia ([PDF](https://eprints.iliauni.edu.ge/3035/1/Basic-Georgian%202%20bolo%20versia.pdf)) et le document de Shukia Apridonidze pour l’UNGEGN ([PDF](https://unstats.un.org/unsd/geoinfo/ungegn/docs/26th-gegn-docs/wp/WP94_rev2_Georgian%20Consonants.pdf)). Les formes verbales de « vouloir » et « aller » renvoient aux tableaux de conjugaison d’[EasyGeorgian](https://easygeorgian.com/verbs/unda/) ; « rester » à [Lingua.ge](https://lingua.ge/verbs/%E1%83%93%E1%83%98-%E1%83%95%E1%83%90%E1%83%9A-%E1%83%95%E1%83%94%E1%83%93-%E1%83%A1%E1%83%A3%E1%83%9A/) ; « commencer » au [manuel de géorgien du ministère géorgien de l’Éducation](https://mes.gov.ge/mesgifs/1634974351_Book-Learn%20Georgian-WEB%284%29.pdf). Les fiches affichent leurs sources. Les éléments placés dans `uncertain_ids` dans le JSON du vocabulaire sont gardés hors du parcours.

## Vérification

Lancer les vérifications fonctionnelles :

```bash
python -m unittest discover -s tests -v
```

La mise en page est responsive et les états sans révisions et sans voix sont prévus. Une vérification visuelle manuelle sur plusieurs navigateurs/appareils reste recommandée pour la police géorgienne et les voix système.
