"""
Fintori · Anthropic API Proxy + Auth Backend (Python / Flask)
Hardened version with user authentication, plans, and calculation history.
"""

import json
import time
import hashlib
import os
import re
import secrets
import tempfile
from datetime import datetime, timedelta, timezone
from functools import wraps

from dotenv import load_dotenv
import requests
from flask import Flask, request, jsonify, make_response, redirect, session
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from authlib.integrations.flask_client import OAuth

try:
    import stripe
except ImportError:
    stripe = None

load_dotenv()

# ── CONFIG ────────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
if not ANTHROPIC_API_KEY:
    raise RuntimeError('Missing ANTHROPIC_API_KEY')

PROXY_TOKEN = os.getenv('PROXY_TOKEN')
if not PROXY_TOKEN:
    raise RuntimeError('Missing PROXY_TOKEN')

SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    raise RuntimeError('Missing SECRET_KEY')

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///fintori.db')
# Render gives postgres:// but SQLAlchemy 1.4+ needs postgresql://
if DATABASE_URL.startswith('postgres://'):
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)

GOOGLE_CLIENT_ID     = os.getenv('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET')
APP_BASE_URL         = os.getenv('APP_BASE_URL', 'http://localhost:5500')
BACKEND_BASE_URL     = os.getenv('BACKEND_BASE_URL', 'http://localhost:5000')
STRIPE_SECRET_KEY    = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PRICE_ID      = os.getenv('STRIPE_PRICE_ID')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
STRIPE_PRO_AMOUNT_PENCE = int(os.getenv('STRIPE_PRO_AMOUNT_PENCE', '500'))
STRIPE_PRO_CURRENCY = os.getenv('STRIPE_PRO_CURRENCY', 'gbp').lower()
DEV_PRO_BYPASS = os.getenv('DEV_PRO_BYPASS', '1').lower() in ('1', 'true', 'yes')
if stripe and STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv('ALLOWED_ORIGINS', '').split(',')
    if o.strip()
]
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = ['http://localhost:5000', 'http://127.0.0.1:5500']

RATE_LIMIT       = 30
ANTHROPIC_MODEL  = 'claude-sonnet-4-6'
MAX_TOKENS       = 400
MAX_PROMPT_CHARS = 6000
SESSION_TOKEN_TTL = 3600

FREE_AI_LIMIT  = 1   # AI reports for free users (trial)
FREE_PDF_LIMIT = 1   # PDF exports for free users (trial)
PAID_AI_LIMIT  = 50  # AI reports per month for paid users

_session_tokens: dict[str, dict] = {}  # token -> {user_id, ts}

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

# ── APP INIT ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY']                       = SECRET_KEY
app.config['SQLALCHEMY_DATABASE_URI']          = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS']   = False
app.config['SESSION_COOKIE_SECURE']            = BACKEND_BASE_URL.startswith('https://')
app.config['SESSION_COOKIE_HTTPONLY']          = True
app.config['SESSION_COOKIE_SAMESITE']          = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME']       = timedelta(days=30)

db     = SQLAlchemy(app)
bcrypt = Bcrypt(app)
oauth  = OAuth(app)

google = oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'},
)

# ── MODELS ────────────────────────────────────────────────────────────────────
class User(db.Model):
    __tablename__ = 'users'

    id            = db.Column(db.Integer, primary_key=True)
    email         = db.Column(db.String(254), unique=True, nullable=False, index=True)
    # NULL for Google OAuth users (no password)
    password_hash = db.Column(db.String(255), nullable=True)
    first_name    = db.Column(db.String(100), nullable=False)
    last_name     = db.Column(db.String(100), nullable=False)
    second_name   = db.Column(db.String(100), nullable=True)
    company_name  = db.Column(db.String(200), nullable=True)
    plan          = db.Column(db.String(20), nullable=False, default='free')  # 'free' | 'paid'

    # Stripe subscription linkage
    stripe_customer_id = db.Column(db.String(255), nullable=True, index=True)
    stripe_subscription_id = db.Column(db.String(255), nullable=True, index=True)
    stripe_subscription_status = db.Column(db.String(50), nullable=True)
    stripe_checkout_session_id = db.Column(db.String(255), nullable=True)

    google_id     = db.Column(db.String(128), unique=True, nullable=True)
    terms_accepted = db.Column(db.Boolean, nullable=False, default=False)
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    # Trial usage counters (free users only)
    ai_trial_used  = db.Column(db.Integer, nullable=False, default=0)
    pdf_trial_used = db.Column(db.Integer, nullable=False, default=0)
    # Paid plan monthly usage (resets each calendar month)
    ai_used_month  = db.Column(db.Integer, nullable=False, default=0)
    ai_reset_month = db.Column(db.String(7), nullable=True)  # 'YYYY-MM'
    # Banner dismissed flag
    upgrade_banner_dismissed = db.Column(db.Boolean, nullable=False, default=False)

    calculations = db.relationship('Calculation', backref='user',
                                   lazy=True, cascade='all, delete-orphan',
                                   order_by='Calculation.created_at.desc()')

    def set_password(self, password: str):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password: str) -> bool:
        if not self.password_hash:
            return False
        return bcrypt.check_password_hash(self.password_hash, password)

    def can_use_ai(self) -> bool:
        if self.plan == 'paid':
            self._reset_monthly_ai_if_needed()
            return self.ai_used_month < PAID_AI_LIMIT
        return self.ai_trial_used < FREE_AI_LIMIT

    def can_use_pdf(self) -> bool:
        if self.plan == 'paid':
            return True
        return self.pdf_trial_used < FREE_PDF_LIMIT

    def increment_ai_usage(self):
        if self.plan == 'paid':
            self._reset_monthly_ai_if_needed()
            self.ai_used_month += 1
        else:
            self.ai_trial_used += 1
        db.session.commit()

    def increment_pdf_usage(self):
        if self.plan == 'free':
            self.pdf_trial_used += 1
            db.session.commit()

    def _reset_monthly_ai_if_needed(self):
        current_month = datetime.now(timezone.utc).strftime('%Y-%m')
        if self.ai_reset_month != current_month:
            self.ai_used_month  = 0
            self.ai_reset_month = current_month
            db.session.commit()

    def to_public_dict(self) -> dict:
        self._reset_monthly_ai_if_needed()
        return {
            'id':           self.id,
            'email':        self.email,
            'first_name':   self.first_name,
            'last_name':    self.last_name,
            'second_name':  self.second_name,
            'company_name': self.company_name,
            'plan':         self.plan,
            'stripe_subscription_status': self.stripe_subscription_status,
            'has_stripe_customer': bool(self.stripe_customer_id),
            'ai_remaining': (PAID_AI_LIMIT - self.ai_used_month)
                            if self.plan == 'paid'
                            else max(0, FREE_AI_LIMIT - self.ai_trial_used),
            'pdf_remaining': 999 if self.plan == 'paid'
                             else max(0, FREE_PDF_LIMIT - self.pdf_trial_used),
            'upgrade_banner_dismissed': self.upgrade_banner_dismissed,
        }


class Calculation(db.Model):
    __tablename__ = 'calculations'

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    created_at  = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    # Snapshot of key results (JSON string, encrypted at rest via DB-level encryption
    # or use SQLAlchemy-Utils EncryptedType for column-level — simplified here)
    summary_json = db.Column(db.Text, nullable=False)
    # Human-readable label derived from data
    label        = db.Column(db.String(200), nullable=True)

    def to_dict(self) -> dict:
        return {
            'id':         self.id,
            'created_at': self.created_at.strftime('%d %b %Y, %H:%M'),
            'label':      self.label or f'Calculation #{self.id}',
            'summary':    json.loads(self.summary_json),
        }


# ── DB INIT ───────────────────────────────────────────────────────────────────
def _ensure_stripe_user_columns():
    """
    migration helper.
    db.create_all() creates missing tables, but it does not add new columns
    to an already existing users table
    """
    engine = db.engine
    inspector = db.inspect(engine)

    if 'users' not in inspector.get_table_names():
        return

    existing_columns = {col['name'] for col in inspector.get_columns('users')}

    stripe_columns = {
        'stripe_customer_id': 'VARCHAR(255)',
        'stripe_subscription_id': 'VARCHAR(255)',
        'stripe_subscription_status': 'VARCHAR(50)',
        'stripe_checkout_session_id': 'VARCHAR(255)',
    }

    with engine.begin() as conn:
        for column_name, column_type in stripe_columns.items():
            if column_name not in existing_columns:
                conn.exec_driver_sql(
                    f'ALTER TABLE users ADD COLUMN {column_name} {column_type}'
                )


with app.app_context():
    db.create_all()
    _ensure_stripe_user_columns()

@app.route('/health')
def health():
    return jsonify({'ok': True})

# ── CORS ──────────────────────────────────────────────────────────────────────
def _add_cors(response):
    origin = request.headers.get('Origin', '')
    if origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin']       = origin
        response.headers['Vary']                              = 'Origin'
        response.headers['Access-Control-Allow-Methods']      = 'POST, OPTIONS, GET, DELETE, PATCH'
    response.headers['Access-Control-Allow-Headers']      = (
        'Content-Type, X-Proxy-Token, X-Session-Token, X-Auth-Token'
    )
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

@app.after_request
def after_request(response):
    response = _add_cors(response)
    response.headers['X-Frame-Options']        = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy']        = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy']     = 'geolocation=(), microphone=(), camera=()'
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

# ── SESSION TOKEN STORE (for AI/PDF proxy) ────────────────────────────────────
def _purge_expired_tokens():
    now = time.time()
    expired = [t for t, d in _session_tokens.items()
               if now - d['ts'] > SESSION_TOKEN_TTL]
    for t in expired:
        del _session_tokens[t]

def _issue_session_token(user_id: int) -> str:
    _purge_expired_tokens()
    token = secrets.token_hex(32)
    _session_tokens[token] = {'user_id': user_id, 'ts': time.time()}
    return token

def _validate_session_token(token: str) -> 'User | None':
    _purge_expired_tokens()
    entry = _session_tokens.get(token)
    if not entry:
        return None
    if time.time() - entry['ts'] > SESSION_TOKEN_TTL:
        del _session_tokens[token]
        return None
    return User.query.get(entry['user_id'])

# ── AUTH HELPERS ──────────────────────────────────────────────────────────────
def _get_auth_user() -> 'User | None':
    """Read user_id from Flask session cookie or short-lived auth token."""
    token = request.headers.get('X-Auth-Token', '').strip()
    if token:
        user = _validate_session_token(token)
        if user:
            return user

    uid = session.get('user_id')
    if not uid:
        return None
    return User.query.get(uid)

def _login_user(user: User):
    session.permanent = True
    session['user_id'] = user.id

def _logout_user():
    session.pop('user_id', None)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # Пропускаем OPTIONS preflight без проверки авторизации
        if request.method == 'OPTIONS':
            return make_response('', 200)
        user = _get_auth_user()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, user=user, **kwargs)
    return decorated

# ── VALIDATION ────────────────────────────────────────────────────────────────
EMAIL_RE    = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
# Min 8 chars, at least one uppercase, one lowercase, one digit, one special char
PASSWORD_RE = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{8,}$'
)

def _validate_email(email: str) -> str | None:
    if not email or len(email) > 254:
        return 'Invalid email address.'
    if not EMAIL_RE.match(email):
        return 'Invalid email address.'
    return None

def _validate_password(password: str) -> str | None:
    if not password or len(password) < 8:
        return 'Password must be at least 8 characters.'
    if len(password) > 128:
        return 'Password is too long.'
    if not PASSWORD_RE.match(password):
        return ('Password must contain at least one uppercase letter, '
                'one lowercase letter, one number, and one special character.')
    return None

# ── AUTH ENDPOINTS ────────────────────────────────────────────────────────────

@app.route('/auth/register', methods=['POST', 'OPTIONS'])
def register():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    data = request.get_json(silent=True) or {}

    email        = (data.get('email') or '').strip().lower()
    password     = data.get('password') or ''
    password2    = data.get('password2') or ''
    first_name   = (data.get('first_name') or '').strip()
    last_name    = (data.get('last_name') or '').strip()
    second_name  = (data.get('second_name') or '').strip() or None
    company_name = (data.get('company_name') or '').strip() or None
    terms        = data.get('terms_accepted', False)

    errors = {}

    email_err = _validate_email(email)
    if email_err:
        errors['email'] = email_err

    pw_err = _validate_password(password)
    if pw_err:
        errors['password'] = pw_err
    elif password != password2:
        errors['password2'] = 'Passwords do not match.'

    if not first_name:
        errors['first_name'] = 'First name is required.'
    elif len(first_name) > 100:
        errors['first_name'] = 'First name is too long.'

    if not last_name:
        errors['last_name'] = 'Last name is required.'
    elif len(last_name) > 100:
        errors['last_name'] = 'Last name is too long.'

    if not terms:
        errors['terms'] = 'You must accept the Terms of Service.'

    if errors:
        return jsonify({'errors': errors}), 422

    if User.query.filter_by(email=email).first():
        return jsonify({'errors': {'email': 'An account with this email already exists.'}}), 409

    user = User(
        email        = email,
        first_name   = first_name,
        last_name    = last_name,
        second_name  = second_name,
        company_name = company_name,
        terms_accepted = bool(terms),
        plan         = 'free',
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    _login_user(user)
    token = _issue_session_token(user.id)
    return jsonify({'user': user.to_public_dict(), 'session_token': token}), 201


@app.route('/auth/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    data     = request.get_json(silent=True) or {}
    email    = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    # Constant-time-ish: always call check_password to prevent timing attacks
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid email or password.'}), 401

    _login_user(user)
    token = _issue_session_token(user.id)
    return jsonify({'user': user.to_public_dict(), 'session_token': token})


@app.route('/auth/logout', methods=['POST', 'OPTIONS'])
def logout():
    if request.method == 'OPTIONS':
        return make_response('', 200)
    _logout_user()
    return jsonify({'ok': True})


@app.route('/auth/me', methods=['GET', 'OPTIONS'])
def auth_me():
    if request.method == 'OPTIONS':
        return make_response('', 200)
    user = _get_auth_user()
    if not user:
        return jsonify({'user': None})
    token = _issue_session_token(user.id)
    return jsonify({'user': user.to_public_dict(), 'session_token': token})


# ── GOOGLE OAUTH ──────────────────────────────────────────────────────────────

@app.route('/auth/google')
def google_login():
    redirect_uri = f"{BACKEND_BASE_URL}/auth/google/callback"
    return google.authorize_redirect(redirect_uri)


@app.route('/auth/google/callback')
def google_callback():
    try:
        token_data = google.authorize_access_token()
        userinfo   = token_data.get('userinfo') or google.userinfo()
    except Exception:
        return redirect(f"{APP_BASE_URL}/auth.html?error=google_failed")

    google_id  = userinfo.get('sub')
    email      = (userinfo.get('email') or '').lower()
    first_name = userinfo.get('given_name') or userinfo.get('name', 'User')
    last_name  = userinfo.get('family_name') or ''

    if not google_id or not email:
        return redirect(f"{APP_BASE_URL}/auth.html?error=google_failed")

    # Find by Google ID first, then by email (account linking)
    user = User.query.filter_by(google_id=google_id).first()
    if not user:
        user = User.query.filter_by(email=email).first()
        if user:
            # Link existing account
            user.google_id = google_id
            db.session.commit()
        else:
            # New user via Google — terms are implicitly accepted by Google sign-in
            user = User(
                email        = email,
                first_name   = first_name,
                last_name    = last_name,
                google_id    = google_id,
                plan         = 'free',
                terms_accepted = True,
            )
            db.session.add(user)
            db.session.commit()

    _login_user(user)
    token = _issue_session_token(user.id)
    # Pass token to frontend via URL fragment (never stored in server logs)
    return redirect(f"{APP_BASE_URL}/app.html?auth_token={token}")


# ── BANNER DISMISS ────────────────────────────────────────────────────────────

@app.route('/auth/dismiss-banner', methods=['POST', 'OPTIONS'])
@require_auth
def dismiss_banner(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)
    user.upgrade_banner_dismissed = True
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/auth/profile', methods=['PATCH', 'OPTIONS'])
@require_auth
def update_profile(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    data = request.get_json(silent=True) or {}
    first_name   = (data.get('first_name') or '').strip()
    last_name    = (data.get('last_name') or '').strip()
    second_name  = (data.get('second_name') or '').strip() or None
    company_name = (data.get('company_name') or '').strip() or None

    errors = {}
    if not first_name:
        errors['first_name'] = 'First name is required.'
    elif len(first_name) > 100:
        errors['first_name'] = 'First name is too long.'

    if not last_name:
        errors['last_name'] = 'Last name is required.'
    elif len(last_name) > 100:
        errors['last_name'] = 'Last name is too long.'

    if company_name and len(company_name) > 200:
        errors['company_name'] = 'Company name is too long.'

    if second_name and len(second_name) > 100:
        errors['second_name'] = 'Second name is too long.'

    if errors:
        return jsonify({'errors': errors}), 422

    user.first_name = first_name
    user.last_name = last_name
    user.second_name = second_name
    user.company_name = company_name
    db.session.commit()
    token = _issue_session_token(user.id)
    return jsonify({'user': user.to_public_dict(), 'session_token': token})


@app.route('/auth/password', methods=['POST', 'OPTIONS'])
@require_auth
def change_password(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    if not user.password_hash:
        return jsonify({'error': 'Password changes are unavailable for Google sign-in accounts.'}), 400

    data = request.get_json(silent=True) or {}
    current_password = data.get('current_password') or ''
    new_password     = data.get('new_password') or ''
    new_password2    = data.get('new_password2') or ''

    errors = {}
    if not user.check_password(current_password):
        errors['current_password'] = 'Current password is incorrect.'

    pw_err = _validate_password(new_password)
    if pw_err:
        errors['new_password'] = pw_err
    elif new_password != new_password2:
        errors['new_password2'] = 'Passwords do not match.'

    if errors:
        return jsonify({'errors': errors}), 422

    user.set_password(new_password)
    db.session.commit()
    token = _issue_session_token(user.id)
    return jsonify({'ok': True, 'session_token': token})


@app.route('/auth/delete-request', methods=['POST', 'OPTIONS'])
@require_auth
def request_account_deletion(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    app.logger.warning(
        'Account deletion requested for user_id=%s email=%s at %s',
        user.id,
        user.email,
        datetime.now(timezone.utc).isoformat(),
    )
    return jsonify({
        'ok': True,
        'message': 'Account deletion request received. The Fintori team will review it shortly.',
    })


# ── CALCULATION HISTORY ───────────────────────────────────────────────────────

@app.route('/history', methods=['GET', 'POST', 'OPTIONS'])
@require_auth
def history_endpoint(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    if request.method == 'GET':
        calcs = user.calculations
        return jsonify({'history': [c.to_dict() for c in calcs]})

    # POST
    data    = request.get_json(silent=True) or {}
    summary = data.get('summary')
    if not summary or not isinstance(summary, dict):
        return jsonify({'error': 'Invalid summary'}), 400

    existing = Calculation.query.filter_by(user_id=user.id)\
                                .order_by(Calculation.created_at.desc()).all()
    if len(existing) >= 100:
        oldest = existing[-1]
        db.session.delete(oldest)

    label = _build_calc_label(summary)
    calc  = Calculation(
        user_id      = user.id,
        summary_json = json.dumps(summary),
        label        = label,
    )
    db.session.add(calc)
    db.session.commit()
    return jsonify({'id': calc.id, 'label': label}), 201

def save_calculation(user):
    data    = request.get_json(silent=True) or {}
    summary = data.get('summary')
    if not summary or not isinstance(summary, dict):
        return jsonify({'error': 'Invalid summary'}), 400

    # Limit history to 100 entries per user to prevent unbounded growth
    existing = Calculation.query.filter_by(user_id=user.id)\
                                .order_by(Calculation.created_at.desc()).all()
    if len(existing) >= 100:
        oldest = existing[-1]
        db.session.delete(oldest)

    label = _build_calc_label(summary)
    calc  = Calculation(
        user_id      = user.id,
        summary_json = json.dumps(summary),
        label        = label,
    )
    db.session.add(calc)
    db.session.commit()
    return jsonify({'id': calc.id, 'label': label}), 201


@app.route('/history/<int:calc_id>', methods=['DELETE', 'OPTIONS'])
@require_auth
def delete_calculation(user, calc_id):
    if request.method == 'OPTIONS':
        return make_response('', 200)
    calc = Calculation.query.filter_by(id=calc_id, user_id=user.id).first()
    if not calc:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(calc)
    db.session.commit()
    return jsonify({'ok': True})


def _build_calc_label(summary: dict) -> str:
    rev    = summary.get('avgRev', 0)
    margin = summary.get('netMgn', 0)
    sector = summary.get('sector', '')
    rev_str    = f"£{int(rev):,}/mo" if rev else ''
    margin_str = f"{margin*100:.1f}% margin" if margin else ''
    parts = [p for p in [sector.title(), rev_str, margin_str] if p]
    return ' · '.join(parts) if parts else 'Analysis'


# ── SESSION TOKEN ENDPOINT ────────────────────────────────────────────────────

@app.route('/session-token', methods=['GET', 'OPTIONS'])
def session_token():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    # Accept either Flask session cookie or X-Auth-Token header
    user = _get_auth_user()
    if not user:
        auth_header = request.headers.get('X-Auth-Token', '')
        if auth_header:
            entry = _session_tokens.get(auth_header)
            if entry:
                user = User.query.get(entry['user_id'])

    if not user:
        return jsonify({'error': 'Authentication required'}), 401

    ip = request.remote_addr or 'unknown'
    if not _check_rate_limit(ip):
        return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429

    token = _issue_session_token(user.id)
    resp  = make_response(jsonify({'token': token}))
    resp.headers['Cache-Control'] = 'no-store, no-cache'
    return resp


# ── PAYLOAD VALIDATION ────────────────────────────────────────────────────────

def _validate_messages(messages) -> str | None:
    if not isinstance(messages, list) or not messages:
        return 'messages must be a non-empty list'
    if len(messages) > 10:
        return 'Too many messages'
    for msg in messages:
        if not isinstance(msg, dict):
            return 'Each message must be an object'
        role    = msg.get('role')
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

    session_tok = request.headers.get('X-Session-Token', '')
    user = _validate_session_token(session_tok)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401

    # Check AI usage quota
    if not user.can_use_ai():
        if user.plan == 'free':
            return jsonify({
                'error': 'trial_exhausted',
                'message': 'You have used your free AI report. Upgrade to Pro for 50 reports/month.'
            }), 403
        return jsonify({'error': 'Monthly AI limit reached (50/month).'}), 429

    ip = request.remote_addr or 'unknown'
    if not _check_rate_limit(ip):
        return jsonify({'error': 'Rate limit exceeded. Try again later.'}), 429

    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({'error': 'Invalid or empty JSON body'}), 400

    messages = payload.get('messages')
    err = _validate_messages(messages)
    if err:
        return jsonify({'error': err}), 400

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

    if resp.status_code == 200:
        user.increment_ai_usage()
        # Вернуть обновлённые данные пользователя в заголовке
        response = make_response(resp.text, resp.status_code,
                                 {'Content-Type': 'application/json'})
        response.headers['X-User-Data'] = json.dumps(user.to_public_dict())
        return response

    return make_response(resp.text, resp.status_code,
                         {'Content-Type': 'application/json'})


# ── PDF ENDPOINT ──────────────────────────────────────────────────────────────

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
    user = _validate_session_token(session_tok)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401

    # Check PDF quota
    if not user.can_use_pdf():
        return jsonify({
            'error': 'trial_exhausted',
            'message': 'You have used your free PDF export. Upgrade to Pro for unlimited exports.'
        }), 403

    payload  = request.get_json(silent=True) or {}
    html     = payload.get('html', '')
    filename = payload.get('filename', 'fintori-report.pdf')

    if not html or not isinstance(html, str):
        return jsonify({'error': 'Missing HTML content'}), 400

    if _PDF_DANGEROUS.search(html):
        return jsonify({'error': 'HTML contains disallowed content'}), 400

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
            page    = browser.new_page(viewport={'width': 1280, 'height': 720})
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

    user.increment_pdf_usage()
    # Обновить данные пользователя на фронтенде
    updated_user = json.dumps(user.to_public_dict())

    response = make_response(pdf_bytes)
    response.headers['X-User-Data'] = updated_user
    response.headers['Content-Type']        = 'application/pdf'
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# ── UPGRADE / SUBSCRIPTION ────────────────────────────────────────────────────
def _set_user_paid_from_stripe(
    user: User,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    stripe_subscription_status: str | None = 'active',
    stripe_checkout_session_id: str | None = None,
):
    user.plan = 'paid'
    user.ai_used_month = 0
    user.ai_reset_month = datetime.now(timezone.utc).strftime('%Y-%m')

    if stripe_customer_id:
        user.stripe_customer_id = stripe_customer_id
    if stripe_subscription_id:
        user.stripe_subscription_id = stripe_subscription_id
    if stripe_subscription_status:
        user.stripe_subscription_status = stripe_subscription_status
    if stripe_checkout_session_id:
        user.stripe_checkout_session_id = stripe_checkout_session_id

    db.session.commit()


def _set_user_free_from_stripe(user: User, stripe_subscription_status: str | None = None):
    user.plan = 'free'
    if stripe_subscription_status:
        user.stripe_subscription_status = stripe_subscription_status
    db.session.commit()

def _stripe_value(obj, key, default=None):
    """
    reads values from StripeObject or dict.
    """
    if obj is None:
        return default

    if isinstance(obj, dict):
        return obj.get(key, default)

    try:
        return getattr(obj, key)
    except AttributeError:
        return default

def _get_subscription_id(subscription_obj):
    if not subscription_obj:
        return None
    if isinstance(subscription_obj, str):
        return subscription_obj
    return _stripe_value(subscription_obj, 'id')


def _get_subscription_status(subscription_obj):
    if not subscription_obj or isinstance(subscription_obj, str):
        return None
    return _stripe_value(subscription_obj, 'status')

def _stripe_missing_config() -> list[str]:
    missing = []
    if stripe is None:
        missing.append('stripe package')
    if not STRIPE_SECRET_KEY:
        missing.append('STRIPE_SECRET_KEY')
    return missing


def _stripe_pro_line_item() -> dict:
    if STRIPE_PRICE_ID:
        return {'price': STRIPE_PRICE_ID, 'quantity': 1}
    return {
        'price_data': {
            'currency': STRIPE_PRO_CURRENCY,
            'unit_amount': STRIPE_PRO_AMOUNT_PENCE,
            'recurring': {'interval': 'month'},
            'product_data': {
                'name': 'Fintori Pro',
                'description': '50 AI reports/month, unlimited PDF exports, history, Business Health Score, and What-If tools.',
            },
        },
        'quantity': 1,
    }


@app.route('/subscription/config', methods=['GET', 'OPTIONS'])
@require_auth
def subscription_config(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)
    return jsonify({
        'configured': not _stripe_missing_config(),
        'missing': _stripe_missing_config(),
        'plan': user.plan,
        'price': f'{STRIPE_PRO_AMOUNT_PENCE / 100:.2f}',
        'currency': STRIPE_PRO_CURRENCY.upper(),
        'uses_saved_price': bool(STRIPE_PRICE_ID),
    })


@app.route('/subscription/upgrade', methods=['POST', 'OPTIONS'])
@require_auth
def upgrade_subscription(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    missing = _stripe_missing_config()
    if missing:
        return jsonify({
            'error': 'stripe_not_configured',
            'missing': missing,
            'message': 'Stripe checkout is not configured on this server yet.',
        }), 503

    success_url = f'{APP_BASE_URL}/payment.html?status=success&session_id={{CHECKOUT_SESSION_ID}}'
    cancel_url = f'{APP_BASE_URL}/payment.html?status=cancelled'

    try:
        checkout_session = stripe.checkout.Session.create(
            mode='subscription',
            line_items=[_stripe_pro_line_item()],
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=user.email,
            client_reference_id=str(user.id),
            allow_promotion_codes=True,
            metadata={'user_id': str(user.id), 'email': user.email},
            subscription_data={
                'metadata': {'user_id': str(user.id), 'email': user.email},
            },
        )
    except Exception as e:
        return jsonify({'error': 'stripe_error', 'message': str(e)}), 502

    return jsonify({'redirect_url': checkout_session.url}), 200


@app.route('/subscription/confirm', methods=['POST', 'OPTIONS'])
@require_auth
def confirm_subscription(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    missing = _stripe_missing_config()
    if missing:
        return jsonify({'error': 'stripe_not_configured', 'missing': missing}), 503

    data = request.get_json(silent=True) or {}
    session_id = (data.get('session_id') or '').strip()
    if not session_id:
        return jsonify({'error': 'Missing Checkout session id.'}), 400

    try:
        checkout_session = stripe.checkout.Session.retrieve(
            session_id,
            expand=['subscription'],
        )
    except Exception as e:
        return jsonify({'error': 'stripe_error', 'message': str(e)}), 502

    client_reference_id = _stripe_value(checkout_session, 'client_reference_id')

    if str(client_reference_id) != str(user.id):
        return jsonify({'error': 'Session does not belong to this account.'}), 403

    subscription = _stripe_value(checkout_session, 'subscription')
    subscription_id = _get_subscription_id(subscription)
    subscription_status = _get_subscription_status(subscription)

    payment_status = _stripe_value(checkout_session, 'payment_status')

    if payment_status == 'paid' or subscription_status in ('active', 'trialing'):
        _set_user_paid_from_stripe(
            user=user,
            stripe_customer_id=_stripe_value(checkout_session, 'customer'),
            stripe_subscription_id=subscription_id,
            stripe_subscription_status=subscription_status or 'active',
            stripe_checkout_session_id=_stripe_value(checkout_session, 'id'),
        )

        token = _issue_session_token(user.id)
        return jsonify({
            'ok': True,
            'user': user.to_public_dict(),
            'session_token': token
        })

    return jsonify({
        'ok': False,
        'status': payment_status or subscription_status or 'pending',
    }), 202

@app.route('/subscription/portal', methods=['POST', 'OPTIONS'])
@require_auth
def subscription_portal(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    missing = _stripe_missing_config()
    if missing:
        return jsonify({'error': 'stripe_not_configured', 'missing': missing}), 503

    if user.plan != 'paid':
        return jsonify({'error': 'Only Pro users can open the billing portal.'}), 403

    if not user.stripe_customer_id:
        return jsonify({
            'error': 'missing_stripe_customer',
            'message': 'This account does not have a Stripe customer linked yet. If you activated Pro with the dev bypass, billing portal is unavailable.'
        }), 400

    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=f'{APP_BASE_URL}/payment.html',
        )
    except Exception as e:
        return jsonify({'error': 'stripe_error', 'message': str(e)}), 502

    return jsonify({'url': portal_session.url})


@app.route('/subscription/dev-bypass', methods=['POST', 'OPTIONS'])
@require_auth
def dev_bypass_subscription(user):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    remote = request.remote_addr or ''
    is_local_request = remote in ('127.0.0.1', '::1', 'localhost')
    if not DEV_PRO_BYPASS or not is_local_request:
        return jsonify({'error': 'Dev Pro bypass is only available locally.'}), 403

    user.plan = 'paid'
    user.ai_used_month = 0
    user.ai_reset_month = datetime.now(timezone.utc).strftime('%Y-%m')
    user.stripe_subscription_status = 'dev_bypass'
    db.session.commit()

    token = _issue_session_token(user.id)
    return jsonify({'ok': True, 'user': user.to_public_dict(), 'session_token': token})


@app.route('/stripe/webhook', methods=['POST'])
def stripe_webhook():
    if stripe is None or not STRIPE_WEBHOOK_SECRET:
        return jsonify({'error': 'Stripe webhook not configured'}), 503

    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature', '')

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        return jsonify({'error': 'Invalid Stripe webhook payload'}), 400
    except stripe.error.SignatureVerificationError:
        return jsonify({'error': 'Invalid Stripe webhook signature'}), 400
    except Exception:
        return jsonify({'error': 'Invalid Stripe webhook'}), 400

    obj = event['data']['object']
    event_type = event['type']

    if event_type == 'checkout.session.completed':
        metadata = _stripe_value(obj, 'metadata', {}) or {}
        user_id = _stripe_value(obj, 'client_reference_id') or metadata.get('user_id')

        if user_id:
            user = User.query.get(int(user_id))
            if user:
                _set_user_paid_from_stripe(
                    user=user,
                    stripe_customer_id=_stripe_value(obj, 'customer'),
                    stripe_subscription_id=_stripe_value(obj, 'subscription'),
                    stripe_subscription_status='active',
                    stripe_checkout_session_id=_stripe_value(obj, 'id'),
                )

    elif event_type == 'customer.subscription.updated':
        metadata = _stripe_value(obj, 'metadata', {}) or {}
        subscription_id = _stripe_value(obj, 'id')
        status = _stripe_value(obj, 'status')
        user_id = metadata.get('user_id')

        user = None

        if subscription_id:
            user = User.query.filter_by(stripe_subscription_id=subscription_id).first()

        if not user and user_id:
            user = User.query.get(int(user_id))

        if user:
            user.stripe_subscription_id = subscription_id or user.stripe_subscription_id
            user.stripe_subscription_status = status

            if status in ('active', 'trialing'):
                user.plan = 'paid'
            elif status in ('canceled', 'incomplete_expired', 'unpaid', 'paused'):
                user.plan = 'free'

            db.session.commit()

    elif event_type in ('customer.subscription.deleted', 'customer.subscription.paused'):
        metadata = _stripe_value(obj, 'metadata', {}) or {}
        subscription_id = _stripe_value(obj, 'id')
        status = _stripe_value(obj, 'status') or 'cancelled'
        user_id = metadata.get('user_id')

        user = None

        if subscription_id:
            user = User.query.filter_by(stripe_subscription_id=subscription_id).first()

        if not user and user_id:
            user = User.query.get(int(user_id))

        if user:
            _set_user_free_from_stripe(user, status)

    elif event_type == 'invoice.payment_failed':
        subscription_id = _stripe_value(obj, 'subscription')

        if subscription_id:
            user = User.query.filter_by(stripe_subscription_id=subscription_id).first()
            if user:
                user.stripe_subscription_status = 'payment_failed'
                db.session.commit()

    return jsonify({'received': True})

# ── DEV SERVER ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
