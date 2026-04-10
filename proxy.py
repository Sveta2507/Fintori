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
ANTHROPIC_MODEL   = 'claude-sonnet-4-6'
MAX_TOKENS        = 400

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
    if request.method == 'OPTIONS':
        return make_response('', 200)

    token = request.headers.get('X-Proxy-Token', '')
    if token != PROXY_TOKEN:
        return jsonify({'error': 'Unauthorized'}), 401

    ip = request.remote_addr or 'unknown'
    if not _check_rate_limit(ip):
        return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({'error': 'Invalid or empty JSON body'}), 400

    # Force the model and tokens
    payload['model']      = ANTHROPIC_MODEL
    payload['max_tokens'] = MAX_TOKENS

    # ── ADDING A SYSTEM PROMPT WITH CACHING ──────────────────────
    # This block is sent as a system request with cache_control.
    # Anthropic caches it for 5 minutes—repeat requests do not consume
    # access tokens for this text (only ~10% cache read fee).
    SYSTEM_PROMPT = """You are a precise UK small business financial analyst. You give factual, conservative analysis based only on provided numbers. Never speculate beyond the data. Never give tax advice — always recommend consulting a qualified accountant for tax matters.

UK TAX & COMPLIANCE REFERENCE (2025/26):
- Corporation Tax: 19% (profits up to £50,000), 25% (profits over £250,000), marginal relief between
- VAT registration threshold: £90,000 annual taxable turnover. Must register within 30 days of exceeding threshold.
- VAT standard rate: 20%. Reduced rate 5%. Zero rate 0%.
- National Living Wage (Apr 2025): £12.21/hr (21+), £10.00/hr (18-20), £7.55/hr (under 18 & apprentice)
- Employer NIC: 15% on earnings above £5,000/yr secondary threshold (from Apr 2025)
- Employee NIC: 8% on earnings £12,570–£50,270, 2% above
- Income Tax bands: Personal allowance £12,570. Basic rate 20% (£12,571–£50,270). Higher rate 40% (£50,271–£125,140). Additional rate 45% above.
- Business rates: based on rateable value, multiplier 49.9p (small) or 54.6p (standard) 2025/26
- Annual Investment Allowance: £1,000,000
- R&D relief: SME scheme 186% deduction or 13% RDEC credit
- Making Tax Digital: mandatory for VAT-registered businesses

UK SME FINANCIAL BENCHMARKS BY SECTOR (ONS/HMRC 2024/25):
Hospitality: gross margin 25%, net margin 5.5%, debtor days 21, stock days 14
Retail Physical: gross margin 35%, net margin 4%, debtor days 30, stock days 45
E-commerce: gross margin 40%, net margin 8.5%, debtor days 14, stock days 30
Construction: gross margin 20%, net margin 6%, debtor days 45, stock days 60
Professional Services: gross margin 60%, net margin 20%, debtor days 30
IT/Technology: gross margin 65%, net margin 17%, debtor days 30
Health & Beauty: gross margin 50%, net margin 11.5%, debtor days 21, stock days 30
Manufacturing: gross margin 32.5%, net margin 7%, debtor days 45, stock days 60
Transport & Logistics: gross margin 20%, net margin 5%, debtor days 30
Education/Training: gross margin 52.5%, net margin 15%, debtor days 30
Financial Services: gross margin 70%, net margin 27.5%, debtor days 21

FINANCIAL HEALTH THRESHOLDS:
- Net margin: <0% critical, 0-5% poor, 5-10% acceptable, >10% healthy
- Gross margin: <15% critical, 15-20% low, 20-35% moderate, >35% strong
- Cash runway: <1 month danger, 1-3 months tight, >3 months acceptable
- Working capital ratio: <1.0x danger, 1.0-1.5x tight, >1.5x healthy
- Debt/revenue: <3x manageable, 3-6x monitor, >6x high risk
- Debtor days: target varies by sector (see benchmarks above)

RESPONSE RULES:
1. Base analysis ONLY on provided numbers. Do not invent figures.
2. Keep responses concise — maximum 3 sentences per section unless more is essential.
3. Always recommend consulting a qualified accountant or tax adviser for tax-specific decisions.
4. Flag if data seems inconsistent (e.g. costs exceed revenue by large margin).
5. Use British English. Use £ symbol for currency.
6. Return ONLY valid JSON as specified. No markdown, no preamble."""

    # Inserting a system with caching
    payload['system'] = [
        {
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"}
        }
    ]

    # Enable the caching beta feature
    try:
        resp = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'Content-Type':      'application/json',
                'x-api-key':         ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-beta':    'prompt-caching-2024-07-31',
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