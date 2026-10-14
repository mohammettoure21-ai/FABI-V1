import re
import pytest
from sqlalchemy import select
from werkzeug.security import generate_password_hash
from fabi import create_app, db, User, Audit

@pytest.fixture
def app(tmp_path):
    app = create_app({'TESTING': True, 'SQLALCHEMY_DATABASE_URI': 'sqlite:///' + str(tmp_path / 'test.sqlite'), 'SECRET_KEY': 'test-only'})
    with app.app_context():
        db.create_all()
        for role in ('admin', 'manager', 'employee'):
            db.session.add(User(username=role, name=role, role=role, password_hash=generate_password_hash('UnMotDePasseLong123!')))
        db.session.commit()
    return app

@pytest.fixture
def client(app):
    return app.test_client()

def token(client, path='/connexion'):
    page = client.get(path)
    return re.search(r'name="csrf_token" value="([^"]+)"', page.text).group(1)

def login(client, username='admin'):
    return client.post('/connexion', data={'username': username, 'password': 'UnMotDePasseLong123!', 'csrf_token': token(client)})

def test_login_dashboard_logout(client):
    assert client.get('/').status_code == 302
    assert login(client).status_code == 302
    page = client.get('/')
    assert page.status_code == 200
    assert 'À venir' in page.text
    assert 'frame-ancestors' in page.headers['Content-Security-Policy']
    assert client.get('/deconnexion').status_code == 405
    assert client.post('/deconnexion', data={'csrf_token': token(client, '/equipe')}).status_code == 302
    assert client.get('/').status_code == 302

@pytest.mark.parametrize('role', ['employee', 'manager'])
def test_server_authorization(client, role):
    login(client, role)
    assert client.get('/equipe').status_code == 403
    assert client.get('/journal').status_code == 403
    assert client.get('/').status_code == 200

def test_csrf(client):
    assert client.post('/connexion', data={'username': 'admin'}).status_code == 400
    login(client)
    assert client.post('/equipe', data={}).status_code == 400

def test_rate_limit(client):
    csrf = token(client)
    for _ in range(5):
        assert client.post('/connexion', data={'username': 'admin', 'password': 'incorrect', 'csrf_token': csrf}).status_code == 401
    assert client.post('/connexion', data={'username': 'admin', 'password': 'UnMotDePasseLong123!', 'csrf_token': csrf}).status_code == 429

def test_create_disable_audit(app, client):
    login(client)
    csrf = token(client, '/equipe')
    payload = {'csrf_token': csrf, 'name': '<script>alert(1)</script>', 'username': 'nouveau', 'password': 'MotIndividuelLong123!', 'role': 'employee'}
    client.post('/equipe', data=payload)
    with app.app_context():
        user = db.session.scalar(select(User).where(User.username == 'nouveau'))
        assert user and user.password_hash != payload['password']
        uid = user.id
        assert db.session.scalar(select(Audit).where(Audit.action == 'Création du compte nouveau'))
    assert '<script>alert(1)</script>' not in client.get('/equipe').text
    assert client.post(f'/equipe/{uid}/statut', data={'csrf_token': csrf}).status_code == 302
    client.post('/deconnexion', data={'csrf_token': csrf})
    assert client.post('/connexion', data={'csrf_token': token(client), 'username': 'nouveau', 'password': payload['password']}).status_code == 401

def test_invalid_and_duplicate_accounts(app, client):
    login(client)
    csrf = token(client, '/equipe')
    for username, role, password in [('admin','admin','MotIndividuelLong123!'),('bad','owner','MotIndividuelLong123!'),('weak','employee','court')]:
        client.post('/equipe', data={'csrf_token':csrf,'name':'Test','username':username,'role':role,'password':password})
    with app.app_context():
        assert len(db.session.scalars(select(User)).all()) == 3

def test_init_repeatable(app):
    runner = app.test_cli_runner()
    assert runner.invoke(args=['init-db']).exit_code == 0
    assert runner.invoke(args=['init-db']).exit_code == 0
    with app.app_context():
        assert len(db.session.scalars(select(User)).all()) == 3
