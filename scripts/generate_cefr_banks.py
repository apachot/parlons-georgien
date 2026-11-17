#!/usr/bin/env python3
"""Generate missing CEFR practice variants with the OpenAI Responses API.

The API key is read from OPENAI_API_KEY in the process environment. It is never
written to disk. Each generated bank is a separate JSON file discovered by the
application's normal content loader.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
MODEL = "gpt-5-mini"
LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
LEVEL_NUMBER = dict(zip(LEVELS, range(1, 7)))
WORKERS = 6
REFRESH_VOCABULARY = False

GRAMMAR_CATEGORIES = {
    "temps": "conjugaison et choix des temps",
    "preverbes": "préverbes et changements de sens des verbes",
    "cas": "cas géorgiens et déclinaisons en contexte",
    "suffixes": "suffixes, pluriel et morphologie nominale",
    "correction": "repérage et correction d’erreurs grammaticales",
}

FAMILIES = {
    "vocabulary": {
        "count": 10,
        "batch": 10,
        "schema": "Chaque entrée : {id,ka,fr,translit,pron,example,example_fr}. ka est une unité géorgienne naturelle, fr son sens exact en français, translit une translittération latine cohérente, pron une aide de prononciation en français, example une phrase géorgienne correcte et example_fr sa traduction fidèle.",
        "rules": "Choisir des mots ou expressions naturels, utiles et variés pour ce niveau ; ne pas produire de variantes morphologiques du même mot. À C1/C2, employer aussi des collocations, locutions et vocabulaire abstrait. Les phrases d’exemple doivent réellement illustrer le sens.",
    },
    "dialogues": {
        "count": 10,
        "batch": 10,
        "schema": "Chaque scène : {id,title,scene,turns}. Une scène comporte 4 à 6 tours. Un tour standard est {speaker,ka,fr}. Aux tours où l’apprenant répond, ajouter choices : au moins 3 objets {ka,fr,ok}; exactement un choix a ok=true. Les répliques et choix sont cohérents avec le contexte.",
        "rules": "Situations et formulations distinctes. Hausser le niveau par la longueur, les connecteurs, les nuances et le registre ; garder un géorgien idiomatique. Éviter que le français révèle directement la réponse géorgienne dans les choix.",
    },
    "dictation_sentences": {
        "count": 10,
        "batch": 10,
        "schema": "Chaque dictée : {id,fr,ka,answers,note}. fr est la consigne française à traduire en géorgien ; ka est la réponse géorgienne exacte ; answers est une liste incluant ka et d’éventuelles variantes orthographiques réellement acceptables ; note est une explication courte en français.",
        "rules": "Les phrases sont idiomatiques, graduées en longueur et en grammaire selon le niveau, sans translittération dans la consigne. Vérifier soigneusement l’équivalence de sens et l’orthographe géorgienne. A1 reste concret ; C1/C2 peut inclure subordination, discours rapporté et nuances de registre.",
    },
    "reading_cloze": {
        "count": 10,
        "batch": 10,
        "schema": "Chaque item : {id,sentence,answer,options,translation,explanation}. sentence est une phrase géorgienne avec exactement un ___ ; answer est le mot ou groupe géorgien manquant ; options contient exactement 4 réponses distinctes dont answer ; translation traduit la phrase complète ; explanation justifie le choix en français.",
        "rules": "Tester une notion lexicale ou grammaticale appropriée au CECRL, avec une seule réponse indiscutable. Phrases contextuelles et distinctes ; distracteurs plausibles mais faux dans cette phrase.",
    },
    "comprehension_order": {
        "count": 10,
        "batch": 10,
        "schema": "Chaque récit : {id,title,level_name,text,events,explanation}. text est un récit géorgien ; events est une liste de 4 à 6 étapes en français dans l’ordre exact du récit, formulées de manière distincte ; explanation justifie brièvement l’ordre.",
        "rules": "Récit cohérent avec des repères temporels. Adapter densité, longueur, connecteurs et inférences à chaque niveau. Ne pas faire dépendre l’ordre d’une connaissance extérieure.",
    },
    "reading_exams": {
        "count": 10,
        "batch": 2,
        "schema": "Chaque épreuve : {id,title,level_name,text,translation,questions}. text est un texte suivi en géorgien de 160 à 230 mots ; translation en français. questions contient exactement 4 objets {question,options,answer,explanation}, chacun avec 4 options françaises distinctes et une seule bonne réponse correspondant au texte.",
        "rules": "Textes originaux, longs, variés et culturellement crédibles, comme une épreuve de compréhension. Adapter vocabulaire, syntaxe, implicite et type de questions au CECRL. Les distracteurs doivent être plausibles ; éviter de reprendre la même intrigue. A1 peut être très simple mais rester un texte suivi de 160 mots environ.",
    },
    "grammar": {
        "count": 10,
        "batch": 10,
        "schema": "Chaque fiche : {id,title,level,body,examples,source}. level est le niveau CECRL sous forme A1…C2. body est une explication pédagogique concise en français. examples est une liste de 3 à 5 paires [phrase géorgienne, traduction française]. source vaut 'Contenu pédagogique original'.",
        "rules": "Une notion précise par fiche, sans inventer de règle universelle à partir d’un seul exemple. Distinguer les formes et signaler les limites utiles. Faire progresser la complexité de façon réelle selon le niveau. Les exemples doivent illustrer l’explication.",
    },
    "lessons": {
        "count": 10,
        "batch": 10,
        "schema": "Chaque mini-leçon : {id,title,tag,duration,goal,items}. duration est un entier de minutes. items contient 5 à 8 objets {ka,fr,translit,pron}; les phrases géorgiennes et traductions sont naturelles et exactes.",
        "rules": "Créer des situations et objectifs différents. Couvrir vocabulaire et structures réellement associés au niveau, de phrases simples en A1 à formulations nuancées et idiomatiques en C1/C2.",
    },
    "elearning_lessons": {
        "count": 10,
        "batch": 5,
        "schema": "Chaque cours : {id,title,level,tag,icon,goal,slides,checks,related}. level est le niveau CECRL. slides contient 4 objets {eyebrow,title,body,examples,takeaway}; examples est une liste de paires ou triplets {ka,fr,note}. checks contient des points de contrôle après les slides 2 et 4, chacun {after_slide,questions}; chaque questions contient 2 objets {prompt,options,answer,explanation} avec exactement 4 choix et une seule bonne réponse. related est une liste vide.",
        "rules": "Cours autonome, progressif et précis en français, avec des exemples géorgiens authentiques. Les questions portent uniquement sur ce qui a été enseigné dans les slides précédents ; ne jamais exiger de se souvenir d’un texte absent. Varier les notions et les activités d’un cours à l’autre.",
    },
    "grammar_exercises": {
        "count": 10,
        "batch": 10,
        "schema": "Chaque question : {id,category,prompt,options,answer,explanation}. options contient exactement 4 formulations distinctes ; answer correspond exactement à l’une d’elles.",
        "rules": "Question contextualisée et non ambiguë. La réponse correcte doit être grammaticalement exacte en géorgien ; l’explication en français indique la règle et pourquoi les distracteurs ne conviennent pas.",
    },
}


def chunks(total: int, size: int):
    start = 1
    while start <= total:
        end = min(total, start + size - 1)
        yield start, end
        start = end + 1


def prompt_for(bank: str, level: str, start: int, end: int, category: str | None = None,
               excluded_terms: set[str] | None = None) -> str:
    spec = FAMILIES[bank]
    count = end - start + 1
    category_text = f"\nCatégorie obligatoire : {category} ({GRAMMAR_CATEGORIES[category]})." if category else ""
    exclusion_text = ""
    if bank == "vocabulary" and excluded_terms:
        exclusion_text = "\nN’utilise aucun de ces mots déjà présents dans les banques : " + ", ".join(sorted(excluded_terms)) + "."
    if bank == "grammar":
        spec = dict(spec)
        spec["rules"] += " Les sujets sont: temps, préverbes, cas, suffixes, négation, accord, ordre des mots ou subordination selon le niveau."
    return (
        f"Rédige exactement {count} contenus pédagogiques originaux en géorgien standard contemporain, "
        f"destinés à des francophones de niveau CECRL {level}. Les numéros de version vont de {start} à {end}.\n"
        f"Schéma : {spec['schema']}\nConsignes : {spec['rules']}\n"
        "Chaque contenu doit avoir un id stable et distinct, un champ cefr égal au niveau demandé, "
        "et un champ version entier égal à son numéro demandé. Pour les identifiants, utilise exactement "
        f"le motif '{bank}-{level.lower()}-gen-NNN' avec NNN sur trois chiffres.\n"
        "Vérifie chaque forme géorgienne, chaque traduction, chaque corrigé et l’unicité des bonnes réponses. "
        "Retourne uniquement un objet JSON de la forme {\"items\":[...]} sans commentaire ni Markdown."
        f"{category_text}{exclusion_text}"
    )


def extract_text(response: dict) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]
    pieces = []
    for output in response.get("output", []):
        if output.get("type") != "message":
            continue
        pieces.extend(part.get("text", "") for part in output.get("content", [])
                      if part.get("type") == "output_text")
    return "\n".join(pieces)


def request_items(bank: str, level: str, start: int, end: int, category: str | None = None,
                  excluded_terms: set[str] | None = None):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY est absent de l’environnement.")
    user_prompt = prompt_for(bank, level, start, end, category, excluded_terms)
    payload = json.dumps({
        "model": MODEL,
        "instructions": "Tu es un concepteur de ressources pédagogiques expert en géorgien et en CECRL. La justesse linguistique et la validité des corrigés priment sur l’originalité.",
        "input": user_prompt,
        "max_output_tokens": 16000,
        "reasoning": {"effort": "low"},
        "text": {"format": {"type": "json_object"}},
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request("https://api.openai.com/v1/responses", data=payload,
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=240) as response:
                result = json.load(response)
            parsed = json.loads(extract_text(result))
            items = parsed.get("items")
            if not isinstance(items, list) or len(items) != end - start + 1:
                raise ValueError(f"Réponse JSON: {len(items) if isinstance(items, list) else 'items absent'}, attendu {end-start+1}.")
            for offset, item in enumerate(items, start=start):
                if not isinstance(item, dict):
                    raise ValueError("Un contenu généré n’est pas un objet JSON.")
                category_slug = f"-{category}" if category else ""
                item["id"] = f"{bank}-{level.lower()}{category_slug}-gen-{offset:03d}"
                item["cefr"] = level
                item["version"] = offset
                if bank == "grammar_exercises":
                    item["category"] = category
            validate_item(bank, item)
            return items
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
            if attempt == 3:
                raise RuntimeError(f"{bank}/{level}/{start}-{end}: {exc}") from exc
            time.sleep(2 ** attempt)
    raise RuntimeError("Nombre de tentatives épuisé.")


def validate_item(bank: str, item: dict):
    required = {
        "vocabulary": ("ka", "fr", "translit", "pron", "example", "example_fr"),
        "dialogues": ("title", "scene", "turns"),
        "dictation_sentences": ("fr", "ka", "answers", "note"),
        "reading_cloze": ("sentence", "answer", "options", "translation", "explanation"),
        "comprehension_order": ("title", "level_name", "text", "events", "explanation"),
        "reading_exams": ("title", "level_name", "text", "translation", "questions"),
        "grammar": ("title", "level", "body", "examples", "source"),
        "lessons": ("title", "tag", "duration", "goal", "items"),
        "elearning_lessons": ("title", "level", "tag", "goal", "slides", "checks", "related"),
        "grammar_exercises": ("category", "prompt", "options", "answer", "explanation"),
    }[bank]
    missing = [field for field in required if field not in item]
    if missing:
        raise ValueError(f"{item.get('id')}: champs absents {missing}")
    if not all(isinstance(item[field], str) and item[field].strip() for field in required
               if field not in {"options", "answers", "events", "questions", "items", "turns", "examples", "slides", "checks", "related", "duration"}):
        raise ValueError(f"{item.get('id')}: champ textuel vide ou mal formé")
    if bank == "grammar_exercises" and (len(item["options"]) != 4 or item["answer"] not in item["options"]):
        raise ValueError(f"{item['id']}: QCM de grammaire invalide")
    if bank == "reading_cloze" and (len(item["options"]) != 4 or item["answer"] not in item["options"] or item["sentence"].count("___") != 1):
        raise ValueError(f"{item['id']}: phrase à trous invalide")
    if bank == "reading_exams":
        if len(item["questions"]) != 4:
            raise ValueError(f"{item['id']}: une épreuve doit avoir 4 questions")
        for question in item["questions"]:
            if len(question.get("options", [])) != 4 or question.get("answer") not in question.get("options", []):
                raise ValueError(f"{item['id']}: question d’épreuve invalide")
    if bank == "elearning_lessons":
        if len(item["slides"]) != 4 or not {2, 4}.issubset({check.get("after_slide") for check in item["checks"]}):
            raise ValueError(f"{item['id']}: structure de cours invalide")


def tasks():
    def already_complete(family, level, start, end, category=None):
        path = CONTENT / f"{family}_gpt5mini_{level.lower()}.json"
        if not path.is_file():
            return False
        try:
            items = json.loads(path.read_text(encoding="utf-8")).get("items", [])
        except (OSError, json.JSONDecodeError):
            return False
        ids = {item.get("id") for item in items if isinstance(item, dict)}
        category_slug = f"-{category}" if category else ""
        expected = {f"{family}-{level.lower()}{category_slug}-gen-{n:03d}"
                    for n in range(start, end + 1)}
        return expected.issubset(ids)

    for family in FAMILIES:
        if family == "grammar_exercises":
            continue
        for level in LEVELS:
            for start, end in chunks(FAMILIES[family]["count"], FAMILIES[family]["batch"]):
                if not already_complete(family, level, start, end):
                    yield family, level, start, end, None
    for category in GRAMMAR_CATEGORIES:
        for level in LEVELS:
            for start, end in chunks(10, 10):
                if not already_complete("grammar_exercises", level, start, end, category):
                    yield "grammar_exercises", level, start, end, category


def write_family(family: str, level: str, items: list[dict], replace: bool = False):
    path = CONTENT / f"{family}_gpt5mini_{level.lower()}.json"
    if path.exists() and not replace:
        existing = json.loads(path.read_text(encoding="utf-8"))
        old = existing.get("items", [])
        merged = {item["id"]: item for item in old}
        merged.update({item["id"]: item for item in items})
        items = list(merged.values())
    path.write_text(json.dumps({"cefr": level, "items": items}, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def existing_vocabulary_terms() -> set[str]:
    terms = set()
    for path in [CONTENT / "vocabulary.json", *sorted(CONTENT.glob("vocabulary_gpt5mini_*.json"))]:
        try:
            bank = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        fields = bank.get("fields")
        for entry in bank.get("items", []):
            if isinstance(entry, dict):
                term = entry.get("ka")
            elif fields and isinstance(entry, list):
                term = dict(zip(fields, entry)).get("ka")
            else:
                term = None
            if isinstance(term, str) and term.strip():
                canonical = "".join(char for char in term.casefold() if char.isalpha())
                if canonical:
                    terms.add(canonical)
    return terms


def main():
    global REFRESH_VOCABULARY
    REFRESH_VOCABULARY = "--refresh-vocabulary" in sys.argv
    if "--list" in sys.argv:
        print(f"{len(list(tasks()))} generation batches; model={MODEL}; {len(FAMILIES)} banks plus 5 grammar categories × 6 levels")
        return
    grouped: dict[tuple[str, str], list[dict]] = {}
    if REFRESH_VOCABULARY:
        excluded = existing_vocabulary_terms()
        print("Renouvellement des 60 fiches de vocabulaire sans doublons…", flush=True)
        for level in LEVELS:
            items = request_items("vocabulary", level, 1, 10, excluded_terms=excluded)
            write_family("vocabulary", level, items, replace=True)
            excluded.update("".join(char for char in item["ka"].casefold() if char.isalpha())
                            for item in items)
            grouped[("vocabulary", level)] = items
            print(f"OK vocabulary {level} · 10 mots distincts", flush=True)
    task_list = list(tasks())
    print(f"Démarrage : {len(task_list)} lots avec {MODEL}.", flush=True)
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as executor:
        future_map = {
            executor.submit(request_items, family, level, start, end, category):
            (family, level, start, end, category)
            for family, level, start, end, category in task_list
        }
        for done, future in enumerate(concurrent.futures.as_completed(future_map), 1):
            family, level, start, end, category = future_map[future]
            key = (family, level)
            try:
                items = future.result()
                grouped.setdefault(key, []).extend(items)
                write_family(family, level, grouped[key])
                suffix = f"/{category}" if category else ""
                print(f"[{done}/{len(task_list)}] OK {family}{suffix} {level} v{start:03d}–{end:03d}", flush=True)
            except Exception as exc:
                failures.append((family, level, start, end, category, str(exc)))
                print(f"[{done}/{len(task_list)}] ÉCHEC {family}/{level}/{start}-{end}: {exc}", flush=True)
    for (family, level), items in grouped.items():
        write_family(family, level, items)
    if failures:
        print(f"Génération partielle : {len(failures)} lots en échec ; contenus valides sauvegardés.", flush=True)
        return 1
    print(f"Terminé : {sum(map(len, grouped.values()))} contenus enregistrés dans {len(grouped)} fichiers.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
