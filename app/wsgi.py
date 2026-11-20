"""WSGI entry point honoring Apache's X-Forwarded-Prefix for /kartuli/."""

from pathlib import Path

from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

# Load deployment secrets from the app root; process-level environment variables
# keep precedence, so systemd can still override individual settings.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app import create_app

application = ProxyFix(create_app(), x_for=1, x_proto=1, x_host=1, x_prefix=1)
