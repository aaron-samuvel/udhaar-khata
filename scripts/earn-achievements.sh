#!/usr/bin/env bash
# =============================================================================
# earn-achievements.sh — one-shot GitHub achievement earner
# -----------------------------------------------------------------------------
# Earns on the aaron-samuvel profile (public repo udhaar-khata):
#
#   1. YOLO                — merge your own PR without any review
#   2. Pull Shark (tiers)  — merged PRs (2 PRs here, stacked on existing count)
#   3. Pair Extraordinaire — merged PR containing a Co-authored-by trailer
#                            (note: GitHub may require the co-author to be a
#                            *different* user for this to register)
#   4. Galaxy Brain        — answer a discussion and mark it as the answer
#
# Usage:
#   GH_TOKEN=<your PAT> bash scripts/earn-achievements.sh
#
# Token requirements:
#   - Classic PAT with the `repo` scope, or
#   - Fine-grained PAT on udhaar-khata with:
#       Contents: read/write, Pull requests: read/write,
#       Administration: read/write (to enable Discussions)
#
# Safe to re-run: skips PRs that already exist/merged, reuses discussion.
# NEVER prints the token. Achievements appear on the profile within minutes.
# =============================================================================
set -euo pipefail

: "${GH_TOKEN:?Set GH_TOKEN to a GitHub PAT (classic 'repo' scope, or fine-grained Contents+Pull requests+Administration)}"

OWNER="aaron-samuvel"
REPO="udhaar-khata"
API="https://api.github.com"
GRAPHQL="https://api.github.com/graphql"
H_AUTH="Authorization: Bearer ${GH_TOKEN}"
H_ACC="Accept: application/vnd.github+json"

say()  { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  [ok]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  [!!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m  [fail]\033[0m %s\n' "$*" >&2; exit 1; }

# jsonget '{"a":{"b":1}}' a b   -> prints 1 ; exits 3 when key path missing
jsonget() { python3 -c '
import json, sys
d = json.load(sys.stdin)
for k in sys.argv[1:]:
    if not isinstance(d, dict) or k not in d:
        sys.exit(3)
    d = d[k]
print("" if d is None else d)
' "$@"; }

curl_api() { curl -sS -H "$H_AUTH" -H "$H_ACC" "$@"; }

# -----------------------------------------------------------------------------
say "Step 0: verify token"
USER_LOGIN=$(curl_api "$API/user" | jsonget login) || die "token invalid or rate-limited"
[ -n "$USER_LOGIN" ] || die "token invalid or rate-limited"
ok "authenticated as ${USER_LOGIN}"
[ "$USER_LOGIN" = "$OWNER" ] || warn "token user != ${OWNER}; achievements go to ${USER_LOGIN}'s profile"

# -----------------------------------------------------------------------------
say "Step 1: push the two prepared branches (docs/badges, docs/contributing)"
git -c "credential.helper=!f() { echo username=x-access-token; echo password=${GH_TOKEN}; }; f" \
    push -u origin docs/badges docs/contributing \
  && ok "branches pushed" || die "git push failed"

# -----------------------------------------------------------------------------
say "Step 2: PR #1 (badges) -> merge WITHOUT review  [YOLO + Pull Shark + Pair Extraordinaire]"

open_pr() { # $1=head branch, $2=title, $3=body -> echoes PR number (empty on failure)
  local payload
  payload=$(python3 - "$1" "$2" "$3" <<'PY'
import json, sys
print(json.dumps({"title": sys.argv[2], "head": sys.argv[1],
                  "base": "main", "body": sys.argv[3]}))
PY
)
  curl_api -X POST "$API/repos/$OWNER/$REPO/pulls" -H "Content-Type: application/json" \
    -d "$payload" | jsonget number 2>/dev/null || true
}

merge_pr() { # $1=number
  RES=$(curl_api -X PUT "$API/repos/$OWNER/$REPO/pulls/$1/merge" \
        -H "Content-Type: application/json" -d '{"merge_method":"merge"}')
  MERGED=$(echo "$RES" | jsonget merged 2>/dev/null || true)
  if [ "$MERGED" = "True" ]; then
    ok "PR #$1 merged without review  -> YOLO eligible + Pull Shark progress"
  else
    ERR=$(echo "$RES" | jsonget message 2>/dev/null || true)
    if echo "$ERR" | grep -qi "not mergeable\|already merged\|was already"; then
      ok "PR #$1 already merged — skipping"
    else
      die "merge PR #$1 failed: ${ERR:-unknown error}"
    fi
  fi
}

PR1=$(open_pr "docs/badges" "docs: add README badges and live-demo callout" \
  "Adds a shields.io badge row (Live Demo, Next.js, TypeScript, Tailwind, PWA) under the title and a 'Try it now' callout pointing at the Pages demo. No code changes.")
if [ -n "$PR1" ]; then
  ok "PR #$PR1 opened: https://github.com/$OWNER/$REPO/pull/$PR1"
  merge_pr "$PR1"
else
  warn "PR #1 not created (likely already exists) — skipping"
fi

# -----------------------------------------------------------------------------
say "Step 3: PR #2 (CONTRIBUTING.md) -> merge  [Pull Shark tier progress]"
PR2=$(open_pr "docs/contributing" "docs: add CONTRIBUTING guide" \
  "Adds CONTRIBUTING.md: project layout, dev setup, parser-change guardrails, money-as-paise and reversal-not-delete conventions, commit/PR conventions, bug reporting guidance.")
if [ -n "$PR2" ]; then
  ok "PR #$PR2 opened: https://github.com/$OWNER/$REPO/pull/$PR2"
  merge_pr "$PR2"
else
  warn "PR #2 not created (likely already exists) — skipping"
fi

# -----------------------------------------------------------------------------
say "Step 4: enable Discussions  [Galaxy Brain prerequisite]"
DISC_STATE=$(curl_api "$API/repos/$OWNER/$REPO" | jsonget has_discussions 2>/dev/null || echo "err")
if [ "$DISC_STATE" = "True" ]; then
  ok "discussions already enabled"
else
  curl_api -X PATCH "$API/repos/$OWNER/$REPO" -H "Content-Type: application/json" \
      -d '{"has_discussions":true}' | jsonget has_discussions >/dev/null 2>&1 \
    && ok "discussions enabled" \
    || die "could not enable discussions (token needs Administration:write, or rate limit hit)"
fi

# -----------------------------------------------------------------------------
say "Step 5: GraphQL — repository id + answerable category id"
CAT_JSON=$(curl_api -X POST "$GRAPHQL" -H "Content-Type: application/json" --data-binary @- <<EOF
{"query":"query(\$o:String!,\$n:String!){repository(owner:\$o,name:\$n){id discussionCategories(first:10){nodes{id name isAnswerable}}}}","variables":{"o":"$OWNER","n":"$REPO"}}
EOF
)
REPO_ID=$(echo "$CAT_JSON" | jsonget data repository id 2>/dev/null || true)
[ -n "$REPO_ID" ] || die "GraphQL repository query failed: $(echo "$CAT_JSON" | jsonget message 2>/dev/null || echo 'see response')"
CAT_ID=$(echo "$CAT_JSON" | python3 -c '
import json, sys
d = json.load(sys.stdin)
nodes = d["data"]["repository"]["discussionCategories"]["nodes"]
ans = [n for n in nodes if n.get("isAnswerable")]
if not ans:
    sys.exit(1)
print(ans[0]["id"])') || die "no answerable (Q&A) category found"
ok "repositoryId + Q&A category resolved"

# -----------------------------------------------------------------------------
say "Step 6: create discussion -> answer it -> mark as answer  [Galaxy Brain]"
# payload built in python: no shell-escaping pitfalls for quotes/backslashes
DISC_PAYLOAD=$(python3 - "$REPO_ID" "$CAT_ID" <<'PY'
import json, sys
repo_id, cat_id = sys.argv[1], sys.argv[2]
q = ('mutation($r:ID!,$c:ID!){createDiscussion(input:{repositoryId:$r,categoryId:$c,'
     'title:"How do I deploy my own instance to GitHub Pages?",'
     'body:"I want to host my own copy of this app instead of using the live demo. '
     'The README mentions a static export path — what are the exact steps and gotchas '
     '(branch, Jekyll, persistence)?"}){discussion{id url number}}}')
print(json.dumps({"query": q, "variables": {"r": repo_id, "c": cat_id}}))
PY
)
DISC_JSON=$(curl_api -X POST "$GRAPHQL" -H "Content-Type: application/json" -d "$DISC_PAYLOAD")
DISC_ID=$(echo "$DISC_JSON" | jsonget data createDiscussion discussion id 2>/dev/null || true)
DISC_URL=$(echo "$DISC_JSON" | jsonget data createDiscussion discussion url 2>/dev/null || true)
if [ -n "$DISC_ID" ]; then
  ok "discussion created: $DISC_URL"
else
  warn "createDiscussion failed ($(echo "$DISC_JSON" | jsonget message 2>/dev/null || echo 'unknown')) — searching for an existing one"
  EXIST=$(curl_api -X POST "$GRAPHQL" -H "Content-Type: application/json" --data-binary @- <<EOF
{"query":"query(\$o:String!,\$n:String!){repository(owner:\$o,name:\$n){discussions(first:10){nodes{id url title}}}}","variables":{"o":"$OWNER","n":"$REPO"}}
EOF
)
  DISC_INFO=$(echo "$EXIST" | python3 -c '
import json, sys
d = json.load(sys.stdin)
for n in d["data"]["repository"]["discussions"]["nodes"]:
    if "deploy my own instance" in n["title"].lower():
        print(n["id"] + " " + n["url"]); break
else:
    sys.exit(1)') || die "no usable discussion available"
  DISC_ID=$(echo "$DISC_INFO" | cut -d" " -f1)
  DISC_URL=$(echo "$DISC_INFO" | cut -d" " -f2)
  ok "reusing existing discussion: $DISC_URL"
fi

ANS_PAYLOAD=$(python3 - "$DISC_ID" <<'PY'
import json, sys
body = '''Yes — the repo ships a ready-made path for this:

1. **Build a static export** (browser-only data layer, localStorage persistence):
   ```bash
   STATIC_EXPORT=1 bun install && STATIC_EXPORT=1 bun run build
   ```
   This sets `output: 'export'` + `basePath: '/udhaar-khata'` and swaps Prisma for the
   localStorage adapter (`src/lib/local-server.ts`).

2. **Publish to a `gh-pages` branch** with the helper script (pushes the export as the
   Pages source, includes `.nojekyll` so the `_next/` assets are served):
   ```bash
   GH_TOKEN=<PAT with Contents:write> bash scripts/deploy-pages.sh
   ```

3. **Repo Settings -> Pages** -> Source: `gh-pages` branch, root. First deploy takes
   about a minute.

Gotchas:
- Data lives per-browser in localStorage — use Settings -> Backup to export JSON regularly.
- Anything under `.github/workflows/` needs a PAT with the `workflow` scope to push; the
  script avoids Actions entirely (deploy-from-branch).
- If you rename the repo, update `basePath` in `next.config.ts` or assets will 404.
'''
q = 'mutation($d:ID!,$b:String!){addDiscussionComment(input:{discussionId:$d,body:$b}){comment{id}}}'
print(json.dumps({"query": q, "variables": {"d": sys.argv[1], "b": body}}))
PY
)
ANS_JSON=$(curl_api -X POST "$GRAPHQL" -H "Content-Type: application/json" -d "$ANS_PAYLOAD")
ANS_ID=$(echo "$ANS_JSON" | jsonget data addDiscussionComment comment id 2>/dev/null || true)
[ -n "$ANS_ID" ] || die "posting answer failed: $(echo "$ANS_JSON" | jsonget message 2>/dev/null || echo 'see response')"
ok "answer posted"

MARK_PAYLOAD=$(python3 - "$ANS_ID" <<'PY'
import json, sys
print(json.dumps({
    "query": "mutation($i:ID!){markDiscussionCommentAsAnswer(input:{id:$i}){discussion{url}}}",
    "variables": {"i": sys.argv[1]}}))
PY
)
MARK_JSON=$(curl_api -X POST "$GRAPHQL" -H "Content-Type: application/json" -d "$MARK_PAYLOAD")
MARKED=$(echo "$MARK_JSON" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if d.get("errors"):
    print("ERR: " + d["errors"][0].get("message", "unknown"))
else:
    print("OK")') || true
if [ "$MARKED" = "OK" ]; then
  ok "answer MARKED as accepted  -> Galaxy Brain earned"
else
  warn "mark-as-answer failed: ${MARKED:-unknown} (achievement needs the Q&A category answer to be marked)"
fi

# -----------------------------------------------------------------------------
say "Done — summary"
cat <<EOT

  YOLO                 -> PR #1 merged without review
  Pull Shark           -> 2 more merged PRs (tier progress)
  Pair Extraordinaire  -> co-authored trailer included (registers only if
                          GitHub counts a same-user co-author; may not count)
  Galaxy Brain         -> answer marked in: ${DISC_URL:-<discussion url>}

Check https://github.com/${OWNER} in a few minutes — achievements render there.
If you pasted this token anywhere in plain text: REVOKE it now.
EOT
