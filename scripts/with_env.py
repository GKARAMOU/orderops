"""Run a command with project-local environment variables, without exposing secrets."""
import os,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
env={**os.environ}
for line in (root/'.env').read_text().splitlines():
 if line and not line.startswith('#'):
  key,value=line.split('=',1);env[key]=value
os.execvpe(sys.argv[1],sys.argv[1:],env)
