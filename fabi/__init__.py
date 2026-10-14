import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from zoneinfo import ZoneInfo

import click
from flask import Flask, abort, flash, redirect, render_template, request, session, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFProtect
from sqlalchemy import select, func
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()
csrf = CSRFProtect()


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='employee')
    active = db.Column(db.Boolean, nullable=False, default=True)


class Audit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    action = db.Column(db.String(180), nullable=False)


class LoginAttempt(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(180), index=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True, mode=0o700)
    key_path = Path(app.instance_path) / 'secret.key'
    if not key_path.exists():
        try:
            with key_path.open('x') as file:
                file.write(secrets.token_hex(32))
            key_path.chmod(0o600)
        except FileExistsError:
            pass
    app.config.update(SECRET_KEY=os.getenv('FABI_SECRET_KEY') or key_path.read_text(),
                      SQLALCHEMY_DATABASE_URI='sqlite:///' + str(Path(app.instance_path) / 'fabi.sqlite'),
                      SQLALCHEMY_TRACK_MODIFICATIONS=False, SESSION_COOKIE_HTTPONLY=True,
                      SESSION_COOKIE_SAMESITE='Lax', PERMANENT_SESSION_LIFETIME=timedelta(minutes=30),
                      MAX_CONTENT_LENGTH=1024 * 1024)
    if test_config:
        app.config.update(test_config)
    db.init_app(app)
    csrf.init_app(app)

    def audit(action, user_id=None):
        db.session.add(Audit(action=action, user_id=user_id))
        db.session.commit()

    def protected(admin=False):
        def decorator(view):
            @wraps(view)
            def wrapped(*args, **kwargs):
                user = db.session.get(User, session.get('user_id')) if session.get('user_id') else None
                if not user or not user.active:
                    session.clear()
                    return redirect(url_for('login'))
                if admin and user.role != 'admin':
                    abort(403)
                return view(*args, **kwargs)
            return wrapped
        return decorator

    @app.context_processor
    def context():
        user = db.session.get(User, session.get('user_id')) if session.get('user_id') else None
        return dict(current_user=user, roles={'admin': 'Administrateur', 'manager': 'Responsable', 'employee': 'Employé'})

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['Content-Security-Policy'] = "default-src 'self'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'"
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.route('/connexion', methods=['GET', 'POST'])
    def login():
        if request.method == 'POST':
            username = request.form.get('username', '').strip().lower()[:80]
            ip_key = 'ip:' + (request.remote_addr or 'local')
            user_key = 'user:' + username
            since = datetime.now(timezone.utc) - timedelta(minutes=15)
            counts = [db.session.scalar(select(func.count()).select_from(LoginAttempt).where(LoginAttempt.key == key, LoginAttempt.created_at >= since)) for key in (ip_key, user_key)]
            if max(counts) >= 5:
                return render_template('login.html', error='Trop de tentatives. Réessayez dans 15 minutes.'), 429
            user = db.session.scalar(select(User).where(User.username == username))
            password = request.form.get('password', '')
            valid = check_password_hash(user.password_hash if user else app.config['DUMMY_HASH'], password)
            if user and user.active and valid:
                session.clear()
                session['user_id'] = user.id
                session.permanent = True
                audit('Connexion réussie', user.id)
                return redirect(url_for('dashboard'))
            for key in (ip_key, user_key):
                db.session.add(LoginAttempt(key=key))
            audit('Connexion refusée')
            return render_template('login.html', error='Identifiant ou mot de passe incorrect.'), 401
        return render_template('login.html')

    @app.post('/deconnexion')
    @protected()
    def logout():
        audit('Déconnexion', session['user_id'])
        session.clear()
        return redirect(url_for('login'))

    @app.get('/')
    @protected()
    def dashboard():
        return render_template('dashboard.html', today=datetime.now(ZoneInfo('Africa/Dakar')).strftime('%d/%m/%Y'))

    @app.route('/equipe', methods=['GET', 'POST'])
    @protected(admin=True)
    def team():
        if request.method == 'POST':
            name = request.form.get('name', '').strip()
            username = request.form.get('username', '').strip().lower()
            password = request.form.get('password', '')
            role = request.form.get('role')
            if not (1 <= len(name) <= 100 and 3 <= len(username) <= 80 and username.isascii() and all(c.isalnum() or c in '._-' for c in username) and 12 <= len(password) <= 256 and role in ('admin', 'manager', 'employee')):
                flash('Vérifiez les champs : identifiant de 3 à 80 caractères et mot de passe de 12 à 256 caractères.', 'error')
            elif db.session.scalar(select(User).where(User.username == username)):
                flash('Cet identifiant existe déjà.', 'error')
            else:
                db.session.add(User(name=name, username=username, role=role, password_hash=generate_password_hash(password)))
                audit('Création du compte ' + username, session['user_id'])
                flash('Compte individuel créé.', 'success')
            return redirect(url_for('team'))
        return render_template('team.html', users=db.session.scalars(select(User).order_by(User.name)).all())

    @app.post('/equipe/<int:user_id>/statut')
    @protected(admin=True)
    def toggle_user(user_id):
        user = db.get_or_404(User, user_id)
        if user.id == session['user_id']:
            abort(400, description='Vous ne pouvez pas désactiver votre propre compte.')
        user.active = not user.active
        audit('Modification du statut du compte ' + user.username, session['user_id'])
        return redirect(url_for('team'))

    @app.get('/journal')
    @protected(admin=True)
    def journal():
        return render_template('journal.html', entries=db.session.scalars(select(Audit).order_by(Audit.id.desc()).limit(200)).all())

    @app.errorhandler(400)
    @app.errorhandler(403)
    @app.errorhandler(404)
    def error(err):
        return render_template('error.html', code=err.code), err.code

    @app.cli.command('init-db')
    def init_db():
        db.create_all()
        click.echo('Base de données initialisée (données existantes conservées).')

    @app.cli.command('create-admin')
    @click.option('--username', prompt='Identifiant')
    @click.option('--name', prompt='Nom complet')
    @click.password_option(confirmation_prompt=True)
    def create_admin(username, name, password):
        username = username.strip().lower()
        if not (3 <= len(username) <= 80 and username.isascii() and all(c.isalnum() or c in '._-' for c in username) and 1 <= len(name.strip()) <= 100 and 12 <= len(password) <= 256):
            raise click.ClickException('Identifiant invalide ou mot de passe inférieur à 12 caractères.')
        if db.session.scalar(select(User).where(User.username == username)):
            raise click.ClickException('Cet identifiant existe déjà.')
        db.session.add(User(username=username, name=name.strip(), role='admin', password_hash=generate_password_hash(password)))
        audit('Création administrateur par console')
        click.echo('Administrateur créé. Aucun mot de passe partagé.')

    app.config['DUMMY_HASH'] = generate_password_hash(secrets.token_hex(16))
    return app
