import urllib.request
import json
import base64
import ssl
import sys

sys.stdout.reconfigure(encoding='utf-8')

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# ── REMPLIR ICI ──────────────────────────────────────────────────────────────
GITHUB_TOKEN = ""   # << votre Personal Access Token GitHub (scope: repo)
# ─────────────────────────────────────────────────────────────────────────────

REPO   = "numi-plan/Numi-plan"
BRANCH = "main"

FILES_TO_DEPLOY = [
    {
        "local_path": r"c:\Users\kaddour.lahouel\Desktop\PROJET ERP ANTI\fiche_supabase.html",
        "github_path": "fiche_supabase.html",
        "commit_msg": "fix: resolution definitive des conflits de cache et odomètre"
    },
    {
        "local_path": r"c:\Users\kaddour.lahouel\Desktop\PROJET ERP ANTI\scripts\gps_sync.js",
        "github_path": "scripts/gps_sync.js",
        "commit_msg": "feat: ajout du script autonome de synchro GPS"
    },
    {
        "local_path": r"c:\Users\kaddour.lahouel\Desktop\PROJET ERP ANTI\.github\workflows\gps_sync.yml",
        "github_path": ".github/workflows/gps_sync.yml",
        "commit_msg": "feat: planification de la synchro GPS toutes les 15 minutes"
    }
]

if not GITHUB_TOKEN:
    print("ERREUR: renseignez GITHUB_TOKEN ligne 12.")
    sys.exit(1)

def get_sha(repo, path, token):
    url = f"https://api.github.com/repos/{repo}/contents/{path}?ref={BRANCH}"
    hdrs = {"User-Agent":"M","Authorization":f"token {token}","Accept":"application/vnd.github.v3+json"}
    try:
        req = urllib.request.Request(url, headers=hdrs)
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return json.loads(r.read())["sha"]
    except:
        return ""

for fi in FILES_TO_DEPLOY:
    print(f"\n=== {fi['github_path']} ===")
    with open(fi["local_path"], "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    sha = get_sha(REPO, fi["github_path"], GITHUB_TOKEN)
    payload = {"message": fi["commit_msg"], "content": b64, "branch": BRANCH}
    if sha: payload["sha"] = sha
    hdrs = {"User-Agent":"M","Authorization":f"token {GITHUB_TOKEN}",
            "Accept":"application/vnd.github.v3+json","Content-Type":"application/json"}
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/contents/{fi['github_path']}",
        data=json.dumps(payload).encode(), headers=hdrs, method="PUT")
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
            res = json.loads(r.read())
            print(f"  OK - commit: {res['commit']['html_url']}")
    except Exception as e:
        detail = e.read().decode() if hasattr(e,"read") else ""
        print(f"  ERREUR: {e} {detail[:300]}")

print("\nFini.")
