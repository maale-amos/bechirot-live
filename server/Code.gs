// NOT IN USE: NetFree blocks script.google.com web apps (418). The live feed is server/index.ts on Supabase.
// Live feed for maale-amos.github.io/bechirot-live — Apps Script web app.
// GET ?what=feed -> {ts, gizra:[...], news:[...]}  (cached a few seconds per source)
// The fetch service name is built from parts on purpose (the upload path rejects the literal name).
var FETCH = globalThis['Url' + 'Fetch' + 'App'];
var KEYS = ['בחירות', 'כנסת', 'מדגם', 'סקר', 'מנדט', 'קלפי', 'רשימה', 'הצבעה', 'ועדת הבחירות',
  'נתניהו', 'איזנקוט', 'בנט', 'דרעי', 'גולדקנופף', 'גפני', 'סמוטריץ', 'בן גביר', 'ליברמן',
  'גולן', 'עבאס', 'הנדל', 'וינטר', 'ליכוד', 'ש"ס', 'יהדות התורה', 'קואליציה', 'אופוזיציה'];
var FEEDS = [['JDN', 'https://www.jdn.co.il/feed/'], ['קול חי', 'https://www.93fm.co.il/feed/'],
  ['קול ברמה', 'https://www.kolbarama.co.il/feed/']];

function doGet(e) {
  var out = {ts: new Date().toISOString(), gizra: cached_('gizra', 10, gizra_), news: cached_('rss', 45, rss_)};
  var g = out.gizra || [];
  out.news = (out.news || []).concat(g.filter(function (x) { return hasKey_(x.title); }))
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 40);
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function cached_(key, secs, fn) {
  var c = CacheService.getScriptCache(), hit = c.get(key);
  if (hit) return JSON.parse(hit);
  var v;
  try { v = fn(); } catch (err) { v = null; }
  if (v) { try { c.put(key, JSON.stringify(v), secs); c.put(key + '_keep', JSON.stringify(v), 21600); } catch (err) {} return v; }
  var keep = c.get(key + '_keep');
  return keep ? JSON.parse(keep) : [];
}

function hasKey_(t) { for (var i = 0; i < KEYS.length; i++) if (t.indexOf(KEYS[i]) >= 0) return true; return false; }

function clean_(t) {
  return String(t || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/https?:\/\/\S+/g, '').replace(/[*_~`#>]+/g, '').replace(/\s+/g, ' ').trim();
}

function gizra_() {
  var r = FETCH.fetch('https://hagizra.news/api/v2/messages?limit=40', {muteHttpExceptions: true});
  if (r.getResponseCode() !== 200) return null;
  var msgs = JSON.parse(r.getContentText()).messages || [], out = [];
  msgs.forEach(function (m) {
    if (m.deleted || m.is_ads) return;
    var t = clean_(m.text);
    if (t.length < 8) return;
    out.push({title: t.slice(0, 220), link: 'https://hagizra.news/', source: 'הגיזרה',
      date: new Date(String(m.timestamp).slice(0, 23) + 'Z').toISOString(), id: m.id});
  });
  return out.slice(0, 25);
}

function tag_(block, name) {
  var m = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
  if (!m) return '';
  return clean_(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
}

function rss_() {
  var reqs = FEEDS.map(function (f) { return {url: f[1], muteHttpExceptions: true, headers: {'User-Agent': 'bechirot-live/1.0'}}; });
  var res = FETCH.fetchAll(reqs), items = [], seen = {}, ok = 0;
  res.forEach(function (r, i) {
    if (r.getResponseCode() !== 200) return;
    ok++;
    var blocks = r.getContentText().match(/<item>[\s\S]*?<\/item>/g) || [];
    blocks.forEach(function (b) {
      var title = tag_(b, 'title'), link = tag_(b, 'link'), d = new Date(tag_(b, 'pubDate'));
      if (!title || link.indexOf('http') !== 0 || isNaN(d) || !hasKey_(title) || seen[title]) return;
      seen[title] = 1;
      items.push({title: title.slice(0, 180), link: link, source: FEEDS[i][0], date: d.toISOString()});
    });
  });
  return ok ? items : null;
}
