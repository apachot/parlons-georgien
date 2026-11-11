import json
import os
import random
from pathlib import Path
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, render_template, request, send_file
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from .tts import audio_name, normalise_speech

db = SQLAlchemy()
ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"


def utc_now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Progress(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.String(100), unique=True, nullable=False)
    kind = db.Column(db.String(30), nullable=False, default="vocabulary")
    seen = db.Column(db.Integer, nullable=False, default=0)
    correct = db.Column(db.Integer, nullable=False, default=0)
    streak = db.Column(db.Integer, nullable=False, default=0)
    due_at = db.Column(db.DateTime, nullable=True)
    last_answer = db.Column(db.Boolean, nullable=True)


class LessonCompletion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    lesson_id = db.Column(db.String(100), unique=True, nullable=False)
    completed_at = db.Column(db.DateTime, nullable=False, server_default=func.now())
    score = db.Column(db.Integer, nullable=False, default=0)


def load_content(name):
    with (CONTENT / f"{name}.json").open(encoding="utf-8") as f:
        data = json.load(f)
    if name == "vocabulary" and isinstance(data, dict):
        items = [dict(zip(data["fields"], row)) for row in data["items"]]
        for item in items:
            if item["id"] in data.get("accepted", {}):
                item["answers"] = list(dict.fromkeys([item["fr"], *data["accepted"][item["id"]]]))
        uncertain = set(data.get("uncertain_ids", []))
        return [item for item in items if item["id"] not in uncertain]
    return data


def build_lesson_questions(items):
    """Create two-way retrieval questions for every phrase in a lesson."""
    unique_items = list({(item["ka"], item["fr"]): item for item in items}.values())
    georgian_options = list(dict.fromkeys(item["ka"] for item in unique_items))
    french_options = list(dict.fromkeys(item["fr"] for item in unique_items))
    questions = []
    for item in unique_items:
        questions.append({
            "direction": "ka-fr", "prompt": item["ka"], "answer": item["fr"],
            "lang": "ka", "options": french_options,
        })
        questions.append({
            "direction": "fr-ka", "prompt": item["fr"], "answer": item["ka"],
            "lang": "fr", "options": georgian_options,
        })
    return questions


def dictation_words():
    """Use only single-word entries from the reviewed vocabulary list."""
    return [item for item in load_content("vocabulary")
            if len(normalise(item["ka"]).split()) == 1]


def reading_texts():
    return load_content("readings")


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.environ.get("FLASK_SECRET_KEY", "georgien-local-dev"),
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{ROOT / 'instance' / 'georgien.db'}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    if test_config:
        app.config.update(test_config)
    db.init_app(app)

    with app.app_context():
        Path(app.instance_path).mkdir(parents=True, exist_ok=True)
        db.create_all()

    @app.get("/")
    def home():
        vocab = load_content("vocabulary")
        lessons = load_content("lessons")
        done = {row.lesson_id for row in LessonCompletion.query.all()}
        due = Progress.query.filter(Progress.kind == "vocabulary", Progress.due_at <= func.now()).count()
        practiced = Progress.query.filter_by(kind="vocabulary").count()
        total = len(vocab)
        word_by_id = {word["id"]: word for word in vocab}
        errors = [{"word": word_by_id.get(row.item_id, {}).get("ka", row.item_id),
                   "fr": word_by_id.get(row.item_id, {}).get("fr", ""),
                   "count": row.seen - row.correct}
                  for row in Progress.query.filter(Progress.kind == "vocabulary", Progress.seen > Progress.correct)
                  .order_by((Progress.seen - Progress.correct).desc()).limit(3).all()]
        return render_template("index.html", lessons=lessons, done=done, due=due,
                               practiced=practiced, total=total,
                               percent=round(practiced * 100 / max(total, 1)), errors=errors)

    @app.get("/alphabet")
    def alphabet():
        return render_template("alphabet.html", letters=load_content("alphabet"))

    @app.get("/lesson/<lesson_id>")
    def lesson(lesson_id):
        lessons = load_content("lessons")
        selected = next((item for item in lessons if item["id"] == lesson_id), None)
        if selected is None:
            return render_template("not_found.html"), 404
        return render_template("lesson.html", lesson=selected,
                               questions=build_lesson_questions(selected["items"]))

    @app.get("/vocabulary")
    def vocabulary():
        vocab = load_content("vocabulary")
        return render_template("vocabulary.html", vocab=vocab)

    @app.get("/grammar")
    def grammar():
        return render_template("grammar.html", cards=load_content("grammar"))

    @app.get("/dialogues")
    def dialogues():
        return render_template("dialogues.html", dialogues=load_content("dialogues"))

    @app.get("/session")
    def session():
        return render_template("session.html")

    @app.get("/dictations")
    def dictations():
        return render_template("dictations.html", total=len(dictation_words()))

    @app.get("/reading")
    def reading():
        return render_template("reading.html", total=len(reading_texts()))

    @app.get("/api/reading/next")
    def next_reading():
        try:
            level = int(request.args.get("level", "1"))
        except ValueError:
            return jsonify({"error": "Niveau invalide."}), 400
        if level not in range(1, 5):
            return jsonify({"error": "Niveau invalide."}), 400
        items = [item for item in reading_texts() if item["level"] == level]
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [item for item in items if item["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True, "level": level})
        progress = {row.item_id.removeprefix("reading:"): row
                    for row in Progress.query.filter_by(kind="reading").all()}
        now = utc_now_naive()
        due = [item for item in candidates
               if item["id"] in progress and progress[item["id"]].due_at
               and progress[item["id"]].due_at <= now]
        unseen = [item for item in candidates if item["id"] not in progress]
        selected = random.choice(due or unseen or candidates)
        return jsonify({key: selected[key] for key in
                        ("id", "level", "level_name", "text", "question", "options")})

    @app.post("/api/reading/answer")
    def answer_reading():
        data = request.get_json(silent=True) or {}
        item_id = str(data.get("id", ""))
        item = next((entry for entry in reading_texts() if entry["id"] == item_id), None)
        if item is None:
            return jsonify({"error": "Texte inconnu."}), 404
        correct = data.get("answer") == item["answer"]
        progress_id = f"reading:{item_id}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="reading", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(correct)
        row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        days = 0 if not correct else (1 if row.streak <= 1 else min(30, 2 ** min(row.streak, 5)))
        row.due_at = utc_now_naive() + timedelta(minutes=10 if days == 0 else 1440 * days)
        db.session.commit()
        return jsonify({"correct": correct, "translation": item["translation"],
                        "explanation": item["explanation"], "level": item["level"],
                        "seen": row.seen, "correct_count": row.correct,
                        "due_in_days": days})

    @app.get("/api/dictations/next")
    def next_dictation():
        words = dictation_words()
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [word for word in words if word["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True, "total": len(words)})
        progress = {row.item_id.removeprefix("dictation:"): row
                    for row in Progress.query.filter_by(kind="dictation").all()}
        now = utc_now_naive()
        due = [word for word in candidates
               if word["id"] in progress and progress[word["id"]].due_at
               and progress[word["id"]].due_at <= now]
        unseen = [word for word in candidates if word["id"] not in progress]
        selected = random.choice(due or unseen or candidates)
        return jsonify({"id": selected["id"], "total": len(words)})

    @app.get("/api/dictations/audio/<item_id>")
    def dictation_audio(item_id):
        item = next((word for word in dictation_words() if word["id"] == item_id), None)
        if item is None:
            return jsonify({"error": "Mot inconnu."}), 404
        path = Path(app.instance_path) / "audio" / "ka" / audio_name("ka", item["ka"])
        if not path.is_file():
            return jsonify({"error": "Audio indisponible pour ce mot."}), 404
        return send_file(path, mimetype="audio/wav", conditional=True, max_age=86400)

    @app.post("/api/dictations/answer")
    def answer_dictation():
        data = request.get_json(silent=True) or {}
        item_id = str(data.get("id", ""))
        item = next((word for word in dictation_words() if word["id"] == item_id), None)
        if item is None:
            return jsonify({"error": "Mot de dictée inconnu."}), 404
        correct = normalise(data.get("answer", "")) == normalise(item["ka"])
        progress_id = f"dictation:{item_id}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="dictation", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(correct)
        row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        days = 0 if not correct else (1 if row.streak <= 1 else min(30, 2 ** min(row.streak, 5)))
        row.due_at = utc_now_naive() + timedelta(minutes=10 if days == 0 else 1440 * days)
        db.session.commit()
        return jsonify({"correct": correct, "solution": item["ka"], "fr": item["fr"],
                        "translit": item["translit"], "seen": row.seen,
                        "correct_count": row.correct, "due_in_days": days})

    @app.get("/api/quiz")
    def quiz():
        if request.args.get("kind") == "alphabet":
            letters = load_content("alphabet")
            letter = random.choice(letters)
            choices = [letter["letter"]] + [x["letter"] for x in random.sample([x for x in letters if x["id"] != letter["id"]], 3)]
            return jsonify({"id": letter["id"], "kind": "alphabet", "prompt": letter["sound"],
                            "choices": choices, "answer": letter["letter"], "note": letter["note"]})
        vocab = load_content("vocabulary")
        due_ids = {p.item_id for p in Progress.query.filter(Progress.due_at <= func.now()).all()}
        due_vocab = [w for w in vocab if w["id"] in due_ids]
        candidates = due_vocab or vocab
        mode = request.args.get("mode", "mixed")
        if mode == "review" and not due_vocab:
            return jsonify({"empty": True, "message": "Toutes les révisions sont à jour. Bravo !"})
        excluded = set(request.args.get("exclude", "").split(","))
        exercise = request.args.get("exercise", "mcq")
        if exercise == "order":
            candidates = [w for w in candidates if len(w["example"].split()) > 1] or [w for w in vocab if len(w["example"].split()) > 1]
        available = [w for w in candidates if w["id"] not in excluded]
        if not available and mode == "review":
            return jsonify({"empty": True, "message": "Toutes les révisions sont à jour. Bravo !"})
        if not available:
            available = [w for w in vocab if w["id"] not in excluded]
        if not available:
            return jsonify({"empty": True, "message": "Vous avez parcouru tous les mots."})
        word = random.choice(available)
        others = random.sample([w for w in vocab if w["id"] != word["id"]], 3)
        choices = [word["fr"]] + [w["fr"] for w in others]
        prompt = word["ka"]
        if exercise in ("type", "match"):
            prompt = word["fr"]
            choices = [word["ka"]] + [w["ka"] for w in others]
        elif exercise == "order":
            prompt = word["example_fr"]
            choices = word["example"].split()
        return jsonify({"id": word["id"], "kind": exercise if exercise != "mcq" else "vocabulary", "prompt": prompt,
                        "fr": word["fr"], "translit": word["translit"], "pron": word["pron"],
                        "example": word["example"], "example_fr": word["example_fr"],
                        "choices": choices, "answer": word["fr"], "mode": mode,
                        "exercise": exercise, "question": prompt,
                        "order_words": choices if exercise == "order" else []})

    @app.get("/api/alphabet/keys")
    def alphabet_keys():
        return jsonify([item["letter"] for item in load_content("alphabet")])

    @app.post("/api/answer")
    def answer():
        data = request.get_json(force=True)
        item_id = data.get("id", "")
        kind = data.get("kind", "vocabulary")
        if kind in ("vocabulary", "type", "match", "order"):
            item = next((w for w in load_content("vocabulary") if w["id"] == item_id), None)
            if not item:
                return jsonify({"error": "Élément inconnu"}), 404
            expected = item["example"] if kind == "order" else item["ka"] if kind in ("type", "match") else item["fr"]
            accepted_values = item.get("answers", [expected]) if kind == "vocabulary" else [expected]
            accepted = [normalise(x) for x in accepted_values]
            ok = normalise(data.get("answer", "")) in accepted
        else:
            item = next((x for x in load_content("alphabet") if x["id"] == item_id), None)
            if not item:
                return jsonify({"error": "Élément inconnu"}), 404
            ok = normalise(data.get("answer", "")) in [normalise(item["letter"]), normalise(item["sound"])]
        quality = int(data.get("quality", 4 if ok else 1))
        quality = max(0, min(5, quality))
        row = Progress.query.filter_by(item_id=item_id).first()
        if row is None:
            row = Progress(item_id=item_id, kind="vocabulary" if kind in ("type", "match", "order") else kind,
                           seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(ok)
        row.last_answer = ok
        row.streak = row.streak + 1 if ok else 0
        # Intervalle pratique inspiré de la répétition espacée : difficile = retour rapide.
        days = 0 if quality < 3 else (1 if row.streak <= 1 else min(30, 2 ** min(row.streak, 5)))
        row.due_at = utc_now_naive() + timedelta(minutes=10 if days == 0 else 1440 * days)
        db.session.commit()
        solution = item.get("example" if kind == "order" else "ka" if kind in ("type", "match") else "fr", item.get("letter"))
        return jsonify({"correct": ok, "solution": solution,
                        "explanation": item.get("note", "Bonne réponse !" if ok else "Observe la forme et réessaie."),
                        "due_in_days": days})

    @app.post("/api/difficulty/<item_id>")
    def set_difficulty(item_id):
        data = request.get_json(force=True)
        quality = max(0, min(5, int(data.get("quality", 3))))
        row = Progress.query.filter_by(item_id=item_id).first()
        if row is None:
            return jsonify({"error": "Réponse inconnue"}), 404
        days = 0 if quality < 3 else 1 if quality < 5 else min(30, 2 ** min(max(row.streak, 1), 5))
        row.due_at = utc_now_naive() + timedelta(minutes=10 if days == 0 else 1440 * days)
        db.session.commit()
        return jsonify({"saved": True, "due_in_days": days, "quality": quality})

    @app.post("/api/complete/<lesson_id>")
    def complete(lesson_id):
        score = int((request.get_json(silent=True) or {}).get("score", 100))
        row = LessonCompletion.query.filter_by(lesson_id=lesson_id).first()
        if row is None:
            row = LessonCompletion(lesson_id=lesson_id)
            db.session.add(row)
        row.score = max(0, min(score, 100))
        db.session.commit()
        return jsonify({"saved": True, "score": row.score})

    @app.get("/api/progress")
    def progress():
        rows = Progress.query.all()
        due = sum(1 for r in rows if r.due_at and r.due_at <= utc_now_naive())
        return jsonify({"items_seen": len(rows), "correct": sum(r.correct for r in rows),
                        "answers": sum(r.seen for r in rows), "due": due,
                        "lessons_completed": LessonCompletion.query.count(),
                        "errors": [{"id": r.item_id, "kind": r.kind, "seen": r.seen,
                                    "correct": r.correct} for r in rows if r.last_answer is False]})

    @app.post("/api/audio")
    def lesson_audio():
        payload = request.get_json(silent=True) or {}
        language = payload.get("lang")
        text = normalise_speech(payload.get("text", ""))
        if language not in {"ka", "fr"} or not text or len(text) > 500:
            return jsonify({"error": "Demande audio invalide."}), 400
        try:
            filename = audio_name(language, text)
        except ValueError:
            return jsonify({"error": "Langue audio inconnue."}), 400
        path = Path(app.instance_path) / "audio" / language / filename
        if not path.is_file():
            return jsonify({"error": "Cet extrait audio n’a pas encore été généré."}), 404
        return send_file(path, mimetype="audio/wav", conditional=True, max_age=86400)

    @app.get("/export")
    def export_progress():
        data = {"exported_at": utc_now_naive().isoformat() + "Z",
                "progress": [{"id": r.item_id, "kind": r.kind, "seen": r.seen,
                              "correct": r.correct, "streak": r.streak,
                              "due_at": r.due_at.isoformat() if r.due_at else None,
                              "last_answer": r.last_answer} for r in Progress.query.all()],
                "lessons": [{"id": x.lesson_id, "score": x.score,
                             "completed_at": x.completed_at.isoformat()} for x in LessonCompletion.query.all()]}
        path = Path(app.instance_path) / "progress-export.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return send_file(path, as_attachment=True, download_name="ma-progression-georgien.json")

    return app


def normalise(value):
    import re
    return re.sub(r"[\s.!?,;:’'\-]+", " ", str(value).strip().casefold()).strip()
