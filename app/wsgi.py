"""WSGI entry point honoring Apache's X-Forwarded-Prefix for /kartuli/."""

from werkzeug.middleware.proxy_fix import ProxyFix

from app import create_app

application = ProxyFix(create_app(), x_for=1, x_proto=1, x_host=1, x_prefix=1)
