// Supabase Edge Function "bechirot-feed": live JSON for maale-amos.github.io/bechirot-live.
// GET -> {ts, gizra:[...], news:[...], results?, exitpolls?}. Each source is cached in memory a few seconds.
const KEYS = ["בחירות", "כנסת", "מדגם", "סקר", "מנדט", "קלפי", "רשימה", "הצבעה", "ועדת הבחירות",
  "נתניהו", "איזנקוט", "בנט", "דרעי", "גולדקנופף", "גפני", "סמוטריץ", "בן גביר", "ליברמן",
  "גולן", "עבאס", "הנדל", "וינטר", "ליכוד", "ש\"ס", "יהדות התורה", "קואליציה", "אופוזיציה"];
const FEEDS: [string, string][] = [["JDN", "https://www.jdn.co.il/feed/"], ["קול חי", "https://www.93fm.co.il/feed/"],
  ["קול ברמה", "https://www.kolbarama.co.il/feed/"]];
// Election-night sources (results.json / exitpolls.json kept in the GitHub repo by the night task).
const REPO = "https://raw.githubusercontent.com/maale-amos/bechirot-live/main/";
// Official CEC result pages for the 26th Knesset (URL pattern verified on archived 21st-25th Knesset files).
const CEC_NATIONAL = "https://votes26.bechirot.gov.il/nationalresults";
const CEC_LOCALITIES = "https://media26.bechirot.gov.il/files/expc.csv";
const ELIGIBLE = 7336553;
const SECTOR_TOWNS = ["בני ברק", "אלעד", "ביתר עילית", "מודיעין עילית", "עמנואל", "רכסים", "בית שמש", "קריית יערים",
  "תפרח", "מעלה עמוס", "נצרת", "אום אל-פחם", "רהט", "טייבה", "טירה", "סח'נין", "שפרעם", "באקה אל-גרביה", "טמרה",
  "כפר קאסם", "קלנסווה", "ירושלים", "תל אביב - יפו", "חיפה", "ראשון לציון", "נתניה", "באר שבע"];

/*CEC_PARSE*/

async function cec(): Promise<unknown | null> {
  const nr = await get(CEC_NATIONAL, 8000);
  if (!nr.ok) return null;
  const nat = parseNational(await nr.text());
  if (nat.lists.length < 5 || !nat.valid) return null;
  let locs: unknown[] = [];
  try {
    const lr = await get(CEC_LOCALITIES, 8000);
    if (lr.ok) {
      const buf = new Uint8Array(await lr.arrayBuffer());
      let csv = new TextDecoder("utf-8").decode(buf);
      if (!/שם ישוב/.test(csv)) csv = new TextDecoder("windows-1255").decode(buf);
      locs = parseExpc(csv);
    }
  } catch (_) { /* national results are enough */ }
  return buildResults(nat, locs, ELIGIBLE, SECTOR_TOWNS);
}

type Item = { title: string; link: string; source: string; date: string; id?: number };
const cache = new Map<string, { t: number; v: unknown }>();

async function cached<T>(key: string, secs: number, fn: () => Promise<T | null>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < secs * 1000) return hit.v as T;
  try {
    const v = await fn();
    if (v !== null) { cache.set(key, { t: Date.now(), v }); return v; }
  } catch (_) { /* keep last good value */ }
  return hit ? hit.v as T : null;
}

const hasKey = (t: string) => KEYS.some((k) => t.includes(k));
const clean = (t: string) => String(t || "").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;/g, " ").replace(/&#8211;/g, "–").replace(/https?:\/\/\S+/g, "").replace(/[*_~`#>]+/g, "")
  .replace(/\s+/g, " ").trim();

async function get(url: string, ms = 8000): Promise<Response> {
  return await fetch(url, { headers: { "User-Agent": "bechirot-live/1.0" }, signal: AbortSignal.timeout(ms) });
}

async function gizra(): Promise<Item[] | null> {
  const r = await get("https://hagizra.news/api/v2/messages?limit=40");
  if (!r.ok) return null;
  const msgs = (await r.json()).messages || [];
  const out: Item[] = [];
  for (const m of msgs) {
    if (m.deleted || m.is_ads) continue;
    const t = clean(m.text);
    if (t.length < 8) continue;
    out.push({ title: t.slice(0, 220), link: "https://hagizra.news/", source: "הגיזרה",
      date: new Date(String(m.timestamp).slice(0, 23) + "Z").toISOString(), id: m.id });
  }
  return out.slice(0, 25);
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? clean(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : "";
}

async function rss(): Promise<Item[] | null> {
  const res = await Promise.allSettled(FEEDS.map(([, u]) => get(u).then((r) => r.ok ? r.text() : null)));
  const items: Item[] = [], seen = new Set<string>();
  let ok = 0;
  res.forEach((r, i) => {
    if (r.status !== "fulfilled" || !r.value) return;
    ok++;
    for (const b of r.value.match(/<item>[\s\S]*?<\/item>/g) || []) {
      const lm = b.match(/<link[^>]*>([\s\S]*?)<\/link>/);
      const title = tag(b, "title"), link = lm ? lm[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "", d = new Date(tag(b, "pubDate"));
      if (!title || !link.startsWith("http") || isNaN(+d) || !hasKey(title) || seen.has(title)) continue;
      seen.add(title);
      items.push({ title: title.slice(0, 180), link, source: FEEDS[i][0], date: d.toISOString() });
    }
  });
  return ok ? items : null;
}

async function repoJson(name: string): Promise<unknown | null> {
  const r = await get(REPO + name + "?t=" + Date.now(), 5000);
  if (!r.ok) return null;
  const j = await r.json();
  return j && j.live ? j : null;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (new URL(req.url).searchParams.get("debug") === "1") {
    const probe: [string, string][] = [...FEEDS, ["cec26", CEC_NATIONAL], ["cec26csv", CEC_LOCALITIES],
      ["cec25", "https://votes25.bechirot.gov.il/nationalresults"]];
    const st = await Promise.all(probe.map(([s, u]) => get(u).then(async (r) => { const t = await r.text();
        return s + " " + r.status + " len=" + t.length + " items=" + (t.match(/<item>/g) || []).length + " ct=" + r.headers.get("content-type"); })
      .catch((e) => s + " ERR " + String(e).slice(0, 80))));
    return new Response(JSON.stringify(st), { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
  }
  const [g, n, official, repoRes, ep] = await Promise.all([
    cached("gizra", 10, gizra), cached("rss", 45, rss), cached("cec", 15, cec),
    cached("results", 15, () => repoJson("results.json")), cached("exit", 30, () => repoJson("exitpolls.json"))]);
  const res = official || repoRes;
  const giz = (g as Item[]) || [];
  const news = ((n as Item[]) || []).concat(giz.filter((x) => hasKey(x.title)))
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
  const body: Record<string, unknown> = { ts: new Date().toISOString(), gizra: giz, news };
  if (res) body.results = res;
  if (ep) body.exitpolls = ep;
  return new Response(JSON.stringify(body), { headers: { ...CORS, "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=5" } });
});
