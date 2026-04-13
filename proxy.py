"""
Fintori · Anthropic API Proxy (Python / Flask)
Hardened version — see SECURITY notes inline.
"""

import json
import time
import hashlib
import os
import re
import secrets
import tempfile

from dotenv import load_dotenv
import requests
from flask import Flask, request, jsonify, make_response

load_dotenv()

# ── CONFIG ────────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
if not ANTHROPIC_API_KEY:
    raise RuntimeError('Missing ANTHROPIC_API_KEY environment variable')

PROXY_TOKEN = os.getenv('PROXY_TOKEN')
if not PROXY_TOKEN:
    raise RuntimeError('Missing PROXY_TOKEN environment variable')

# SECURITY: Whitelist only your own domains.
# Add 'http://localhost:5000' or 'http://127.0.0.1:5500' for local dev only —
# remove them before deploying to production.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv('ALLOWED_ORIGINS', '').split(',')
    if o.strip()
]
# Fallback for local development if env var not set
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = ['http://localhost:5000', 'http://127.0.0.1:5500']

RATE_LIMIT      = 30          # requests per IP per hour
ANTHROPIC_MODEL = 'claude-sonnet-4-6'
MAX_TOKENS      = 400
MAX_PROMPT_CHARS = 6000       # hard cap on total prompt size sent by client

# SECURITY: Session tokens expire after this many seconds.
SESSION_TOKEN_TTL  = 3600     # 1 hour
# In-memory store: fine for single-process; swap for Redis in multi-worker.
_session_tokens: dict[str, float] = {}

SYSTEM_PROMPT = """You are a UK small business financial analyst. Analyse only the numbers provided. Never invent figures. Never give definitive tax advice — always direct the user to a qualified accountant or tax adviser for tax decisions.

UK TAX RATES 2025/26:
- Corporation Tax: 19% (profits up to £50,000), 25% (over £250,000), marginal relief between
- VAT threshold: £90,000 annual turnover. Standard 20%, reduced 5%, zero 0%
- National Living Wage: £12.21/hr (21+), £10.00/hr (18-20), £7.55/hr (under 18 / apprentice)
- Employer NIC: 15% above £5,000/yr secondary threshold. Employment Allowance up to £10,500/yr
- Employee NIC: 8% on £12,570–£50,270, then 2%
- Income Tax: personal allowance £12,570. Basic 20% to £50,270. Higher 40% to £125,140. Additional 45% above
- Annual Investment Allowance: £1,000,000
- Auto-enrolment pension: minimum 3% employer, 5% employee contribution
- Making Tax Digital: mandatory for all VAT-registered businesses

UK SME BENCHMARKS (ONS/HMRC 2024/25):
Hospitality: gross 25%, net 5.5%, debtor 21d, stock 14d
Retail physical: gross 35%, net 4%, debtor 30d, stock 45d
E-commerce: gross 40%, net 8.5%, debtor 14d, stock 30d
Construction: gross 20%, net 6%, debtor 45d, stock 60d
Professional services: gross 60%, net 20%, debtor 30d
IT/Technology: gross 65%, net 17%, debtor 30d
Health & Beauty: gross 50%, net 11.5%, debtor 21d, stock 30d
Manufacturing: gross 32.5%, net 7%, debtor 45d, stock 60d
Transport & Logistics: gross 20%, net 5%, debtor 30d
Education/Training: gross 52.5%, net 15%, debtor 30d
Financial Services: gross 70%, net 27.5%, debtor 21d
Other/Mixed: gross 37.5%, net 8.8%, debtor 30d, stock 45d

HEALTH THRESHOLDS:
- Net margin: <0% critical, 0-5% poor, 5-10% acceptable, >10% healthy
- Gross margin: <15% critical, 15-20% low, 20-35% moderate, >35% strong
- Cash runway: <1mo danger, 1-3mo tight, >3mo acceptable
- Working capital ratio: <1.0x danger, 1.0-1.5x tight, >1.5x healthy
- Debt/revenue: <3x manageable, 3-6x monitor, >6x high risk

RULES: analyse provided numbers only. British English. £ for currency. Flag implausible data. Tax/legal queries → refer to ACA/ACCA accountant. Return ONLY the specified JSON, no markdown."""


app = Flask(__name__)

# ── CORS ──────────────────────────────────────────────────────────────────────
# SECURITY: Only echo back the Origin header if it is on our whitelist.
# Wildcard '*' is removed — it would let any website use our proxy.
def _add_cors(response):
    origin = request.headers.get('Origin', '')
    if origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin']  = origin
        response.headers['Vary'] = 'Origin'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS, GET'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Proxy-Token, X-Session-Token'
    return response

# ── SECURITY HEADERS ──────────────────────────────────────────────────────────
# SECURITY: Attach defensive HTTP headers to every response.
@app.after_request
def after_request(response):
    response = _add_cors(response)
    response.headers['X-Frame-Options']           = 'DENY'
    response.headers['X-Content-Type-Options']    = 'nosniff'
    response.headers['Referrer-Policy']           = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy']        = 'geolocation=(), microphone=(), camera=()'
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
        "font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
        "img-src 'self' data:; "
        "connect-src 'self';"
    )
    return response

# ── RATE LIMIT ────────────────────────────────────────────────────────────────
def _check_rate_limit(ip: str) -> bool:
    filename = os.path.join(
        tempfile.gettempdir(),
        f"fintori_{hashlib.md5(ip.encode()).hexdigest()}.json"
    )
    now = int(time.time())
    try:
        with open(filename) as f:
            rl = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        rl = {'count': 0, 'reset': now + 3600}
    if now > rl['reset']:
        rl = {'count': 0, 'reset': now + 3600}
    if rl['count'] >= RATE_LIMIT:
        return False
    rl['count'] += 1
    with open(filename, 'w') as f:
        json.dump(rl, f)
    return True

# ── SESSION TOKEN STORE ───────────────────────────────────────────────────────
def _purge_expired_tokens():
    now = time.time()
    expired = [t for t, ts in _session_tokens.items() if now - ts > SESSION_TOKEN_TTL]
    for t in expired:
        del _session_tokens[t]

def _issue_session_token() -> str:
    _purge_expired_tokens()
    token = secrets.token_hex(32)
    _session_tokens[token] = time.time()
    return token

def _validate_session_token(token: str) -> bool:
    _purge_expired_tokens()
    ts = _session_tokens.get(token)
    if ts is None:
        return False
    if time.time() - ts > SESSION_TOKEN_TTL:
        del _session_tokens[token]
        return False
    return True

# ── SESSION TOKEN ENDPOINT ────────────────────────────────────────────────────
# SECURITY: Browser fetches this directly (no SSR). Protection layers:
#   1. CORS — only ALLOWED_ORIGINS can call this from a browser.
#   2. Rate limiting — same per-IP cap as /proxy.py.
#   3. Session tokens are short-lived and validated server-side.
@app.route('/session-token', methods=['GET', 'OPTIONS'])
def session_token():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    ip = request.remote_addr or 'unknown'
    if not _check_rate_limit(ip):
        return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429

    token = _issue_session_token()
    resp  = make_response(jsonify({'token': token}))
    resp.headers['Cache-Control'] = 'no-store, no-cache'
    return resp

# ── PAYLOAD VALIDATION ────────────────────────────────────────────────────────
# SECURITY: Accept only the 'messages' field from the client.
# Model, max_tokens, and system prompt are always set server-side.
# This prevents attackers from overriding the model or injecting system prompts.
def _validate_messages(messages) -> str | None:
    """Return an error string, or None if valid."""
    if not isinstance(messages, list) or not messages:
        return 'messages must be a non-empty list'
    if len(messages) > 10:
        return 'Too many messages'
    for msg in messages:
        if not isinstance(msg, dict):
            return 'Each message must be an object'
        role = msg.get('role')
        content = msg.get('content')
        if role not in ('user', 'assistant'):
            return f'Invalid role: {role!r}'
        if not isinstance(content, str):
            return 'message content must be a string'
        if len(content) > MAX_PROMPT_CHARS:
            return f'Message content exceeds {MAX_PROMPT_CHARS} characters'
    return None

# ── MAIN PROXY ────────────────────────────────────────────────────────────────
@app.route('/proxy.py', methods=['OPTIONS', 'POST'])
def proxy():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    # SECURITY: Validate session token (short-lived, issued per page load).
    session_tok = request.headers.get('X-Session-Token', '')
    if not _validate_session_token(session_tok):
        return jsonify({'error': 'Unauthorized'}), 401

    ip = request.remote_addr or 'unknown'
    if not _check_rate_limit(ip):
        return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({'error': 'Invalid or empty JSON body'}), 400

    # SECURITY: Extract and validate only 'messages'; ignore everything else.
    messages = payload.get('messages')
    err = _validate_messages(messages)
    if err:
        return jsonify({'error': err}), 400

    # SECURITY: Build a clean payload — client cannot override model/tokens/system.
    clean_payload = {
        'model':      ANTHROPIC_MODEL,
        'max_tokens': MAX_TOKENS,
        'system':     SYSTEM_PROMPT,
        'messages':   messages,
    }

    try:
        resp = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'Content-Type':      'application/json',
                'x-api-key':         ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            json=clean_payload,
            timeout=30,
        )
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Connection error: {e}'}), 502

    return make_response(resp.text, resp.status_code,
                         {'Content-Type': 'application/json'})

# ── PDF ENDPOINT ──────────────────────────────────────────────────────────────
# SECURITY: Patterns that could trigger SSRF or local file reads inside the
# Playwright-rendered page are blocked before rendering.
_PDF_DANGEROUS = re.compile(
    r'file://|localhost|127\.0\.0\.|169\.254\.|192\.168\.|10\.\d+\.\d+\.|'
    r'0\.0\.0\.0|<script|XMLHttpRequest|fetch\s*\(|eval\s*\(',
    re.IGNORECASE,
)

@app.route('/pdf.py', methods=['OPTIONS', 'POST'])
def render_pdf():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    session_tok = request.headers.get('X-Session-Token', '')
    if not _validate_session_token(session_tok):
        return jsonify({'error': 'Unauthorized'}), 401

    payload  = request.get_json(silent=True) or {}
    html     = payload.get('html', '')
    filename = payload.get('filename', 'fintori-report.pdf')

    if not html or not isinstance(html, str):
        return jsonify({'error': 'Missing HTML content'}), 400

    # SECURITY: Reject HTML that contains dangerous patterns.
    if _PDF_DANGEROUS.search(html):
        return jsonify({'error': 'HTML contains disallowed content'}), 400

    # SECURITY: Cap size to prevent memory exhaustion.
    if len(html) > 600_000:
        return jsonify({'error': 'HTML content too large'}), 400

    if not re.match(r'^[\w\-]+\.pdf$', filename):
        filename = 'fintori-report.pdf'

    if '<html' not in html.lower():
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * {{ -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }}
    html, body {{ margin: 0; padding: 0; background: #f5f7fb; }}
  </style>
</head>
<body>{html}</body>
</html>"""

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={'width': 1280, 'height': 720})
            page.set_content(html, wait_until='networkidle')
            page.emulate_media(media='screen')
            pdf_bytes = page.pdf(
                format='A4',
                print_background=True,
                scale=0.94,
                margin={'top': '8mm', 'right': '8mm', 'bottom': '8mm', 'left': '8mm'},
            )
            browser.close()
    except Exception as e:
        return jsonify({'error': f'PDF render failed: {e}'}), 500

    response = make_response(pdf_bytes)
    response.headers['Content-Type']        = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

# ── TEST ENDPOINT (remove or gate in production) ──────────────────────────────
# @app.route('/test.py', methods=['GET'])
# def test():
#     # SECURITY: Only accessible in debug/dev mode.
#     if not app.debug:
#         return jsonify({'error': 'Not found'}), 404
#     try:
#         resp = requests.post(
#             'https://api.anthropic.com/v1/messages',
#             headers={'Content-Type': 'application/json'},
#             json={'test': 'ok'},
#             timeout=10,
#         )
#         return f"Connected OK: {resp.text[:100]}"
#     except requests.exceptions.RequestException as e:
#         return f"Connection error: {e}"

# ── DEV SERVER ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)