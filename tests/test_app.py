import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from datetime import datetime, timedelta, timezone
from werkzeug.test import Client
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.wrappers import Response

from app import Progress, build_lesson_questions, create_app, db, dictation_words, load_content
from app.tts import audio_name


class AppFlowTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})
        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()

    def test_core_pages_render_and_content_counts(self):
        for route in ("/", "/alphabet", "/vocabulary", "/grammar", "/dialogues", "/session", "/lesson/greetings"):
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200, route)
        self.assertEqual(len(load_content("alphabet")), 33)
        self.assertEqual(len(load_content("lessons")), 10)
        self.assertEqual(len(load_content("vocabulary")), 120)

    def test_each_lesson_has_two_way_questions_for_every_phrase(self):
        for lesson in load_content("lessons"):
            questions = build_lesson_questions(lesson["items"])
            self.assertEqual(len(questions), len(lesson["items"]) * 2, lesson["id"])
            self.assertEqual(sum(q["direction"] == "ka-fr" for q in questions), len(lesson["items"]))
            self.assertEqual(sum(q["direction"] == "fr-ka" for q in questions), len(lesson["items"]))
            self.assertTrue(all(q["answer"] in q["options"] for q in questions))
            page = self.client.get(f"/lesson/{lesson['id']}")
            self.assertIn(b'id="lesson-questions"', page.data)

    def test_dictations_use_single_words_and_reject_wrong_letters(self):
        page = self.client.get("/dictations")
        self.assertEqual(page.status_code, 200)
        self.assertGreater(len(dictation_words()), 80)
        next_word = self.client.get("/api/dictations/next").json
        self.assertIn(next_word["id"], {word["id"] for word in dictation_words()})
        self.assertNotIn("ka", next_word)

        wrong = self.client.post("/api/dictations/answer", json={"id": "v-031", "answer": "წყალიი"})
        self.assertFalse(wrong.json["correct"])
        correct = self.client.post("/api/dictations/answer", json={"id": "v-031", "answer": "წყალი!"})
        self.assertTrue(correct.json["correct"])
        with self.app.app_context():
            row = Progress.query.filter_by(item_id="dictation:v-031").first()
            self.assertEqual(row.kind, "dictation")
            self.assertEqual(row.seen, 2)
            self.assertEqual(row.correct, 1)
            self.assertIsNotNone(row.due_at)

    def test_dictation_audio_uses_existing_georgian_cache(self):
        with TemporaryDirectory() as temp_dir:
            self.app.instance_path = temp_dir
            item = next(word for word in dictation_words() if word["id"] == "v-031")
            path = Path(temp_dir) / "audio" / "ka" / audio_name("ka", item["ka"])
            path.parent.mkdir(parents=True)
            path.write_bytes(b"RIFF-test-dictation")
            response = self.client.get("/api/dictations/audio/v-031")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.mimetype, "audio/wav")
            self.assertEqual(response.data, b"RIFF-test-dictation")
            response.close()

    def test_answer_persists_and_normalizes_french_punctuation(self):
        response = self.client.post("/api/answer", json={"id": "v-001", "kind": "vocabulary", "answer": " Bonjour ! "})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["correct"])
        progress = self.client.get("/api/progress").json
        self.assertEqual(progress["items_seen"], 1)
        self.assertEqual(progress["correct"], 1)
        alias = self.client.post("/api/answer", json={"id": "v-008", "kind": "vocabulary", "answer": "bon"})
        self.assertTrue(alias.json["correct"])

    def test_wrong_answer_and_difficulty_change_schedule(self):
        response = self.client.post("/api/answer", json={"id": "v-002", "kind": "vocabulary", "answer": "bonjour"})
        self.assertFalse(response.json["correct"])
        with self.app.app_context():
            row = Progress.query.filter_by(item_id="v-002").first()
            self.assertEqual(row.streak, 0)
        scheduled = self.client.post("/api/difficulty/v-002", json={"quality": 1})
        self.assertEqual(scheduled.status_code, 200)
        self.assertEqual(scheduled.json["due_in_days"], 0)
        with self.app.app_context():
            row = Progress.query.filter_by(item_id="v-002").first()
            self.assertIsNotNone(row.due_at)
            self.assertGreater(row.due_at, datetime.now(timezone.utc).replace(tzinfo=None))
            row.due_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
            db.session.commit()
        review = self.client.get("/api/quiz?mode=review")
        self.assertEqual(review.status_code, 200)
        self.assertNotIn("empty", review.json)

    def test_answer_formats_and_alphabet_keys(self):
        typed = self.client.get("/api/quiz?exercise=type").json
        answer = next(item["ka"] for item in load_content("vocabulary") if item["id"] == typed["id"])
        result = self.client.post("/api/answer", json={"id": typed["id"], "kind": "type", "answer": answer})
        self.assertTrue(result.json["correct"])
        ordered = self.client.get("/api/quiz?exercise=order").json
        result = self.client.post("/api/answer", json={"id": ordered["id"], "kind": "order", "answer": ordered["example"]})
        self.assertTrue(result.json["correct"])
        keys = self.client.get("/api/alphabet/keys").json
        self.assertEqual(len(keys), 33)
        self.assertEqual(len(set(keys)), 33)

    def test_lesson_completion_empty_review_and_export(self):
        complete = self.client.post("/api/complete/greetings", json={"score": 80})
        self.assertEqual(complete.json, {"saved": True, "score": 80})
        self.assertEqual(self.client.get("/api/quiz?mode=review").json["empty"], True)
        export = self.client.get("/export")
        self.assertEqual(export.status_code, 200)
        self.assertIn("ma-progression-georgien.json", export.headers["Content-Disposition"])
        export.close()

    def test_application_mounts_cleanly_under_kartuli_prefix(self):
        mounted = ProxyFix(self.app, x_prefix=1)
        client = Client(mounted, Response)
        home = client.get("/", headers={"X-Forwarded-Prefix": "/kartuli"})
        self.assertEqual(home.status_code, 200)
        self.assertIn(b'href="/kartuli/session"', home.data)
        self.assertIn(b'/kartuli/static/style.css', home.data)
        self.assertEqual(client.get("/api/quiz", headers={"X-Forwarded-Prefix": "/kartuli"}).status_code, 200)

    def test_audio_endpoint_only_serves_pregenerated_files(self):
        with TemporaryDirectory() as temp_dir:
            self.app.instance_path = temp_dir
            text = "გამარჯობა, bonjour !"
            path = Path(temp_dir) / "audio" / "ka" / audio_name("ka", text)
            path.parent.mkdir(parents=True)
            path.write_bytes(b"RIFF-test-audio")
            response = self.client.post("/api/audio", json={"lang": "ka", "text": text})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.mimetype, "audio/wav")
            self.assertEqual(response.data, b"RIFF-test-audio")
            response.close()
            self.assertEqual(self.client.post("/api/audio", json={"lang": "ka", "text": "absent"}).status_code, 404)
            self.assertEqual(self.client.post("/api/audio", json={"lang": "xx", "text": text}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
