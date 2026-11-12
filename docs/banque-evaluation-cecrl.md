# Banque d’évaluation CECRL

## Objectif

Constituer une banque permettant de proposer des exercices adaptés au niveau CECRL démontré par l’apprenant, puis d’ajuster la difficulté selon ses réponses. La cible est de **20 versions distinctes par exercice et par niveau pertinent**, de A1 à C2. Un exercice n’est rattaché qu’aux niveaux que son contenu permet réellement d’évaluer.

La progression porte sur le contenu : vocabulaire, grammaire, longueur, densité, implicite, débit audio et distracteurs. Le format de jeu ne détermine pas le niveau.

## Échelle et règles

| Niveau | Repère de conception |
|---|---|
| A1 | Mots et expressions très fréquents, structures courtes et concrètes. |
| A2 | Situations courantes, phrases simples reliées, passé et futur usuels. |
| B1 | Récits et échanges suivis, détails, raisons et enchaînements explicites. |
| B2 | Textes développés, nuances, argumentation et inférences accessibles. |
| C1 | Langue dense et idiomatique, implicite, registre et organisation complexe. |
| C2 | Maîtrise très fine : sous-entendus, variations de registre, ambiguïtés et formulations rares. |

Ces repères sont des critères de rédaction, pas des scores officiels TOEIC ou TOEFL. Toute attribution doit examiner le contenu géorgien, les compétences prérequises et les choix de réponse. Une même famille peut donc avoir plusieurs niveaux, et deux exercices de même niveau peuvent avoir des contenus très différents.

**Exception stable :** la reconnaissance et la lecture des lettres isolées du mkhedruli restent A1. Les activités de lecture de mots, de phrases et de textes peuvent ensuite progresser jusqu’au niveau que leur contenu justifie.

## Définition d’une version

Une version est une unité d’évaluation réutilisable, identifiée et non dupliquée : un questionnaire complet, un passage avec ses questions, une scène avec ses tours, ou une série de tâches. Vingt versions ne signifient pas vingt répétitions aléatoires du même contenu. Une version contient autant d’items que nécessaire pour mesurer la compétence ciblée.

Chaque variante de la banque doit porter au minimum :

```json
{
  "id": "reading-b1-001",
  "exercise": "reading-comprehension",
  "skill": "reading",
  "cefr": "B1",
  "version": 1,
  "content": {},
  "answer_key": {},
  "rationale": "Pourquoi ce contenu correspond à ce niveau",
  "source": "original"
}
```

Les identifiants restent stables afin de suivre les réponses et d’éviter de resservir immédiatement la même version. Les corrigés et explications sont séparés du contenu montré à l’apprenant. Les variantes de compréhension orale référencent le texte et son audio communs au lieu de dupliquer ces ressources.

## Inventaire des familles

Les niveaux ci-dessous sont des niveaux **à couvrir dans la banque**, pas une affirmation que le site contient déjà ces versions.

| Famille d’exercices | Niveaux à développer | Règle particulière |
|---|---|---|
| Sons et reconnaissance des lettres | A1 | Les lettres isolées restent A1. |
| Lecture rapide de mots | A1–C2 | Complexité des mots géorgiens, puis groupes et contraintes de lecture. |
| Paires, traduction et rappel de vocabulaire | A1–C2 | Noter les mots et expressions sélectionnés dans chaque version. |
| Mot-image | A1–B2 | S’appuyer sur le lexique concret ; ne pas attribuer C1/C2 sans objectif linguistique adapté. |
| Mémory | A1–B2 | La mémoire seule ne relève pas d’un niveau CECRL : le niveau vient des expressions à retrouver. |
| Mots fléchés | A1–C2 | Grilles et définitions doivent évoluer avec le lexique, les formes et les indices. |
| Traduction et construction de phrases | A1–C2 | Évaluer les structures grammaticales et le contexte demandé. |
| Dictée de mots ou de phrases | A1–C2 | Évaluer le texte entendu, les contractions, le débit et les détails orthographiques. |
| Lecture et compréhension écrite | A1–C2 | Passages et questions doivent être notés ensemble. |
| Écoute et compréhension orale | A1–C2 | Noter le texte, le débit, les reprises autorisées et les questions. |
| Grammaire : temps, préverbes, cas, suffixes, correction | A1–C2 | Chaque question est notée d’après la notion et la phrase, pas d’après le thème du bouton. |
| Dialogues et réponses rapides | A1–C2 | Le registre, l’implicite et la longueur des échanges font progresser le niveau. |

## Progression par étapes

1. Stabiliser le format des données, les critères CECRL et le calcul des statistiques.
2. Construire une première famille pilote avec des versions distinctes et un corrigé vérifiable.
3. Valider les niveaux et la qualité des distracteurs ; mesurer la difficulté observée sur les réponses.
4. Étendre la banque aux autres familles et niveaux pertinents jusqu’à atteindre vingt versions pour chaque cellule ciblée.
5. Activer l’adaptation : choisir le niveau de départ à partir d’un diagnostic, puis monter, maintenir ou descendre selon la précision et la régularité.

## Première tranche : compréhension écrite guidée

La première famille pilote est la compréhension écrite guidée. Vingt passages-questionnaires A1 originaux ont été ajoutés dans `content/reading_a1.json`. Chaque variante comporte un texte géorgien court, une question, quatre choix, la réponse, une traduction et une explication.

| Niveau | Variantes disponibles dans cette famille | Cible | État |
|---|---:|---:|---|
| A1 | 26 | 20 | Cible atteinte ; 20 variantes nouvelles dans cette tranche |
| A2 | 20 | 20 | Cible atteinte ; 17 variantes nouvelles dans cette tranche |
| B1 | 20 | 20 | Cible atteinte ; 17 variantes nouvelles dans cette tranche |
| B2 | 21 | 20 | Cible atteinte ; 21 variantes nouvelles dans cette tranche |
| C1 | 24 | 20 | Cible atteinte ; 24 variantes nouvelles dans cette tranche |
| C2 | 0 | 20 | À créer |

Les 17 nouveaux passages A2 sont des récits courts enchaînant plusieurs actions, avec des repères temporels, des raisons ou des contrastes. Les 17 variantes B1 ajoutées ensuite développent davantage les récits et demandent de relier causes, conséquences ou décisions. Les 21 variantes B2 ajoutent des textes plus développés sur des sujets de société, de travail et de culture, avec des questions de synthèse, d’inférence et d’évaluation des arguments. Les 24 variantes C1 ajoutent des textes argumentatifs et analytiques qui demandent d’interpréter les limites d’un indicateur, de distinguer corrélation et causalité, de reconnaître les biais ou de reconstruire un arbitrage. Le niveau du sticker de lecture guidée suit le passage choisi. Les deux textes longs d’examen portent leur niveau depuis leur contenu (A2 ou B1), au lieu d’hériter d’une difficulté unique attachée au format. Le parcours de compréhension orale guidée réutilise aussi ces passages et le même niveau CECRL.

## Statistiques à suivre

Le tableau de bord de la banque devra distinguer, pour chaque famille et chaque niveau : versions rédigées, versions vérifiées, versions actives, couverture sur la cible de 20, items disponibles et taux de réussite observé. Les contenus partagés entre lecture et écoute seront comptés comme une ressource source, tout en restant dénombrés comme versions dans chacune des deux compétences évaluées.

Les contenus existants ne sont pas réputés conformes à cette cible tant que leurs items n’ont pas été classés individuellement et vérifiés. En particulier, le niveau affiché sur une activité ne doit pas être hérité automatiquement du type d’exercice.
