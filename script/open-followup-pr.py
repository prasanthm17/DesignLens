"""Open a PR for the URL update commit. Token comes from the git credential store."""
import json
import subprocess
import urllib.error
import urllib.request

REPO = "prasanthm17/Prasanth-Portfolio"
HEAD = "feat/designlens-flagship"
TITLE = "chore: point the live product link at the deployed instance"

BODY = """Follow-up to #1.

DesignLens is deployed at **https://designlens-fyaf.onrender.com**, so the live CTA now resolves there instead of the placeholder domain.

- `NEXT_PUBLIC_DESIGNLENS_URL` default in `.env.example` and the README updated to the deployed URL
- Home page and case study both render the new URL with `target="_blank"` and `rel="noopener noreferrer"`

Verified after rebuild:

| Check | Result |
| --- | --- |
| `next build` | clean |
| Links on home | 3 |
| Links on case study | 4 |
| Stale URLs (`designlens.app`, `localhost:8080`) | none |
| Deployed target | `200`, serving `DesignLens — See beyond the interface` |

**Remember:** `NEXT_PUBLIC_*` is inlined at build time. The Vercel project also needs this value set in its environment, or a rebuild here won't change the deployed site.
"""


def token() -> str:
    out = subprocess.run(
        ["git", "-c", "credential.helper=", "-c", "credential.helper=manager", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise SystemExit("no credential")


TOKEN = token()


def api(url: str, data=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data else None,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "designlens-pr",
        },
        method="POST" if data else "GET",
    )
    try:
        with urllib.request.urlopen(req) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return json.loads(error.read().decode())


existing = api(f"https://api.github.com/repos/{REPO}/pulls?head=prasanthm17:{HEAD}&state=open")
if isinstance(existing, list) and existing:
    print("PR already open:", existing[0]["number"], existing[0]["html_url"])
    raise SystemExit(0)

result = api(
    f"https://api.github.com/repos/{REPO}/pulls",
    {"title": TITLE, "head": HEAD, "base": "main", "body": BODY},
)
if "html_url" in result:
    print("PR", result["number"], result["state"])
    print(result["html_url"])
else:
    print("ERROR:", result.get("message"))
    for err in result.get("errors", []) or []:
        print(" -", err.get("message") or err)
