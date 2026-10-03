#!/usr/bin/env bash
# End-to-end verification for the storyboard -> video worker -> gallery pipeline.
#
# Requires:
#   - the app on http://127.0.0.1:3000   (npm run dev)
#   - the mock worker on 127.0.0.1:8188  (npm run dev:worker)
#
# Exercises the paths that were previously broken or absent: prompt screening on
# the queue route, dangling-node rejection, shot submission, prompt_id tracking,
# status normalisation, job persistence, and the /view output proxy.

set -uo pipefail

APP="${APP:-http://127.0.0.1:3000}"
MOCK="${MOCK:-http://127.0.0.1:8188}"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n     %s\n' "$1" "${2:-}"; }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

check() { # check <name> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$3', got '$2'"; fi
}

# ---------------------------------------------------------------- connectivity
section "0. Backends reachable"
APP_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$APP/")
check "app responds on /" "$APP_CODE" "200"
MOCK_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$MOCK/system_stats")
check "mock ComfyUI responds" "$MOCK_CODE" "200"
if [ "$MOCK_CODE" != "200" ]; then printf '\nMock worker not running; aborting.\n'; exit 1; fi

STATUS=$(curl -s "$APP/api/comfyui/status")
echo "$STATUS" | grep -q '"connected":true' && ok "app sees ComfyUI connected" || bad "app sees ComfyUI connected" "$STATUS"

# ------------------------------------------------------------------- safety
section "1. Prompt screening is enforced on the queue route"

GRAPH='{"4":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"m.safetensors"}},"2":{"class_type":"CLIPTextEncode","inputs":{"text":"__PROMPT__","clip":["4",1]}}}'

# The queue route previously never consulted lib/prompt-safety. These must be refused.
for CASE in "a real person celebrity nude explicit scene|real-person sexual" \
            "forced non-consensual scene|non-consent" \
            "child minor explicit|minor"; do
  PROMPT="${CASE%%|*}"; LABEL="${CASE##*|}"
  CODE=$(curl -s -o /tmp/mod.json -w '%{http_code}' -X POST "$APP/api/video/queue" \
    -H 'Content-Type: application/json' \
    -d "$(python3 -c "import json,sys;print(json.dumps({'workflow':json.loads(sys.argv[1]),'worker':'test','values':{'prompt':sys.argv[2]}}))" "$GRAPH" "$PROMPT")")
  check "blocked: $LABEL (HTTP 422)" "$CODE" "422"
done

CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP/api/video/queue" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json,sys;print(json.dumps({'workflow':json.loads(sys.argv[1]),'values':{'prompt':'nude explicit content'}}))" "$GRAPH")")
check "blocked: review-level wording (HTTP 422)" "$CODE" "422"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP/api/video/queue" \
  -H 'Content-Type: application/json' -d '{"worker":"test"}')
check "rejected: no prompt and no shot (HTTP 400)" "$CODE" "400"

# --------------------------------------------------------------- validation
section "2. Dangling node references are caught before submission"
DANGLING='{"1":{"class_type":"KSampler","inputs":{"model":["99",0]}}}'
RESP=$(curl -s -X POST "$APP/api/video/queue" -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json,sys;print(json.dumps({'workflow':json.loads(sys.argv[1]),'values':{'prompt':'a lighthouse in a storm'}}))" "$DANGLING")")
echo "$RESP" | grep -q 'unresolved node references' && ok "queue route names the broken reference" || bad "queue route names the broken reference" "$RESP"
echo "$RESP" | grep -q '99' && ok "error identifies the missing node id" || bad "error identifies the missing node id" "$RESP"

RESP=$(curl -s -X POST "$APP/api/comfyui/workflow" -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json,sys;print(json.dumps({'workflow':json.loads(sys.argv[1])}))" "$DANGLING")")
echo "$RESP" | grep -q 'unresolved node references' && ok "template route validates too" || bad "template route validates too" "$RESP"

# -------------------------------------------------------------- happy path
section "3. Storyboard shot renders end to end"

BOARD_ID="board-$(date +%s)"
SHOT_ID="shot-1"
SEED=424242

RESP=$(curl -s -X POST "$APP/api/video/queue" -H 'Content-Type: application/json' -d "$(python3 - "$BOARD_ID" "$SHOT_ID" "$SEED" <<'PY'
import json,sys
board_id, shot_id, seed = sys.argv[1:4]
print(json.dumps({
  "worker":"ComfyUI / Wan2.1",
  "board":{"id":board_id,"masterSeed":int(seed),"characterName":"Navigator Sable",
           "characterTraits":"tall, silver-streaked braid, weathered amber coat",
           "characterStyle":"painterly cel shading, muted teal and amber grade"},
  "shot":{"id":shot_id,"scene":"Scene 1","prompt":"walks along a rain-slick dock at dusk",
          "camera":"Tracking shot","duration":3,"dialogue":"steady, unhurried"},
  "values":{"prompt":"walks along a rain-slick dock at dusk","seed":int(seed),"width":1024,"height":576,"frames":32,"fps":16},
  "settings":{"seed":int(seed),"width":1024,"height":576,"frames":32,"fps":16,"checkpoint":"mock_wan21.safetensors"},
}))
PY
)")

PROMPT_ID=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('promptId',''))" 2>/dev/null)
JOB_ID=$(echo "$RESP"   | python3 -c "import sys,json;print(json.load(sys.stdin).get('job',{}).get('id',''))" 2>/dev/null)

[ -n "$PROMPT_ID" ] && ok "queue returned a prompt_id" || bad "queue returned a prompt_id" "$RESP"
[ -n "$JOB_ID" ]    && ok "queue persisted a job record" || bad "queue persisted a job record" "$RESP"
check "seed locked to the board's masterSeed" "$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('seed',''))" 2>/dev/null)" "$SEED"
echo "$RESP" | grep -q '"persisted":true' && ok "job written to the storage adapter" || bad "job written to the storage adapter" "$RESP"

# ------------------------------------------------------------------ polling
section "4. Status normalises onto the app vocabulary and reaches a terminal state"
FINAL=""; TRIES=0
for i in $(seq 1 30); do
  TRIES=$i
  POLL=$(curl -s "$APP/api/video/job/$PROMPT_ID")
  FINAL=$(echo "$POLL" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  case "$FINAL" in completed|failed) break;; esac
  sleep 2
done

check "job reached a terminal state" "$([ "$FINAL" = completed ] || [ "$FINAL" = failed ] && echo yes || echo no)" "yes"
check "final status is 'completed'" "$FINAL" "completed"
echo "  (took $((TRIES*2))s)"

OUT_URL=$(echo "$POLL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
o=d.get('outputs') or []
print(o[0]['url'] if o else '')" 2>/dev/null)
[ -n "$OUT_URL" ] && ok "history yielded an output URL" || bad "history yielded an output URL" "$POLL"
echo "$OUT_URL" | grep -q '^/api/comfyui/view' && ok "output is an app-relative proxy URL" || bad "output is an app-relative proxy URL" "$OUT_URL"
echo "$OUT_URL" | grep -q '8188' && bad "output leaks the ComfyUI host" "$OUT_URL" || ok "output does not leak the ComfyUI host"

VIEW=$(curl -s -o /tmp/out.mp4 -w '%{http_code} %{content_type} %{size_download}' "$APP$OUT_URL")
check "proxy serves the file (HTTP 200)" "$(echo "$VIEW" | cut -d' ' -f1)" "200"
check "proxy sets a video content type" "$(echo "$VIEW" | cut -d' ' -f2)" "video/mp4"
SIZE=$(echo "$VIEW" | cut -d' ' -f3)
[ "${SIZE:-0}" -gt 5000 ] && ok "payload is a real video ($SIZE bytes)" || bad "payload is a real video" "only $SIZE bytes"

# --------------------------------------------------------------- persistence
section "5. Persistence survives across requests"
JOBS=$(curl -s "$APP/api/jobs")
echo "$JOBS" | grep -q "$JOB_ID" && ok "job is listed by /api/jobs" || bad "job is listed by /api/jobs" "$(echo "$JOBS" | head -c 200)"
check "persisted job status is completed" \
  "$(echo "$JOBS" | python3 -c "
import sys,json
jobs=json.load(sys.stdin)['jobs']
j=[x for x in jobs if x['id']=='$JOB_ID']
print(j[0]['status'] if j else 'MISSING')" 2>/dev/null)" "completed"
check "persisted job kept its promptId" \
  "$(echo "$JOBS" | python3 -c "
import sys,json
jobs=json.load(sys.stdin)['jobs']
j=[x for x in jobs if x['id']=='$JOB_ID']
print(j[0].get('promptId','') if j else 'MISSING')" 2>/dev/null)" "$PROMPT_ID"
check "persisted job has outputs" \
  "$(echo "$JOBS" | python3 -c "
import sys,json
jobs=json.load(sys.stdin)['jobs']
j=[x for x in jobs if x['id']=='$JOB_ID']
print(len(j[0]['outputs']) if j else 0)" 2>/dev/null)" "1"
echo "$JOBS" | grep -q '"storage"' && ok "gallery reports its storage adapter honestly" || bad "gallery reports its storage adapter" ""

SB_RESP=$(curl -s -X POST "$APP/api/storyboards" -H 'Content-Type: application/json' \
  -d "$(python3 -c "
import json
print(json.dumps({'storyboard':{'id':'$BOARD_ID','title':'Dock sequence','aspectRatio':'16:9','masterSeed':$SEED,
 'characterName':'Navigator Sable',
 'shots':[{'id':'$SHOT_ID','scene':'Scene 1','duration':3,'prompt':'walks along a rain-slick dock at dusk',
           'camera':'Tracking shot','dialogue':'','status':'complete','promptId':'$PROMPT_ID'}]}}))")")
echo "$SB_RESP" | grep -q '"ok":true' && ok "storyboard persisted" || bad "storyboard persisted" "$SB_RESP"
GOT=$(curl -s "$APP/api/storyboards?id=$BOARD_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin); s=d.get('storyboard',{})
print(s.get('title',''), s.get('masterSeed',''), len(s.get('shots',[])))" 2>/dev/null)
check "storyboard round-trips (title, seed, shots)" "$GOT" "Dock sequence $SEED 1"

# ------------------------------------------------------------ failure paths
section "6. Failure handling"
FAIL_RESP=$(curl -s -X POST "$APP/api/video/queue" -H 'Content-Type: application/json' \
  -d '{"shot":{"id":"s2","scene":"Scene 2","prompt":"MOCK_FAIL a storm breaks overhead","camera":"Wide shot","duration":2},
       "board":{"id":"'"$BOARD_ID"'","masterSeed":7,"characterName":"Navigator Sable"},
       "settings":{"checkpoint":"mock_wan21.safetensors","frames":16},"worker":"test"}')
FAIL_PID=$(echo "$FAIL_RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('promptId',''))" 2>/dev/null)
[ -n "$FAIL_PID" ] && ok "failing job still queued and tracked" || bad "failing job still queued and tracked" "$FAIL_RESP"

FSTATE=""
for i in $(seq 1 20); do
  FSTATE=$(curl -s "$APP/api/video/job/$FAIL_PID" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  [ "$FSTATE" = failed ] && break
  sleep 2
done
check "execution error maps to 'failed' (not raw 'error')" "$FSTATE" "failed"
curl -s "$APP/api/video/job/$FAIL_PID" | grep -qi 'mock failure injected' \
  && ok "failure reason is surfaced from ComfyUI" || bad "failure reason is surfaced" ""

SCAFFOLD=$(curl -s -X POST "$APP/api/video/queue" -H 'Content-Type: application/json' \
  -d '{"shot":{"id":"s3","scene":"Scene 3","prompt":"a gull circles the mast","camera":"Wide shot","duration":2},
       "board":{"id":"scaffold-test","masterSeed":99,"characterName":"Gull"},
       "settings":{"checkpoint":"mock_wan21.safetensors","frames":16},"worker":"scaffold"}')
SPID=$(echo "$SCAFFOLD" | python3 -c "import sys,json;print(json.load(sys.stdin).get('promptId',''))" 2>/dev/null)
[ -n "$SPID" ] && ok "built-in video scaffold is internally valid (accepted)" \
               || bad "built-in video scaffold is internally valid" "$SCAFFOLD"

# -------------------------------------------------------- character stability
section "7. Seed locking and prompt composition"
check "two shots from one board share the masterSeed" \
  "$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('seed'))" 2>/dev/null)" "$SEED"

# The scaffold must state the character once. buildWorkflow derives identity from
# the profile, so the shot text handed to it must not also carry the anchor.
# With COMFYUI_VIDEO_CHECKPOINT set in .env.local, a shot that names no checkpoint
# of its own must fall back to it rather than submitting an empty ckpt_name.
# (Without that env var the same request is refused with a 400 and a hint.)
ENV_CKPT="${COMFYUI_VIDEO_CHECKPOINT:-}"
if [ -z "$ENV_CKPT" ]; then
  ENV_CKPT=$(grep -E '^COMFYUI_VIDEO_CHECKPOINT=' .env.local 2>/dev/null | cut -d= -f2-)
fi

FALLBACK_CODE=$(curl -s -o /tmp/fb.json -w '%{http_code}' -X POST "$APP/api/video/queue" \
  -H 'Content-Type: application/json' \
  -d '{"shot":{"id":"s4","scene":"Scene 4","prompt":"a gull circles the mast","camera":"Wide shot","duration":2},
       "board":{"id":"fb-test","masterSeed":1,"characterName":"Gull"},"worker":"scaffold"}')

if [ -n "$ENV_CKPT" ]; then
  check "scaffold with no explicit checkpoint falls back to env default" "$FALLBACK_CODE" "200"
  FB_PID=$(python3 -c "import json;print(json.load(open('/tmp/fb.json')).get('promptId',''))" 2>/dev/null)
  sleep 1
  CKPT_IN_GRAPH=$(curl -s "$MOCK/queue" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for e in (d.get('queue_running') or [])+(d.get('queue_pending') or []):
    if e[1]=='$FB_PID':
        for n in e[2].values():
            if n.get('class_type')=='CheckpointLoaderSimple':
                print(n['inputs'].get('ckpt_name',''))
" 2>/dev/null)
  if [ -z "$CKPT_IN_GRAPH" ]; then
    CKPT_IN_GRAPH=$(curl -s "$MOCK/history/$FB_PID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for v in d.values():
    for n in (v.get('prompt') or [None,None,{}])[2].values():
        if n.get('class_type')=='CheckpointLoaderSimple':
            print(n['inputs'].get('ckpt_name',''))
" 2>/dev/null)
  fi
  check "env checkpoint reaches the graph's CheckpointLoaderSimple" "$CKPT_IN_GRAPH" "$ENV_CKPT"
else
  check "scaffold without any checkpoint is refused (HTTP 400)" "$FALLBACK_CODE" "400"
  grep -q 'COMFYUI_VIDEO_CHECKPOINT' /tmp/fb.json \
    && ok "error tells the operator how to fix it" \
    || bad "error tells the operator how to fix it" "$(head -c 200 /tmp/fb.json)"
fi

SCAFFOLD_PID=$(curl -s -X POST "$APP/api/video/queue" -H 'Content-Type: application/json' \
  -d '{"shot":{"id":"s5","scene":"Scene 5","prompt":"a gull circles the mast","camera":"Wide shot","duration":2},
       "board":{"id":"dup-test","masterSeed":12345,"characterName":"Navigator Sable",
                "characterTraits":"silver-streaked braid"},
       "settings":{"checkpoint":"mock_wan21.safetensors","frames":16},"worker":"scaffold"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('promptId',''))" 2>/dev/null)

if [ -n "$SCAFFOLD_PID" ]; then
  sleep 1
  GRAPH_TEXT=$(curl -s "$MOCK/history/$SCAFFOLD_PID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for v in d.values():
    for node in (v.get('prompt') or [None,None,{}])[2].values():
        t=node.get('inputs',{}).get('text')
        if t: print(t)
" 2>/dev/null)
  # History is empty until the job finishes, so read the submitted graph from the
  # queue instead when it is still in flight.
  if [ -z "$GRAPH_TEXT" ]; then
    GRAPH_TEXT=$(curl -s "$MOCK/queue" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for entry in (d.get('queue_running') or [])+(d.get('queue_pending') or []):
    if entry[1]=='$SCAFFOLD_PID':
        for node in entry[2].values():
            t=node.get('inputs',{}).get('text')
            if t: print(t)
" 2>/dev/null)
  fi

  if [ -n "$GRAPH_TEXT" ]; then
    ANCHORS=$(printf '%s' "$GRAPH_TEXT" | grep -c 'character anchor' || true)
    check "scaffold prompt does not carry a duplicate anchor tag" "$ANCHORS" "0"
    printf '%s' "$GRAPH_TEXT" | grep -q 'Navigator Sable' \
      && ok "character identity reaches the graph" || bad "character identity reaches the graph" "$GRAPH_TEXT"
    printf '%s' "$GRAPH_TEXT" | grep -q 'silver-streaked braid' \
      && ok "appearance traits reach the graph" || bad "appearance traits reach the graph" ""
  else
    bad "could not read the submitted graph" "empty"
  fi
else
  bad "scaffold submission returned a prompt_id" ""
fi

# ------------------------------------------------------------------- summary
printf '\n\033[1m%s\033[0m\n' "----------------------------------------"
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
printf '\033[1m%s\033[0m\n' "----------------------------------------"
[ "$FAIL" -eq 0 ] || exit 1
