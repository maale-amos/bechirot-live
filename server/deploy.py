# -*- coding: utf-8 -*-
"""Create/update the Apps Script web app (account 6787012 via clasp token) and print its URL.
State (scriptId, deploymentId) is kept in server/state.json."""
import json, io, os, ssl, sys, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "state.json")
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
CL = os.path.join(os.path.expanduser("~"), ".clasprc.json")
API = "https://script.googleapis.com/v1/projects"

MANIFEST = {"timeZone": "Asia/Jerusalem", "exceptionLogging": "STACKDRIVER", "runtimeVersion": "V8",
            "oauthScopes": ["https://www.googleapis.com/auth/script.external_request"],
            "webapp": {"executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS"}}


def token():
    d = json.load(io.open(CL, encoding="utf-8"))["tokens"]["default"]
    body = urllib.parse.urlencode({"client_id": d["client_id"], "client_secret": d["client_secret"],
                                   "refresh_token": d["refresh_token"], "grant_type": "refresh_token"}).encode()
    r = urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=body), context=CTX)
    return json.load(r)["access_token"]


def call(method, url, tok, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, context=CTX))
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, url, e.read().decode("utf-8", "ignore")[:400])
        sys.exit(1)


def main():
    tok = token()
    st = json.load(open(STATE)) if os.path.exists(STATE) else {}
    if "scriptId" not in st:
        st["scriptId"] = call("POST", API, tok, {"title": "bechirot-live-feed"})["scriptId"]
    sid = st["scriptId"]
    code = io.open(os.path.join(HERE, "Code.gs"), encoding="utf-8").read()
    call("PUT", API + "/" + sid + "/content", tok, {"files": [
        {"name": "appsscript", "type": "JSON", "source": json.dumps(MANIFEST)},
        {"name": "Code", "type": "SERVER_JS", "source": code}]})
    ver = call("POST", API + "/" + sid + "/versions", tok, {"description": "auto"})["versionNumber"]
    cfg = {"deploymentConfig": {"versionNumber": ver, "manifestFileName": "appsscript", "description": "live"}}
    if "deploymentId" in st:
        call("PUT", API + "/" + sid + "/deployments/" + st["deploymentId"], tok, cfg)
    else:
        st["deploymentId"] = call("POST", API + "/" + sid + "/deployments", tok, cfg["deploymentConfig"])["deploymentId"]
    json.dump(st, open(STATE, "w"))
    print("script:", sid)
    print("version:", ver)
    print("url: https://script.google.com/macros/s/" + st["deploymentId"] + "/exec")


if __name__ == "__main__":
    main()
