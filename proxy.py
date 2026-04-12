"""
Fintori · Anthropic API Proxy (Python / Flask)
"""

import json
import time
import hashlib
import os
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

RATE_LIMIT      = 30
ANTHROPIC_MODEL = 'claude-sonnet-4-6'
MAX_TOKENS      = 400

#$0.00426
# SYSTEM_PROMPT = """UK small business financial analyst. Analyse only provided numbers. Never invent figures. For tax/legal matters refer to ACA/ACCA accountant.

# TAX 2025/26: Corp Tax 19%(≤£50k)/25%(>£250k). VAT threshold £90k, standard 20%. NLW £12.21/hr(21+). Employer NIC 15% above £5k/yr. Employee NIC 8% on £12,570-£50,270. Income Tax: £12,570 allowance, 20% to £50,270, 40% to £125,140, 45% above.

# BENCHMARKS: Hospitality gross 25% net 5.5% debt 21d stock 14d. Retail gross 35% net 4% debt 30d stock 45d. Ecommerce gross 40% net 8.5% debt 14d stock 30d. Construction gross 20% net 6% debt 45d stock 60d. Professional gross 60% net 20% debt 30d. IT gross 65% net 17% debt 30d. Health gross 50% net 11.5% debt 21d stock 30d. Manufacturing gross 32.5% net 7% debt 45d stock 60d. Transport gross 20% net 5% debt 30d. Education gross 52.5% net 15% debt 30d. Finance gross 70% net 27.5% debt 21d. Other gross 37.5% net 8.8% debt 30d stock 45d.

# THRESHOLDS: Net margin <0% critical, 0-5% poor, 5-10% ok, >10% healthy. Gross <15% critical, 15-20% low, 20-35% moderate, >35% strong. Runway <1mo danger, 1-3mo tight, >3mo ok. WC ratio <1x danger, 1-1.5x tight, >1.5x healthy. Debt/rev <3x ok, 3-6x monitor, >6x high risk.

# Return ONLY the JSON format specified. No markdown. British English. £ for currency."""

#  $0.00744
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
def _add_cors(response):
    response.headers['Access-Control-Allow-Origin']  = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Proxy-Token'
    return response

@app.after_request
def after_request(response):
    return _add_cors(response)

# ── RATE LIMIT ────────────────────────────────────────────────────────────────
def _check_rate_limit(ip: str) -> bool:
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

# ── MAIN PROXY ────────────────────────────────────────────────────────────────
@app.route('/proxy.py', methods=['OPTIONS', 'POST'])
def proxy():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    if request.headers.get('X-Proxy-Token', '') != PROXY_TOKEN:
        return jsonify({'error': 'Unauthorized'}), 401

    ip = request.remote_addr or 'unknown'
    if not _check_rate_limit(ip):
        return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({'error': 'Invalid or empty JSON body'}), 400

    payload['model']      = ANTHROPIC_MODEL
    payload['max_tokens'] = MAX_TOKENS
    payload['system']     = SYSTEM_PROMPT
    
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

    # for debugging prompt cost
    # try:
    #     d = resp.json()
    #     u = d.get('usage', {})
    #     inp  = u.get('input_tokens', 0)
    #     out  = u.get('output_tokens', 0)
    #     cost = (inp / 1_000_000) * 3.00 + (out / 1_000_000) * 15.00
    #     print(f"in={inp} out={out} ${cost:.5f}")
    # except Exception:
    #     pass

    return make_response(resp.text, resp.status_code,
                         {'Content-Type': 'application/json'})

# ── TEST ENDPOINT ─────────────────────────────────────────────────────────────
@app.route('/test.py', methods=['GET'])
def test():
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

# ── PDF ENDPOINT ──────────────────────────────────────────────────────────────
@app.route('/pdf.py', methods=['OPTIONS', 'POST'])
def render_pdf():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    if request.headers.get('X-Proxy-Token', '') != PROXY_TOKEN:
        return jsonify({'error': 'Unauthorized'}), 401

    payload  = request.get_json(silent=True) or {}
    html     = payload.get('html', '')
    filename = payload.get('filename', 'fintori-report.pdf')

    if not html or not isinstance(html, str):
        return jsonify({'error': 'Missing HTML content'}), 400

    if not filename.lower().endswith('.pdf'):
        filename = f'{filename}.pdf'

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
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

# ── DEV SERVER ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)