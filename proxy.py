"""
Fintori · Anthropic API Proxy  (Python / Flask)
Replaces proxy.php — identical behaviour, zero PHP dependency.
"""

import json
import time
import hashlib
import os
import tempfile
from io import BytesIO

from dotenv import load_dotenv
import requests
from flask import Flask, request, jsonify, make_response


load_dotenv()  # load .env in local development

# ── CONFIG ───────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
if not ANTHROPIC_API_KEY:
    raise RuntimeError('Missing ANTHROPIC_API_KEY environment variable')

PROXY_TOKEN = os.getenv('PROXY_TOKEN')
if not PROXY_TOKEN:
    raise RuntimeError('Missing PROXY_TOKEN environment variable')
RATE_LIMIT        = 30          # requests per hour per IP
ANTHROPIC_MODEL   = 'claude-sonnet-4-20250514'
MAX_TOKENS        = 1000

app = Flask(__name__)

# ── CORS helper ───────────────────────────────────────────────────────────────
def _add_cors(response):
    response.headers['Access-Control-Allow-Origin']  = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Proxy-Token'
    return response


@app.after_request
def after_request(response):
    return _add_cors(response)


# ── RATE LIMIT (file-based, same logic as PHP version) ────────────────────────
def _check_rate_limit(ip: str) -> bool:
    """Returns True if request is allowed, False if limit exceeded."""
    filename = os.path.join(tempfile.gettempdir(),
                            f"fintori_{hashlib.md5(ip.encode()).hexdigest()}.json")
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


# ── MAIN PROXY ENDPOINT ───────────────────────────────────────────────────────
@app.route('/proxy.py', methods=['OPTIONS', 'POST'])
def proxy():
    # Pre-flight
    if request.method == 'OPTIONS':
        return make_response('', 200)

    # Token auth
    token = request.headers.get('X-Proxy-Token', '')
    if token != PROXY_TOKEN:
        return jsonify({'error': 'Unauthorized'}), 401

    # Rate limit
    ip = request.remote_addr or 'unknown'
    if not _check_rate_limit(ip):
        return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429

    # Parse body
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({'error': 'Invalid or empty JSON body'}), 400

    # Force model & max_tokens (same as PHP version)
    payload['model']      = ANTHROPIC_MODEL
    payload['max_tokens'] = MAX_TOKENS

    # Forward to Anthropic
    try:
        resp = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'Content-Type':      'application/json',
                'x-api-key':         ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            json=payload,
            timeout=30,
        )
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Connection error: {e}'}), 502

    return make_response(resp.text, resp.status_code,
                         {'Content-Type': 'application/json'})


# ── TEST ENDPOINT (replaces test.php) ─────────────────────────────────────────
@app.route('/test.py', methods=['GET'])
def test():
    """Quick connectivity test — mirrors test.php behaviour."""
    try:
        resp = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers={'Content-Type': 'application/json'},
            json={'test': 'ok'},
            timeout=10,
        )
        return f"Connected OK: {resp.text[:100]}"
    except requests.exceptions.RequestException as e:
        return f"Connection error: {e}"


@app.route('/pdf.py', methods=['OPTIONS', 'POST'])
def render_pdf():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    token = request.headers.get('X-Proxy-Token', '')
    if token != PROXY_TOKEN:
        return jsonify({'error': 'Unauthorized'}), 401

    payload = request.get_json(silent=True) or {}
    html = payload.get('html', '')
    filename = payload.get('filename', 'fintori-report.pdf')

    if not html or not isinstance(html, str):
        return jsonify({'error': 'Missing HTML content'}), 400

    if not filename.lower().endswith('.pdf'):
        filename = f'{filename}.pdf'

    if '<html' in html.lower():
        wrapped_html = html
    else:
        wrapped_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {{
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      box-sizing: border-box;
    }}
    html, body {{
      margin: 0;
      padding: 0;
      background: #f5f7fb;
    }}
  </style>
</head>
<body>
{html}
</body>
</html>"""

    try:
        from playwright.sync_api import sync_playwright  # lazy import — see note above
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={'width': 1280, 'height': 720}, device_scale_factor=1)
            page.set_content(wrapped_html, wait_until='networkidle')
            page.emulate_media(media='screen')
            page.wait_for_load_state('networkidle')
            pdf_bytes = page.pdf(
                format='A4',
                print_background=True,
                scale=0.94,
                margin={'top': '8mm', 'right': '8mm', 'bottom': '8mm', 'left': '8mm'},
                prefer_css_page_size=True
            )
            browser.close()
    except Exception as e:
        return jsonify({'error': f'PDF render failed: {e}'}), 500

    response = make_response(pdf_bytes)
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# ── DEV SERVER ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)