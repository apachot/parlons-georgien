import json
import os
import random
from pathlib import Path
from datetime import datetime, timedelta, timezone
from functools import wraps
import hmac
import html
import re
import secrets
import smtplib
import ssl
import threading
import unicodedata
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

from flask import Flask, current_app, flash, g, jsonify, redirect, render_template, request, send_file, session as flask_session, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, inspect, text
from sqlalchemy.exc import IntegrityError
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash
from .tts import audio_name, normalise_speech
from .crossword import build_crossword

db = SQLAlchemy()
ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
CEFR_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
READING_LEVEL_NUMBERS = {"a1": 1, "a2": 3, "b1": 4, "b2": 5, "c1": 6, "c2": 7}
_CONTENT_BANK_CACHE = {}
_CONTENT_BANK_CACHE_LOCK = threading.RLock()


def utc_now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def instance_secret(instance_path):
    configured = os.environ.get("FLASK_SECRET_KEY")
    if configured:
        return configured
    key_file = Path(instance_path) / ".session-secret"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    try:
        return key_file.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        value = secrets.token_urlsafe(64)
        try:
            with key_file.open("x", encoding="utf-8") as stream:
                stream.write(value)
            key_file.chmod(0o600)
            return value
        except FileExistsError:
            return key_file.read_text(encoding="utf-8").strip()


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


class User(db.Model):
    __tablename__ = "user_account"
    id = db.Column(db.Integer, primary_key=True)
    display_name = db.Column(db.String(80), nullable=False)
    display_name_key = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(254), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    email_verified = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    verification_sent_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, server_default=func.now())
    last_login_at = db.Column(db.DateTime, nullable=True)


class AccountProgress(db.Model):
    __tablename__ = "account_progress"
    __table_args__ = (db.UniqueConstraint("user_id", "item_id", name="uq_account_progress_item"),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = db.Column(db.String(100), nullable=False)
    kind = db.Column(db.String(30), nullable=False, default="vocabulary")
    seen = db.Column(db.Integer, nullable=False, default=0)
    correct = db.Column(db.Integer, nullable=False, default=0)
    streak = db.Column(db.Integer, nullable=False, default=0)
    due_at = db.Column(db.DateTime, nullable=True)
    last_answer = db.Column(db.Boolean, nullable=True)


class AccountLessonCompletion(db.Model):
    __tablename__ = "account_lesson_completion"
    __table_args__ = (db.UniqueConstraint("user_id", "lesson_id", name="uq_account_lesson"),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False, index=True)
    lesson_id = db.Column(db.String(100), nullable=False)
    completed_at = db.Column(db.DateTime, nullable=False, server_default=func.now())
    score = db.Column(db.Integer, nullable=False, default=0)


class AccountData(db.Model):
    __tablename__ = "account_data"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False, unique=True)
    learning_profile = db.Column(db.JSON, nullable=False, default=dict)
    browser_data = db.Column(db.JSON, nullable=False, default=dict)
    updated_at = db.Column(db.DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


def migrate_account_schema():
    """Add account verification fields and enforce case-insensitive display-name uniqueness."""
    columns = {column["name"] for column in inspect(db.engine).get_columns("user_account")}
    with db.engine.begin() as connection:
        if "display_name_key" not in columns:
            connection.execute(text("ALTER TABLE user_account ADD COLUMN display_name_key VARCHAR(160)"))
        if "email_verified" not in columns:
            # Accounts predating verification remain usable; only new registrations need confirmation.
            connection.execute(text("ALTER TABLE user_account ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT 1"))
        if "verification_sent_at" not in columns:
            connection.execute(text("ALTER TABLE user_account ADD COLUMN verification_sent_at DATETIME"))
        rows = connection.execute(text("SELECT id, display_name FROM user_account ORDER BY id")).mappings().all()
        reserved = {unicodedata.normalize("NFKC", (row["display_name"] or "Utilisateur").strip()).casefold()
                    for row in rows}
        seen = set()
        for row in rows:
            name = (row["display_name"] or "Utilisateur").strip() or "Utilisateur"
            key = unicodedata.normalize("NFKC", name).casefold()
            if key in seen:
                base_name = name[:76]
                suffix = 2
                while unicodedata.normalize("NFKC", f"{base_name}{suffix}").casefold() in reserved:
                    suffix += 1
                name = f"{base_name}{suffix}"
                key = unicodedata.normalize("NFKC", name).casefold()
                reserved.add(key)
            connection.execute(text("UPDATE user_account SET display_name = :name, display_name_key = :key WHERE id = :id"),
                               {"name": name, "key": key, "id": row["id"]})
            seen.add(key)
        connection.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_account_display_name_key "
            "ON user_account (display_name_key)"
        ))


class _AccountScopedProxy:
    def __init__(self, guest_model, account_model):
        self.guest_model = guest_model
        self.account_model = account_model

    def _model(self):
        return self.account_model if getattr(g, "account", None) else self.guest_model

    @property
    def query(self):
        query = self._model().query
        return query.filter_by(user_id=g.account.id) if getattr(g, "account", None) else query

    def __getattr__(self, name):
        return getattr(self._model(), name)

    def __call__(self, *args, **kwargs):
        if getattr(g, "account", None):
            kwargs["user_id"] = g.account.id
        return self._model()(*args, **kwargs)


Progress = _AccountScopedProxy(Progress, AccountProgress)
LessonCompletion = _AccountScopedProxy(LessonCompletion, AccountLessonCompletion)


def content_files(name):
    """Return a content bank and its automatically discovered additions."""
    base = CONTENT / f"{name}.json"
    files = ([base] if base.is_file() else [])
    variants = sorted(CONTENT.glob(f"{name}_*.json"))
    excluded_prefixes = {
        "alphabet": ("alphabet_recognition",),
        "grammar": ("grammar_exercises",),
        "vocabulary": ("vocabulary_images",),
    }.get(name, ())
    variants = [path for path in variants
                if not any(path.stem == prefix or path.stem.startswith(f"{prefix}_")
                           for prefix in excluded_prefixes)]
    files.extend(path for path in variants if path.is_file())
    if not files:
        raise FileNotFoundError(f"Aucun fichier JSON trouvé pour la banque « {name} ».")
    return files


def _content_cefr_values(value, path):
    levels = [value] if isinstance(value, str) else value
    if not isinstance(levels, list) or not levels or any(level not in CEFR_LEVELS for level in levels):
        raise ValueError(f"{path.name}: le champ 'cefr' doit contenir un niveau ou une liste de niveaux CECRL valides.")
    return list(dict.fromkeys(levels))


def load_content(name):
    """Load a JSON bank, caching parsed files until their directory contents change."""
    files = content_files(name)
    signature = tuple(
        (str(path), path.stat().st_mtime_ns, path.stat().st_size)
        for path in files
    )
    with _CONTENT_BANK_CACHE_LOCK:
        cached = _CONTENT_BANK_CACHE.get(name)
        if cached and cached[0] == signature:
            return list(cached[1])

        combined = []
        seen_ids = set()
        for path in files:
            with path.open(encoding="utf-8") as stream:
                bank = json.load(stream)
            if not isinstance(bank, dict) or "cefr" not in bank or not isinstance(bank.get("items"), list):
                raise ValueError(f"{path.name}: attendu un objet JSON avec les champs 'cefr' et 'items'.")
            levels = _content_cefr_values(bank["cefr"], path)
            if "fields" in bank:
                items = [dict(zip(bank["fields"], row)) for row in bank["items"]]
            else:
                items = bank["items"]

            accepted = bank.get("accepted", {})
            uncertain = set(bank.get("uncertain_ids", []))
            reading_match = re.fullmatch(r"reading_(a1|a2|b1|b2|c1|c2)(?:_.*)?", path.stem)
            for item in items:
                if not isinstance(item, dict):
                    raise ValueError(f"{path.name}: chaque entrée de 'items' doit être un objet JSON.")
                item = dict(item)
                item.setdefault("_content_pack", path.stem)
                if len(levels) == 1:
                    item.setdefault("cefr", levels[0])
                if "cefr" in item:
                    item_levels = _content_cefr_values(item["cefr"], path)
                    if len(item_levels) != 1:
                        raise ValueError(f"{path.name}: le champ 'cefr' d’un élément doit contenir un niveau unique.")
                    item["cefr"] = item_levels[0]
                if reading_match:
                    item.setdefault("level", READING_LEVEL_NUMBERS[reading_match.group(1)])
                if name == "vocabulary" and item["id"] in accepted:
                    item["answers"] = list(dict.fromkeys([item["fr"], *accepted[item["id"]]]))
                if item.get("id"):
                    if item["id"] in seen_ids:
                        raise ValueError(f"Identifiant de contenu dupliqué « {item['id']} » dans la banque « {name} ».")
                    seen_ids.add(item["id"])
                if name == "vocabulary" and item["id"] in uncertain:
                    continue
                combined.append(item)

        _CONTENT_BANK_CACHE[name] = (signature, tuple(combined))
        return list(combined)


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
    items = [dict(item) for bank in (
        "readings", "reading_a1", "reading_a2", "reading_b1", "reading_b2", "reading_c1", "reading_c2"
    ) for item in load_content(bank)]
    cefr_by_step = {1: "A1", 2: "A1", 3: "A2", 4: "B1", 5: "B2", 6: "C1", 7: "C2"}
    step_by_cefr = {"A1": 1, "A2": 3, "B1": 4, "B2": 5, "C1": 6, "C2": 7}
    for item in items:
        if "level" not in item and item.get("cefr") in step_by_cefr:
            item["level"] = step_by_cefr[item["cefr"]]
        item.setdefault("cefr", cefr_by_step.get(item.get("level"), "A1"))
    return items

def reading_exam_texts():
    items = [dict(item) for item in load_content("reading_exams")]
    for item in items:
        if "cefr" not in item:
            item["cefr"] = item.get("level_name", "").split(" · ", 1)[0]
    return items

def grammar_exercises():
    return load_content("grammar_exercises")


def selected_practice_level(items):
    level = request.args.get("practice_cefr", "").upper()
    if level not in CEFR_LEVELS:
        return items
    return [item for item in items if str(item.get("cefr", "")).upper() == level]


def selected_version(items, bank):
    """Restrict a next-question API to a version selected in the content catalogue."""
    if request.args.get("bank") == bank:
        level = request.args.get("cefr", "").upper()
        version = request.args.get("version", "")
        items = [item for item in items
                 if item.get("cefr", "").upper() == level
                 and str(item.get("version", item.get("_content_pack", ""))) == version]
    return selected_practice_level(items)


def version_catalog(section):
    """Build the section's catalogue from versioned JSON banks on disk."""
    sources = {
        "alphabet": [("alphabet_recognition", "Reconnaître un son", "#alphabet-practice")],
        "vocabulary": [("vocabulary", "Jeux de vocabulaire", "#vocabulary-games")],
        "session": [("vocabulary", "Révision du vocabulaire", "#quiz")],
        "reading": [("reading_a1", "Lecture guidée", "#reading"),
                    ("reading_a2", "Lecture guidée", "#reading"),
                    ("reading_b1", "Lecture guidée", "#reading"),
                    ("reading_b2", "Lecture guidée", "#reading"),
                    ("reading_c1", "Lecture guidée", "#reading"),
                    ("reading_c2", "Lecture guidée", "#reading"),
                    ("reading_cloze", "Phrases à trous", "#reading-cloze"),
                    ("reading_exams", "Étude de texte", "#reading-exam")],
        "comprehension": [("reading_a1", "Écoute pas à pas", "#reading"),
                          ("reading_a2", "Écoute pas à pas", "#reading"),
                          ("reading_b1", "Écoute pas à pas", "#reading"),
                          ("reading_b2", "Écoute pas à pas", "#reading"),
                          ("reading_c1", "Écoute pas à pas", "#reading"),
                          ("reading_c2", "Écoute pas à pas", "#reading"),
                          ("reading_exams", "Épreuve orale", "#reading-exam"),
                          ("comprehension_order", "Remettre un récit en ordre", "#comprehension-order")],
        "dictation": [("dictation_sentences", "Traduire des phrases", "#dictation-sentences")],
        "grammar": [("grammar_exercises", "Quiz de grammaire", "#grammar-quiz")],
        "dialogues": [("dialogues", "Scènes et répliques", "#dialogue-flash")],
        "lesson": [("elearning_lessons", "Leçons interactives", None),
                   ("lessons", "Leçons de vocabulaire", None)],
    }
    groups = {}
    for bank_name, label, target in sources.get(section, []):
        for path in content_files(bank_name):
            with path.open(encoding="utf-8") as stream:
                data = json.load(stream)
            items = data.get("items", [])
            if data.get("fields"):
                items = [dict(zip(data["fields"], row)) for row in items]
            for item in items:
                if not isinstance(item, dict):
                    continue
                cefr = str(item.get("cefr", data.get("cefr", "A1"))).upper()
                if cefr not in CEFR_LEVELS:
                    continue
                version = item.get("version")
                key = (bank_name, cefr, version if version is not None else path.stem)
                entry = groups.setdefault(key, {"bank": bank_name, "level": cefr,
                    "version": version if version is not None else path.stem,
                    "title": label, "count": 0, "target": target, "item": item})
                entry["count"] += 1
                if item.get("title"):
                    entry["title"] = item["title"]
    return sorted(groups.values(), key=lambda row: (row["level"], row["title"], str(row["version"])))


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=instance_secret(app.instance_path),
        SQLALCHEMY_DATABASE_URI=f"sqlite:///{ROOT / 'instance' / 'georgien.db'}",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        MAX_CONTENT_LENGTH=2_000_000,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "1") == "1",
        SMTP_HOST=os.environ.get("SMTP_HOST", ""),
        SMTP_PORT=int(os.environ.get("SMTP_PORT", "587")),
        SMTP_USE_TLS=os.environ.get("SMTP_USE_TLS", "1").strip().lower() in {"1", "true", "yes", "on"},
        SMTP_USERNAME=os.environ.get("SMTP_USERNAME", ""),
        SMTP_PASSWORD=os.environ.get("SMTP_PASSWORD", ""),
        MAIL_FROM=os.environ.get("MAIL_FROM", ""),
    )
    if test_config:
        app.config.update(test_config)
    db.init_app(app)

    @app.after_request
    def cache_static_assets(response):
        if request.endpoint == "static":
            response.vary.discard("Cookie")
            if ".v1." in request.path:
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    with app.app_context():
        Path(app.instance_path).mkdir(parents=True, exist_ok=True)
        db.create_all()
        migrate_account_schema()

    @app.before_request
    def load_logged_in_account():
        if request.endpoint == "static":
            g.account = None
            return
        account_id = flask_session.get("account_id")
        g.account = db.session.get(User, account_id) if account_id else None
        if account_id and g.account is None:
            flask_session.clear()

    def csrf_token():
        token = flask_session.get("csrf_token")
        if token is None:
            import secrets
            token = secrets.token_urlsafe(32)
            flask_session["csrf_token"] = token
        return token

    def valid_csrf():
        expected = flask_session.get("csrf_token")
        return bool(expected) and hmac.compare_digest(str(request.form.get("csrf_token", "")), str(expected))

    def verification_serializer():
        return URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="parlons-georgien-email-verification")

    def mail_is_configured():
        return bool(
            app.config["SMTP_HOST"]
            and app.config["SMTP_PORT"] in {587, 2525}
            and app.config["SMTP_USE_TLS"]
            and app.config["SMTP_USERNAME"]
            and app.config["SMTP_PASSWORD"]
            and app.config["MAIL_FROM"]
        )

    def send_verification_email(account):
        token = verification_serializer().dumps({"user_id": account.id, "email": account.email})
        link = url_for("verify_email", token=token, _external=True)
        image_url = url_for("static", filename="images/tbilisi-old-town-email.jpg", _external=True)
        message = EmailMessage()
        message["Subject"] = "Bienvenue sur Parlons géorgien — confirmez votre adresse"
        from_name, from_address = parseaddr(app.config["MAIL_FROM"])
        message["From"] = app.config["MAIL_FROM"] if from_name else formataddr(("Parlons géorgien", from_address))
        message["To"] = account.email
        message.set_content(
            f"Bonjour {account.display_name},\n\n"
            "Bienvenue sur Parlons géorgien ! Votre compte est presque prêt.\n\n"
            "Confirmez votre adresse e-mail pour l’activer. Vous pourrez ensuite retrouver votre progression "
            "et découvrir des leçons, des exercices et des jeux pour lire, écouter et pratiquer le géorgien à votre rythme.\n\n"
            "Confirmer mon adresse e-mail :\n"
            f"{link}\n\n"
            "Ce lien personnel expire dans 24 heures.\n\n"
            "Si vous n’êtes pas à l’origine de cette demande, ignorez ce message. "
            "Aucun compte ne sera activé sans confirmation.\n\n"
            "Parlons géorgien\nLe géorgien au quotidien\n"
        )
        escaped_name = html.escape(account.display_name)
        escaped_link = html.escape(link, quote=True)
        escaped_image_url = html.escape(image_url, quote=True)
        message.add_alternative(
            f"""<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#f4f1e9;color:#30242a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f1e9;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background:#ffffff;border:1px solid #e5e0d5;">
          <tr><td bgcolor="#671f3e" style="padding:22px 30px;background-color:#671f3e;background-image:linear-gradient(135deg,#963b5a,#671f3e);color:#ffffff;">
            <p style="margin:0;font-size:17px;font-weight:700;letter-spacing:.02em;">Parlons géorgien !</p>
            <p style="margin:5px 0 0;color:#f2dfe4;font-size:12px;">Le géorgien au quotidien</p>
          </td></tr>
          <tr><td style="padding:0;line-height:0;">
            <img src="{escaped_image_url}" width="580" alt="Maisons et forteresse de la vieille ville de Tbilissi" style="display:block;width:100%;height:auto;border:0;">
          </td></tr>
          <tr><td style="padding:8px 30px 0;color:#778078;font-size:10px;line-height:1.5;">
            Photo : GeoO / Wikimedia Commons · CC BY-SA 4.0
          </td></tr>
          <tr><td style="padding:34px 30px 30px;">
            <p style="margin:0 0 10px;color:#65756c;font-size:12px;">Bonjour {escaped_name},</p>
            <h1 style="margin:0 0 14px;color:#5b1e36;font-size:25px;line-height:1.25;font-weight:700;">Bienvenue sur Parlons géorgien !</h1>
            <p style="margin:0 0 12px;color:#51434a;font-size:15px;line-height:1.65;">Votre compte est presque prêt. Confirmez votre adresse e-mail pour l’activer.</p>
            <p style="margin:0 0 24px;color:#51434a;font-size:15px;line-height:1.65;">Vous pourrez ensuite retrouver votre progression et découvrir des leçons, des exercices et des jeux pour lire, écouter et pratiquer le géorgien à votre rythme.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#671f3e" style="background-color:#671f3e;background-image:linear-gradient(135deg,#963b5a,#671f3e);">
              <a href="{escaped_link}" style="display:inline-block;padding:14px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Confirmer mon adresse e-mail</a>
            </td></tr></table>
            <p style="margin:22px 0 6px;color:#65756c;font-size:12px;line-height:1.6;">Le lien est personnel et expire dans 24 heures.</p>
            <p style="margin:18px 0 5px;color:#65756c;font-size:12px;line-height:1.6;">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :</p>
            <p style="margin:0;color:#812d4b;font-size:12px;line-height:1.6;word-break:break-all;"><a href="{escaped_link}" style="color:#812d4b;">{escaped_link}</a></p>
          </td></tr>
          <tr><td style="padding:17px 30px;border-top:1px solid #e9e5dc;color:#6b756f;font-size:11px;line-height:1.6;">
            Si vous n’êtes pas à l’origine de cette demande, ignorez ce message. Aucun compte ne sera activé sans confirmation.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>""",
            subtype="html",
        )
        with smtplib.SMTP(app.config["SMTP_HOST"], app.config["SMTP_PORT"], timeout=20) as smtp:
            smtp.ehlo()
            if app.config["SMTP_USE_TLS"]:
                smtp.starttls(context=ssl.create_default_context())
                smtp.ehlo()
            username = app.config["SMTP_USERNAME"]
            if username:
                smtp.login(username, app.config["SMTP_PASSWORD"])
            smtp.send_message(message)

    def unique_display_name_suggestion(name):
        base_name = name.strip()[:80]
        for suffix in range(2, 10000):
            ending = str(suffix)
            candidate = f"{base_name[:80 - len(ending)]}{ending}"
            key = unicodedata.normalize("NFKC", candidate).casefold()
            if not User.query.filter_by(display_name_key=key).first():
                return candidate
        return f"{base_name[:68]}-{secrets.token_hex(4)}"

    def account_required(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not g.account:
                return redirect(url_for("login", next=request.path))
            return view(*args, **kwargs)
        return wrapped

    @app.context_processor
    def inject_account_context():
        return {"current_account": getattr(g, "account", None), "csrf_token": csrf_token}

    @app.get("/register")
    def register():
        if g.account:
            return redirect(url_for("account"))
        return render_template("account_auth.html", mode="register", next_url=request.args.get("next", ""))

    @app.post("/register")
    def register_submit():
        if not valid_csrf():
            flash("Le formulaire a expiré. Réessayez.", "error")
            return redirect(url_for("register"))
        name = request.form.get("display_name", "").strip()[:80]
        email = request.form.get("email", "").strip().casefold()
        password = request.form.get("password", "")
        if not name or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            flash("Indiquez un nom et une adresse e-mail valide.", "error")
            return render_template("account_auth.html", mode="register", next_url=request.form.get("next", ""),
                                   display_name=name, email=email), 400
        if len(password) < 8 or len(password) > 256:
            flash("Le mot de passe doit contenir entre 8 et 256 caractères.", "error")
            return render_template("account_auth.html", mode="register", next_url=request.form.get("next", ""),
                                   display_name=name, email=email), 400
        name_key = unicodedata.normalize("NFKC", name).casefold()
        if User.query.filter_by(display_name_key=name_key).first():
            suggestion = unique_display_name_suggestion(name)
            flash(f"Ce prénom ou pseudo est déjà utilisé. Variante disponible : {suggestion}", "error")
            return render_template("account_auth.html", mode="register", next_url=request.form.get("next", ""),
                                   display_name=name, email=email, suggested_name=suggestion), 409
        if not mail_is_configured():
            flash("L’inscription est momentanément indisponible : l’envoi des e-mails de validation n’est pas configuré.", "error")
            return render_template("account_auth.html", mode="register", next_url=request.form.get("next", ""),
                                   display_name=name, email=email), 503
        account = User(display_name=name, display_name_key=name_key, email=email,
                       password_hash=generate_password_hash(password), email_verified=False)
        db.session.add(account)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            duplicate_email = User.query.filter_by(email=email).first()
            suggestion = unique_display_name_suggestion(name) if User.query.filter_by(display_name_key=name_key).first() else None
            flash("Un compte utilise déjà cette adresse e-mail." if duplicate_email else
                  f"Ce prénom ou pseudo vient d’être pris. Variante disponible : {suggestion}", "error")
            return render_template("account_auth.html", mode="register", next_url=request.form.get("next", ""),
                                   display_name=name, email=email, suggested_name=suggestion), 409
        try:
            send_verification_email(account)
        except Exception:
            current_app.logger.exception("Could not send the account verification email")
            db.session.delete(account)
            db.session.commit()
            flash("Le message de validation n’a pas pu être envoyé. Réessayez dans un instant.", "error")
            return render_template("account_auth.html", mode="register", next_url=request.form.get("next", ""),
                                   display_name=name, email=email), 503
        account.verification_sent_at = utc_now_naive()
        db.session.commit()
        flask_session.clear()
        flask_session["pending_verification_email"] = email
        csrf_token()
        return redirect(url_for("verification_pending"))

    @app.get("/verify-email")
    def verification_pending():
        return render_template("verification_pending.html",
                               email=flask_session.get("pending_verification_email", ""))

    @app.post("/verify-email/resend")
    def resend_verification_email():
        if not valid_csrf():
            flash("Le formulaire a expiré. Réessayez.", "error")
            return redirect(url_for("verification_pending"))
        email = request.form.get("email", "").strip().casefold()
        account = User.query.filter_by(email=email).first() if email else None
        if account and not account.email_verified:
            if not mail_is_configured():
                flash("L’envoi des e-mails de validation n’est pas configuré pour le moment.", "error")
                return redirect(url_for("verification_pending"))
            now = utc_now_naive()
            if not account.verification_sent_at or now - account.verification_sent_at >= timedelta(minutes=1):
                try:
                    send_verification_email(account)
                except Exception:
                    current_app.logger.exception("Could not resend the account verification email")
                    flash("Le message n’a pas pu être envoyé. Réessayez plus tard.", "error")
                    return redirect(url_for("verification_pending"))
                account.verification_sent_at = now
                db.session.commit()
        flask_session["pending_verification_email"] = email
        flash("Si cette adresse correspond à un compte en attente, un lien de validation vient d’être envoyé.", "success")
        return redirect(url_for("verification_pending"))

    @app.get("/verify-email/<token>")
    def verify_email(token):
        try:
            payload = verification_serializer().loads(token, max_age=24 * 60 * 60)
        except SignatureExpired:
            flash("Ce lien a expiré. Demandez-en un nouveau pour valider votre adresse.", "error")
            return redirect(url_for("verification_pending"))
        except BadSignature:
            flash("Ce lien de validation est invalide.", "error")
            return redirect(url_for("verification_pending"))
        account = db.session.get(User, payload.get("user_id"))
        if account is None or account.email != payload.get("email"):
            flash("Ce lien de validation est invalide.", "error")
            return redirect(url_for("verification_pending"))
        account.email_verified = True
        account.verification_sent_at = None
        db.session.commit()
        flask_session["pending_verification_email"] = account.email
        flash("Adresse e-mail confirmée. Vous pouvez maintenant vous connecter.", "success")
        return redirect(url_for("login"))

    @app.get("/login")
    def login():
        if g.account:
            return redirect(url_for("account"))
        return render_template("account_auth.html", mode="login", next_url=request.args.get("next", ""))

    @app.post("/login")
    def login_submit():
        if not valid_csrf():
            flash("Le formulaire a expiré. Réessayez.", "error")
            return redirect(url_for("login"))
        email = request.form.get("email", "").strip().casefold()
        account = User.query.filter_by(email=email).first()
        if account is None or not check_password_hash(account.password_hash, request.form.get("password", "")):
            flash("Adresse e-mail ou mot de passe incorrect.", "error")
            return render_template("account_auth.html", mode="login", next_url=request.form.get("next", "")), 401
        if not account.email_verified:
            flask_session["pending_verification_email"] = account.email
            flash("Confirmez votre adresse e-mail avant de vous connecter.", "error")
            return redirect(url_for("verification_pending"))
        flask_session.clear()
        flask_session["account_id"] = account.id
        csrf_token()
        account.last_login_at = utc_now_naive()
        db.session.commit()
        destination = request.form.get("next", "")
        if not destination.startswith("/") or destination.startswith("//"):
            destination = url_for("account")
        return redirect(destination)

    @app.post("/logout")
    def logout():
        if not valid_csrf():
            flash("Le formulaire a expiré. Réessayez.", "error")
            return redirect(url_for("account"))
        flask_session.clear()
        flash("Vous êtes déconnecté(e).", "success")
        return redirect(url_for("home"))

    @app.get("/account")
    @account_required
    def account():
        stats = {
            "items_seen": Progress.query.count(),
            "answers": sum(row.seen for row in Progress.query.all()),
            "correct": sum(row.correct for row in Progress.query.all()),
            "lessons": LessonCompletion.query.count(),
            "created_at": g.account.created_at,
            "last_login_at": g.account.last_login_at,
        }
        data = AccountData.query.filter_by(user_id=g.account.id).first()
        level = ((data.learning_profile or {}).get("overallLevel") or "À déterminer") if data else "À déterminer"
        return render_template("account.html", stats=stats, estimated_level=level)

    @app.post("/account/password")
    @account_required
    def change_password():
        if not valid_csrf():
            flash("Le formulaire a expiré. Réessayez.", "error")
        elif not check_password_hash(g.account.password_hash, request.form.get("current_password", "")):
            flash("Le mot de passe actuel est incorrect.", "error")
        elif not 8 <= len(request.form.get("new_password", "")) <= 256:
            flash("Le nouveau mot de passe doit contenir entre 8 et 256 caractères.", "error")
        else:
            g.account.password_hash = generate_password_hash(request.form["new_password"])
            db.session.commit()
            flash("Mot de passe mis à jour.", "success")
        return redirect(url_for("account"))

    @app.post("/account/delete")
    @account_required
    def delete_account():
        if not valid_csrf():
            flash("Le formulaire a expiré. Réessayez.", "error")
            return redirect(url_for("account"))
        if not check_password_hash(g.account.password_hash, request.form.get("password", "")):
            flash("Mot de passe incorrect. Le compte n’a pas été supprimé.", "error")
            return redirect(url_for("account"))
        user_id = g.account.id
        AccountProgress.query.filter_by(user_id=user_id).delete(synchronize_session=False)
        AccountLessonCompletion.query.filter_by(user_id=user_id).delete(synchronize_session=False)
        AccountData.query.filter_by(user_id=user_id).delete(synchronize_session=False)
        User.query.filter_by(id=user_id).delete(synchronize_session=False)
        db.session.commit()
        flask_session.clear()
        flash("Votre compte et les données associées ont été supprimés.", "success")
        return redirect(url_for("home"))

    @app.get("/api/account/sync")
    @account_required
    def get_account_sync():
        data = AccountData.query.filter_by(user_id=g.account.id).first()
        return jsonify({"user_id": g.account.id,
                        "learning_profile": data.learning_profile if data else {},
                        "browser_data": data.browser_data if data else {}})

    @app.post("/api/account/sync")
    @account_required
    def save_account_sync():
        payload = request.get_json(silent=True) or {}
        profile = payload.get("learning_profile", {})
        browser_data = payload.get("browser_data", {})
        if not isinstance(profile, dict) or not isinstance(browser_data, dict):
            return jsonify({"error": "Données de synchronisation invalides."}), 400
        history = profile.get("history", [])
        if not isinstance(history, list):
            return jsonify({"error": "Historique invalide."}), 400
        profile["history"] = history[-5000:]
        browser_data = {str(key): value for key, value in browser_data.items()
                        if str(key).startswith(("parlons-course-progress-", "parlons-course-", "kartuli-grammar-speed-"))}
        if len(json.dumps({"profile": profile, "browser_data": browser_data}, ensure_ascii=False)) > 1_500_000:
            return jsonify({"error": "La sauvegarde dépasse la taille autorisée."}), 413
        data = AccountData.query.filter_by(user_id=g.account.id).first()
        if data is None:
            data = AccountData(user_id=g.account.id)
            db.session.add(data)
        data.learning_profile = profile
        data.browser_data = browser_data
        db.session.commit()
        return jsonify({"saved": True, "updated_at": data.updated_at.isoformat()})

    @app.get("/")
    def home():
        vocab = load_content("vocabulary")
        lessons = load_content("lessons")
        practice_sections = ("alphabet", "vocabulary", "reading", "comprehension",
                             "dictation", "grammar", "dialogues")
        test_versions = {
            (entry["bank"], entry["level"], str(entry["version"]))
            for section in practice_sections
            for entry in version_catalog(section)
        }
        test_levels = sorted({level for _, level, _ in test_versions})
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
                               test_version_count=len(test_versions), test_levels=test_levels,
                               percent=round(practiced * 100 / max(total, 1)), errors=errors)

    @app.get("/about")
    def about():
        return render_template("about.html")

    @app.get("/versions")
    def content_versions():
        section = request.args.get("section", "vocabulary")
        labels = {"alphabet": "Alphabet", "vocabulary": "Vocabulaire", "session": "Révision",
                  "reading": "Lecture",
                  "comprehension": "Compréhension orale", "dictation": "Dictées",
                  "grammar": "Grammaire", "dialogues": "Dialogues", "lesson": "Leçons"}
        if section not in labels:
            section = "vocabulary"
        return_url = url_for({"dictation": "dictations", "lesson": "courses"}.get(section, section))
        destinations = {"alphabet_recognition": "alphabet", "vocabulary": "vocabulary",
            "reading_a1": "reading", "reading_a2": "reading", "reading_b1": "reading",
            "reading_b2": "reading", "reading_c1": "reading", "reading_c2": "reading",
            "reading_cloze": "reading", "reading_exams": "reading",
            "comprehension_order": "comprehension", "dictation_sentences": "dictations",
            "grammar_exercises": "grammar", "dialogues": "dialogues"}
        versions = version_catalog(section)
        for entry in versions:
            item = entry["item"]
            if entry["bank"] in {"lessons", "elearning_lessons"}:
                endpoint = "course_lesson" if entry["bank"] == "elearning_lessons" else "lesson"
                entry["href"] = url_for(endpoint, lesson_id=item["id"])
            else:
                endpoint = destinations.get(entry["bank"], section)
                selection_bank = "reading" if entry["bank"].startswith("reading_") else entry["bank"]
                params = {"bank": selection_bank, "cefr": entry["level"],
                          "version": entry["version"]}
                entry["href"] = url_for(endpoint, **params) + (entry["target"] or "")
        return render_template("content_versions.html", section=section,
                               section_title=labels[section], versions=versions,
                               levels=("A1", "A2", "B1", "B2", "C1", "C2"),
                               return_url=return_url)

    @app.get("/alphabet")
    def alphabet():
        return render_template("alphabet.html", letters=load_content("alphabet"),
                               words=selected_practice_level(load_content("vocabulary")),
                               recognition_versions=selected_version(
                                   load_content("alphabet_recognition_a1"), "alphabet_recognition"))

    @app.get("/lessons")
    def courses():
        lessons = load_content("elearning_lessons")
        return render_template("courses.html", lessons=lessons)

    @app.get("/lessons/<lesson_id>")
    def course_lesson(lesson_id):
        lessons = load_content("elearning_lessons")
        selected_cefr = request.args.get("practice_cefr", "").upper()
        level_lessons = [item for item in lessons if item.get("cefr") == selected_cefr]
        if level_lessons:
            alternatives = [item for item in level_lessons if item["id"] != lesson_id] or level_lessons
            selected_id = random.choice(alternatives)["id"]
            lessons = level_lessons
        else:
            selected_id = lesson_id
        lesson_index = next((index for index, item in enumerate(lessons)
                             if item["id"] == selected_id), None)
        if lesson_index is None:
            return render_template("not_found.html"), 404
        lesson = lessons[lesson_index]
        next_lesson = None
        if lesson_index + 1 < len(lessons):
            following = lessons[lesson_index + 1]
            next_lesson = {
                "title": following["title"],
                "url": url_for("course_lesson", lesson_id=following["id"]),
            }
        return render_template("course_lesson.html", lesson=lesson,
                               next_lesson=next_lesson)

    @app.get("/lesson/<lesson_id>")
    def lesson(lesson_id):
        lessons = load_content("lessons")
        selected = next((item for item in lessons if item["id"] == lesson_id), None)
        selected_cefr = request.args.get("practice_cefr", "").upper()
        level_lessons = [item for item in lessons if item.get("cefr") == selected_cefr]
        if level_lessons:
            alternatives = [item for item in level_lessons if item["id"] != lesson_id] or level_lessons
            selected = random.choice(alternatives)
        if selected is None:
            return render_template("not_found.html"), 404
        return render_template("lesson.html", lesson=selected,
                               questions=build_lesson_questions(selected["items"]))

    @app.get("/vocabulary")
    def vocabulary():
        vocab = [dict(item) for item in selected_version(load_content("vocabulary"), "vocabulary")]
        illustrations = {item["id"]: item for item in load_content("vocabulary_images")}
        for item in vocab:
            illustration = illustrations.get(item["id"])
            if illustration:
                item["image"] = url_for("static", filename=f"images/openmoji/{illustration['file']}")
                item["image_alt"] = illustration["alt"]
        due_ids = [row.item_id for row in Progress.query.filter(
            Progress.kind == "vocabulary", Progress.due_at <= utc_now_naive()).all()]
        practiced = Progress.query.filter_by(kind="vocabulary").count()
        return render_template("vocabulary.html", vocab=vocab, due_ids=due_ids,
                               practiced=practiced)

    @app.get("/grammar")
    def grammar():
        exercises = grammar_exercises()
        return render_template("grammar.html", cards=load_content("grammar"),
                               exercise_total=len(exercises),
                               timed_total=sum(item["category"] == "temps" for item in exercises))

    @app.get("/api/grammar/next")
    def next_grammar_exercise():
        category = request.args.get("category", "temps")
        items = [item for item in selected_version(grammar_exercises(), "grammar_exercises")
                 if category == "all" or item["category"] == category]
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [item for item in items if item["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True, "total": len(items)})
        selected = random.choice(candidates)
        return jsonify({**{key: selected[key] for key in ("id", "category", "prompt", "options")},
                        "total": len(items)})

    @app.get("/api/crossword/next")
    def next_crossword():
        puzzle = build_crossword(selected_practice_level(load_content("vocabulary")))
        if puzzle is None:
            return jsonify({"error": "Impossible de composer une grille pour le moment."}), 503
        return jsonify(puzzle)

    @app.post("/api/grammar/answer")
    def answer_grammar_exercise():
        data = request.get_json(silent=True) or {}
        item = next((entry for entry in grammar_exercises() if entry["id"] == data.get("id")), None)
        if item is None:
            return jsonify({"error": "Question inconnue."}), 404
        correct = data.get("answer") == item["answer"]
        progress_id = f"grammar:{item['id']}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="grammar", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1; row.correct += int(correct); row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        row.due_at = utc_now_naive() + timedelta(days=min(30, 2 ** min(row.streak, 5)) if correct else 0,
                                                   minutes=0 if correct else 10)
        db.session.commit()
        return jsonify({"correct": correct, "answer": item["answer"],
                        "explanation": item["explanation"]})

    @app.get("/dialogues")
    def dialogues():
        items = selected_practice_level(load_content("dialogues"))
        return render_template("dialogues.html", dialogues=items,
                               flash_total=len(dialogue_flash_items()))

    def dialogue_flash_items():
        dialogues = load_content("dialogues")
        response_pool = []
        questions = []
        for dialogue in dialogues:
            for index, turn in enumerate(dialogue["turns"]):
                for choice in turn.get("choices", []):
                    response_pool.append({"ka": choice["ka"], "fr": choice["fr"]})
                    if choice.get("ok"):
                        questions.append({"id": f"{dialogue['id']}-{index}",
                                          "scene": dialogue["scene"],
                                          "cefr": dialogue.get("cefr", "A1"),
                                          "version": dialogue.get("version"),
                                          "prompt": turn["ka"], "prompt_fr": turn["fr"],
                                          "answer": choice["ka"], "answer_fr": choice["fr"]})
        unique_responses = {entry["ka"]: entry for entry in response_pool}
        for question in questions:
            distractors = [entry for key, entry in unique_responses.items()
                           if key != question["answer"]]
            question["options"] = [{"ka": question["answer"], "fr": question["answer_fr"]}]
            question["options"].extend(random.sample(distractors, min(3, len(distractors))))
        return questions

    @app.get("/api/dialogues/flash/next")
    def next_dialogue_flash():
        questions = selected_version(dialogue_flash_items(), "dialogues")
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [item for item in questions if item["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True, "total": len(questions)})
        item = random.choice(candidates)
        options = list(item["options"])
        random.shuffle(options)
        return jsonify({key: item[key] for key in ("id", "scene", "prompt")} |
                       {"options": [{"ka": option["ka"]} for option in options],
                        "total": len(questions)})

    @app.post("/api/dialogues/flash/answer")
    def answer_dialogue_flash():
        data = request.get_json(silent=True) or {}
        item = next((entry for entry in dialogue_flash_items()
                     if entry["id"] == data.get("id")), None)
        if item is None:
            return jsonify({"error": "Réplique inconnue."}), 404
        correct = data.get("answer") == item["answer"]
        progress_id = f"dialogue-flash:{item['id']}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="dialogue", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(correct)
        row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        row.due_at = utc_now_naive() + timedelta(days=1 if correct else 0,
                                                 minutes=0 if correct else 10)
        db.session.commit()
        if not correct:
            return jsonify({"correct": False})
        return jsonify({"correct": True})

    @app.get("/session")
    def session():
        return render_template("session.html")

    @app.get("/dictations")
    def dictations():
        return render_template("dictations.html", total=len(dictation_words()),
                               sentence_total=len(load_content("dictation_sentences")))

    @app.get("/reading")
    def reading():
        return render_template("reading.html", total=len(reading_texts()),
                               exam_total=len(reading_exam_texts()),
                               cloze_total=len(load_content("reading_cloze")))

    @app.get("/comprehension")
    def comprehension():
        claim_total = sum(len(item["options"]) for item in reading_texts())
        return render_template("comprehension.html", total=len(reading_texts()),
                               exam_total=len(reading_exam_texts()), claim_total=claim_total,
                               order_total=len(load_content("comprehension_order")))

    @app.get("/api/comprehension/order")
    def next_comprehension_order():
        items = selected_version(load_content("comprehension_order"), "comprehension_order")
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [item for item in items if item["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True, "total": len(items)})
        item = random.choice(candidates)
        events = [{"id": index, "text": text} for index, text in enumerate(item["events"])]
        random.shuffle(events)
        return jsonify({"id": item["id"], "title": item["title"],
                        "level_name": item["level_name"], "text": item["text"],
                        "events": events, "total": len(items)})

    @app.post("/api/comprehension/order/answer")
    def answer_comprehension_order():
        data = request.get_json(silent=True) or {}
        item = next((entry for entry in load_content("comprehension_order")
                     if entry["id"] == data.get("id")), None)
        if item is None:
            return jsonify({"error": "Récit inconnu."}), 404
        if data.get("skip") is True:
            correct = False
        else:
            submitted = data.get("order")
            if not isinstance(submitted, list) or len(submitted) != len(item["events"]):
                return jsonify({"error": "Ordre incomplet."}), 400
            try:
                order = [int(value) for value in submitted]
            except (TypeError, ValueError):
                return jsonify({"error": "Ordre invalide."}), 400
            correct = order == list(range(len(item["events"])))
        progress_id = f"comprehension-order:{item['id']}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="comprehension", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(correct)
        row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        row.due_at = utc_now_naive() + timedelta(days=1 if correct else 0,
                                                 minutes=0 if correct else 10)
        db.session.commit()
        if not correct:
            return jsonify({"correct": False})
        return jsonify({"correct": True, "explanation": item["explanation"]})

    @app.get("/api/comprehension/true-false")
    def next_comprehension_claim():
        excluded = set(request.args.get("exclude", "").split(","))
        claims = [(item, index, option)
                  for item in selected_version(reading_texts(), "reading")
                  for index, option in enumerate(item["options"])
                  if f'{item["id"]}:{index}' not in excluded]
        if not claims:
            return jsonify({"empty": True})
        item, index, option = random.choice(claims)
        return jsonify({"id": f'{item["id"]}:{index}', "text": item["text"],
                        "level_name": item["level_name"], "question": item["question"],
                        "claim": option})

    @app.post("/api/comprehension/true-false/answer")
    def answer_comprehension_claim():
        data = request.get_json(silent=True) or {}
        claim_id = str(data.get("id", ""))
        try:
            item_id, raw_index = claim_id.rsplit(":", 1)
            index = int(raw_index)
        except (ValueError, TypeError):
            return jsonify({"error": "Proposition invalide."}), 400
        item = next((entry for entry in reading_texts() if entry["id"] == item_id), None)
        if item is None or index not in range(len(item["options"])):
            return jsonify({"error": "Proposition inconnue."}), 404
        is_true = item["options"][index] == item["answer"]
        if data.get("skip") is True:
            correct = False
        else:
            if not isinstance(data.get("answer"), bool):
                return jsonify({"error": "Choisissez vrai ou faux."}), 400
            correct = data["answer"] == is_true
        progress_id = f"comprehension-vf:{claim_id}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="reading", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(correct)
        row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        row.due_at = utc_now_naive() + timedelta(days=1 if correct else 0,
                                                 minutes=0 if correct else 10)
        db.session.commit()
        if not correct:
            return jsonify({"correct": False})
        return jsonify({"correct": True, "is_true": is_true, "answer": item["answer"],
                        "translation": item["translation"], "explanation": item["explanation"]})

    @app.get("/api/reading/exam")
    def next_reading_exam():
        exams = selected_version(reading_exam_texts(), "reading_exams")
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [item for item in exams if item["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True})
        selected = random.choice(candidates)
        return jsonify({"id": selected["id"], "title": selected["title"],
                        "level_name": selected["level_name"], "cefr": selected["cefr"], "text": selected["text"],
                        "questions": [{"question": q["question"], "options": q["options"]}
                                      for q in selected["questions"]]})

    @app.get("/api/reading/cloze/next")
    def next_reading_cloze():
        items = selected_version(load_content("reading_cloze"), "reading_cloze")
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [item for item in items if item["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True, "total": len(items)})
        item = random.choice(candidates)
        options = list(item["options"])
        random.shuffle(options)
        return jsonify({key: item[key] for key in ("id", "sentence")} |
                       {"options": options, "total": len(items)})

    @app.post("/api/reading/cloze/answer")
    def answer_reading_cloze():
        data = request.get_json(silent=True) or {}
        item = next((entry for entry in load_content("reading_cloze")
                     if entry["id"] == data.get("id")), None)
        if item is None:
            return jsonify({"error": "Phrase inconnue."}), 404
        correct = data.get("answer") == item["answer"]
        progress_id = f"reading-cloze:{item['id']}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="reading", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(correct)
        row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        row.due_at = utc_now_naive() + timedelta(days=1 if correct else 0,
                                                 minutes=0 if correct else 10)
        db.session.commit()
        if not correct:
            return jsonify({"correct": False})
        return jsonify({"correct": True, "translation": item["translation"],
                        "explanation": item["explanation"]})

    @app.post("/api/reading/exam/answer")
    def answer_reading_exam():
        data = request.get_json(silent=True) or {}
        text_id = str(data.get("id", ""))
        try:
            index = int(data.get("index", -1))
        except (TypeError, ValueError):
            return jsonify({"error": "Question invalide."}), 400
        item = next((entry for entry in reading_exam_texts() if entry["id"] == text_id), None)
        if item is None or index not in range(len(item["questions"])):
            return jsonify({"error": "Question inconnue."}), 404
        question = item["questions"][index]
        correct = data.get("answer") == question["answer"]
        progress_id = f"reading-exam:{text_id}:{index}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="reading", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(correct)
        row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        row.due_at = utc_now_naive() + timedelta(days=1 if correct else 0, minutes=0 if correct else 10)
        db.session.commit()
        if not correct:
            return jsonify({"correct": False})
        return jsonify({"correct": correct, "answer": question["answer"],
                        "explanation": question["explanation"], "translation": item["translation"]})

    @app.get("/api/reading/next")
    def next_reading():
        try:
            level = int(request.args.get("level", "1"))
        except ValueError:
            return jsonify({"error": "Niveau invalide."}), 400
        if level not in range(1, 8):
            return jsonify({"error": "Niveau invalide."}), 400
        requested_cefr = request.args.get("practice_cefr", "").upper()
        if requested_cefr in READING_LEVEL_NUMBERS:
            level = READING_LEVEL_NUMBERS[requested_cefr]
        items = [item for item in selected_version(reading_texts(), "reading") if item["level"] == level]
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
        options = list(selected["options"])
        random.shuffle(options)
        response = {key: selected[key] for key in
                    ("id", "level", "cefr", "level_name", "text", "question")}
        response["options"] = options
        return jsonify(response)

    @app.get("/api/placement/next")
    def next_placement_question():
        """Return a graded reading question for the adaptive first-visit diagnostic."""
        cefr = request.args.get("cefr", "A2").upper()
        if cefr not in {"A1", "A2", "B1", "B2", "C1", "C2"}:
            return jsonify({"error": "Niveau CECRL invalide."}), 400
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [item for item in reading_texts()
                      if item.get("cefr") == cefr and item["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True, "cefr": cefr})
        selected = random.choice(candidates)
        options = list(selected["options"])
        random.shuffle(options)
        return jsonify({key: selected[key] for key in
                        ("id", "level", "cefr", "level_name", "text", "question", "answer", "explanation")}
                       | {"options": options})

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
        words = selected_practice_level(dictation_words())
        direction = request.args.get("direction", "ka-fr")
        if direction not in {"ka-fr", "fr-ka"}:
            return jsonify({"error": "Sens de dictée invalide."}), 400
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
        return jsonify({"id": selected["id"], "total": len(words),
                        "prompt": selected["fr"] if direction == "fr-ka" else None})

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

    @app.get("/api/dictations/sentences/next")
    def next_dictation_sentence():
        items = selected_version(load_content("dictation_sentences"), "dictation_sentences")
        excluded = set(request.args.get("exclude", "").split(","))
        candidates = [item for item in items if item["id"] not in excluded]
        if not candidates:
            return jsonify({"empty": True, "total": len(items)})
        item = random.choice(candidates)
        return jsonify({"id": item["id"], "prompt": item["fr"], "total": len(items)})

    @app.get("/api/dictations/sentences/audio/<item_id>")
    def dictation_sentence_audio(item_id):
        item = next((entry for entry in load_content("dictation_sentences")
                     if entry["id"] == item_id), None)
        if item is None:
            return jsonify({"error": "Phrase inconnue."}), 404
        path = Path(app.instance_path) / "audio" / "ka" / audio_name("ka", item["ka"])
        if not path.is_file():
            return jsonify({"error": "Audio indisponible pour cette phrase."}), 404
        return send_file(path, mimetype="audio/wav", conditional=True, max_age=86400)

    @app.post("/api/dictations/sentences/answer")
    def answer_dictation_sentence():
        data = request.get_json(silent=True) or {}
        item = next((entry for entry in load_content("dictation_sentences")
                     if entry["id"] == data.get("id")), None)
        if item is None:
            return jsonify({"error": "Phrase inconnue."}), 404
        accepted = item.get("answers", [item["ka"]])
        answer = normalise(data.get("answer", ""))
        correct = answer in {normalise(value) for value in accepted}
        progress_id = f"dictation-sentence:{item['id']}"
        row = Progress.query.filter_by(item_id=progress_id).first()
        if row is None:
            row = Progress(item_id=progress_id, kind="dictation", seen=0, correct=0, streak=0)
            db.session.add(row)
        row.seen += 1
        row.correct += int(correct)
        row.last_answer = correct
        row.streak = row.streak + 1 if correct else 0
        row.due_at = utc_now_naive() + timedelta(days=1 if correct else 0,
                                                 minutes=0 if correct else 10)
        db.session.commit()
        return jsonify({"correct": correct, "solution": item["ka"],
                        "explanation": item["note"], "seen": row.seen,
                        "correct_count": row.correct})

    @app.get("/api/quiz")
    def quiz():
        if request.args.get("kind") == "alphabet":
            letters = load_content("alphabet")
            letter_id = request.args.get("letter_id")
            letter = next((item for item in letters if item["id"] == letter_id), None) if letter_id else random.choice(letters)
            if letter is None:
                return jsonify({"error": "Lettre inconnue."}), 404
            choices = [letter["letter"]] + [x["letter"] for x in random.sample([x for x in letters if x["id"] != letter["id"]], 3)]
            random.shuffle(choices)
            return jsonify({"id": letter["id"], "kind": "alphabet", "prompt": letter["example"],
                            "choices": choices, "note": letter["note"]})
        vocab = selected_practice_level(load_content("vocabulary"))
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
        if language not in {"ka", "fr"} or not text or len(text) > 2000:
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
        account_data = AccountData.query.filter_by(user_id=g.account.id).first() if g.account else None
        data = {"exported_at": utc_now_naive().isoformat() + "Z",
                "progress": [{"id": r.item_id, "kind": r.kind, "seen": r.seen,
                              "correct": r.correct, "streak": r.streak,
                              "due_at": r.due_at.isoformat() if r.due_at else None,
                              "last_answer": r.last_answer} for r in Progress.query.all()],
                "lessons": [{"id": x.lesson_id, "score": x.score,
                             "completed_at": x.completed_at.isoformat()} for x in LessonCompletion.query.all()],
                "learning_profile": account_data.learning_profile if account_data else {},
                "browser_data": account_data.browser_data if account_data else {}}
        path = Path(app.instance_path) / "progress-export.json"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return send_file(path, as_attachment=True, download_name="ma-progression-georgien.json")

    return app


def normalise(value):
    import re
    return re.sub(r"[\s.!?,;:’'\-]+", " ", str(value).strip().casefold()).strip()
