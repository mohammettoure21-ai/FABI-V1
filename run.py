from dotenv import load_dotenv
from waitress import serve
from fabi import create_app

load_dotenv()
app = create_app()
if __name__ == '__main__':
    print('FABI CRM : http://127.0.0.1:8080 — accès local uniquement')
    serve(app, host='127.0.0.1', port=8080, threads=4)
