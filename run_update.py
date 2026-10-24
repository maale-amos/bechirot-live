"""Hidden runner for the Windows task BechirotLiveUpdate (every 10 minutes, via pyw.exe).
Pulls, refreshes news.json and polls.json, pushes only when something changed.
One log line per run in update.log."""
import os, subprocess, sys, datetime

REPO = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(REPO, "update.log")


def log(msg):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S") + " " + msg + "\n")


def git(*args):
    r = subprocess.run(["git", "-c", "user.name=yossi6742853", "-c", "user.email=6742853@gmail.com", *args],
                       cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    return r.returncode, (r.stdout + r.stderr).strip()


def main():
    try:
        import psutil
        psutil.Process().nice(psutil.IDLE_PRIORITY_CLASS)
    except Exception:
        pass
    git("pull", "--rebase", "-q")
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    r = subprocess.run([sys.executable, "-I", "update.py"], cwd=REPO, capture_output=True, text=True,
                       encoding="utf-8", errors="ignore", env=env, timeout=240)
    out = " | ".join(l for l in r.stdout.splitlines() if l.strip())
    git("add", "news.json", "polls.json")
    code, _ = git("diff", "--cached", "--quiet")
    if code == 0:
        log("no change · " + out)
        return
    git("commit", "-q", "-m", "auto: news and polls")
    code, msg = git("push", "-q")
    log(("pushed · " if code == 0 else "PUSH FAILED " + msg[:200] + " · ") + out)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log("ERROR " + repr(e)[:300])
