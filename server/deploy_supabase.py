# -*- coding: utf-8 -*-
"""Deploy server/index.ts as Supabase Edge Function "bechirot-feed" (project gmachim-maale-amos).
The Management PAT is read at run time from the credentials index, never stored here."""
import io, json, os, re, ssl, sys, uuid, urllib.request

REF = "cmsusfmwjtpfewbydzpi"
SLUG = "bechirot-feed"
HERE = os.path.dirname(os.path.abspath(__file__))
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE


def pat():
    p = os.path.join(os.path.expanduser("~"), ".secrets", "credentials-index.md")
    return re.search(r"sbp_[0-9a-f]{40}", io.open(p, encoding="utf-8").read()).group()


def main():
    code = io.open(os.path.join(HERE, "index.ts"), encoding="utf-8").read().encode("utf-8")
    meta = json.dumps({"entrypoint_path": "index.ts", "name": SLUG, "verify_jwt": False}).encode()
    b = "----" + uuid.uuid4().hex
    body = (("--%s\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n" % b).encode()
            + meta + ("\r\n--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"index.ts\"\r\n"
                      "Content-Type: application/typescript\r\n\r\n" % b).encode() + code + ("\r\n--%s--\r\n" % b).encode())
    url = "https://api.supabase.com/v1/projects/%s/functions/deploy?slug=%s" % (REF, SLUG)
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": "Bearer " + pat(), "Content-Type": "multipart/form-data; boundary=" + b})
    try:
        r = json.load(urllib.request.urlopen(req, context=CTX, timeout=90))
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode("utf-8", "ignore")[:400])
        sys.exit(1)
    print("deployed:", r.get("slug"), "version", r.get("version"), "status", r.get("status"))
    print("url: https://%s.supabase.co/functions/v1/%s" % (REF, SLUG))


if __name__ == "__main__":
    main()
