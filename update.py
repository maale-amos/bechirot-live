"""Refresh news.json (election headlines from Haredi news sites) and polls.json
(latest seat polls from Wikipedia). Runs in GitHub Actions every 10 minutes.
Each part writes its file only when the new data passes its checks."""
import json, re, sys, datetime, urllib.request, html
from email.utils import parsedate_to_datetime

UA = {"User-Agent": "bechirot-live/1.0 (github.com/maale-amos/bechirot-live)"}
FEEDS = [("JDN", "https://www.jdn.co.il/feed/"),
         ("קול חי", "https://www.93fm.co.il/feed/"),
         ("קול ברמה", "https://www.kolbarama.co.il/feed/")]
KEYS = ["בחירות", "כנסת", "מדגם", "סקר", "מנדט", "קלפי", "רשימה", "הצבעה", "ועדת הבחירות",
        "נתניהו", "איזנקוט", "בנט", "דרעי", "גולדקנופף", "גפני", "סמוטריץ", "בן גביר", "ליברמן",
        "גולן", "עבאס", "הנדל", "וינטר", "ליכוד", "ש\"ס", "יהדות התורה", "קואליציה", "אופוזיציה"]


def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def tag(block, name):
    m = re.search(r"<%s[^>]*>(.*?)</%s>" % (name, name), block, re.S)
    if not m:
        return ""
    t = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", m.group(1), flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", t)).strip()


def news():
    items, ok = [], 0
    for src, url in FEEDS:
        try:
            xml = get(url)
            ok += 1
        except Exception as e:
            print("feed failed", src, e)
            continue
        for b in re.findall(r"<item>(.*?)</item>", xml, re.S):
            title, link = tag(b, "title"), tag(b, "link")
            if not title or not link.startswith("http"):
                continue
            if not any(k in title for k in KEYS):
                continue
            try:
                d = parsedate_to_datetime(tag(b, "pubDate")).astimezone(datetime.timezone.utc)
            except Exception:
                continue
            items.append({"title": title[:180], "link": link, "source": src, "date": d.isoformat()})
    if not ok:
        print("news: no feed reachable, keeping old file")
        return
    seen, out = set(), []
    for it in sorted(items, key=lambda x: x["date"], reverse=True):
        if it["title"] in seen:
            continue
        seen.add(it["title"])
        out.append(it)
    write("news.json", {"updated": now(), "items": out[:40]})
    print("news:", len(out), "items from", ok, "feeds")


# Wikipedia column header -> page party key
COLS = {"likud": "likud", "together": "together", "rzp": "rzp", "otzma": "otzma", "shas": "shas",
        "utj": "utj", "yisrael beiteinu": "yb", "yb": "yb", "ra'am": "raam", "raam": "raam",
        "joint list": "joint", "joint": "joint", "dems": "dems", "democrats": "dems",
        "yashar": "yashar", "reserv": "reserv", "amcha": "amcha"}
OUTLETS = {"channel 12": "חדשות 12", "hahadashot 12": "חדשות 12", "n12": "חדשות 12",
           "channel 13": "חדשות 13", "channel 14": "ערוץ 14", "kan": "כאן 11", "kan 11": "כאן 11",
           "maariv": "מעריב", "israel hayom": "ישראל היום", "zman yisrael": "זמן ישראל",
           "i24news": "i24NEWS", "walla": "וואלה", "ynet": "ynet", "makor rishon": "מקור ראשון"}


def colkey(h):
    h = h.lower().replace("–", "-")
    for k, v in COLS.items():
        if h.startswith(k):
            return v
    return None


def cell(s):
    s = s.strip()
    m = re.fullmatch(r"(\d{1,2})", s)
    return int(m.group(1)) if m else None


def polls():
    api = ("https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=text"
           "&page=Opinion_polling_for_the_2026_Israeli_legislative_election")
    try:
        page = json.loads(get(api, 40))["parse"]["text"]
    except Exception as e:
        print("polls fetch failed", e)
        return
    for table in re.findall(r"<table[^>]*wikitable[^>]*>(.*?)</table>", page, re.S):
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)
        if not rows:
            continue
        txt = lambda c: html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<sup.*?</sup>", "", c, flags=re.S))).strip()
        head = [txt(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", rows[0], re.S)]
        keys = [colkey(h) for h in head]
        if "likud" not in keys or "yashar" not in keys:
            continue
        low = [h.lower() for h in head]
        i_date = next((i for i, h in enumerate(low) if "date" in h), 0)
        i_firm = next((i for i, h in enumerate(low) if "polling firm" in h or h == "firm"), 1)
        i_pub = next((i for i, h in enumerate(low) if "publisher" in h or "media" in h), 2)
        out = []
        for r in rows[1:]:
            cells = [txt(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
            if len(cells) != len(head):
                continue  # election rows and merged rows have a different shape
            seats = {}
            for k, c in zip(keys, cells):
                if k:
                    seats[k] = cell(c)
            total = sum(v for v in seats.values() if v)
            if not 118 <= total <= 122:
                continue
            pub = cells[i_pub]
            outlet = next((v for k, v in OUTLETS.items() if k in pub.lower()), pub)
            out.append({"d": cells[i_date], "who": cells[i_firm], "outlet": outlet, "s": seats})
            if len(out) == 6:
                break
        if len(out) >= 3:
            write("polls.json", {"updated": now(), "source": "Wikipedia", "polls": out})
            print("polls:", len(out))
            return
    print("polls: no valid table found, keeping old file")


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def write(name, obj):
    with open(name, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    news()
    polls()
    sys.exit(0)
