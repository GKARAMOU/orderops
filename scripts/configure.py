"""Create local credentials once; never overwrite an existing environment."""
from pathlib import Path
import secrets
root=Path(__file__).resolve().parents[1]
p=root/'.env'
if p.exists():
 print('Existing .env preserved.')
else:
 p.write_text('DATABASE_URL=jdbc:postgresql://127.0.0.1:55432/orderops\nDATABASE_USER=orderops\nDATABASE_PASSWORD='+secrets.token_hex(24)+'\nJWT_SECRET='+secrets.token_hex(32)+'\nADMIN_EMAIL=admin@orderops.local\nADMIN_PASSWORD='+secrets.token_urlsafe(20)+'\nFORECAST_URL=http://127.0.0.1:8000\n')
 p.chmod(0o600)
 print('Created .env with unique local credentials. Read ADMIN_EMAIL and ADMIN_PASSWORD to sign in.')
