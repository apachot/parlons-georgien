# Ajouter des contenus pédagogiques

Les fichiers de `content/` sont chargés à la demande. Pour ajouter des contenus à une banque existante, créez un fichier nommé `<banque>_<identifiant>.json`. Le fichier est intégré automatiquement aux exercices de cette banque, sans modification du code Python.

Chaque fichier doit être un objet JSON avec un champ `cefr` et un tableau `items` :

```json
{
  "cefr": "A2",
  "items": [
    {
      "id": "lecture-a2-nouvelle-histoire",
      "level": 3,
      "cefr": "A2",
      "level_name": "Une nouvelle histoire",
      "text": "...",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answer": "...",
      "translation": "...",
      "explanation": "..."
    }
  ]
}
```

`cefr` accepte un niveau (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`) ou une liste de niveaux si le fichier contient plusieurs niveaux. Dans un fichier multiniveau, indiquez aussi `cefr` sur chaque élément pour que l’adaptation puisse sélectionner précisément les questions. Chaque élément doit avoir un identifiant unique dans sa banque.

## Familles de fichiers reconnues

- `alphabet_<identifiant>.json` : lettres (`A1`)
- `alphabet_recognition_a1_<identifiant>.json` : variantes du jeu de sons (`A1`)
- `vocabulary_<identifiant>.json` et `vocabulary_images_<identifiant>.json` : vocabulaire et illustrations
- `grammar_<identifiant>.json` et `grammar_exercises_<identifiant>.json` : fiches et quiz de grammaire
- `dialogues_<identifiant>.json` : scènes et répliques
- `dictation_sentences_<identifiant>.json` : dictées et traductions de phrases
- `reading_a1_<identifiant>.json` à `reading_c2_<identifiant>.json` : lectures guidées, au niveau indiqué par le nom
- `reading_exams_<identifiant>.json` : longues épreuves de lecture
- `reading_cloze_<identifiant>.json` : phrases à trous
- `comprehension_order_<identifiant>.json` : récits à remettre dans l’ordre
- `lessons_<identifiant>.json` et `elearning_lessons_<identifiant>.json` : leçons et cours interactifs
- `readings_<identifiant>.json` : banque complémentaire de lectures déjà classées par niveau dans les éléments

Le nom de fichier indique la banque et son format ; le champ `cefr` indique le niveau. Le schéma des éléments doit suivre celui des fichiers existants de la famille. Le chargement vérifie les métadonnées CECRL et les identifiants dupliqués. Les fichiers sont relus à chaque requête de contenu, donc les ajouts sont disponibles dès qu’ils sont présents dans `content/`.
