import unittest
from datetime import datetime, timedelta, timezone
from werkzeug.test import Client
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.wrappers import Response

from app import Progress, create_app, db, load_content


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


if __name__ == "__main__":
    unittest.main()
