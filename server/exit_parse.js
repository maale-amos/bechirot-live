// Reads TV exit-poll numbers out of news flashes ("מדגם חדשות 12: הליכוד 24, ישר! 21 ...").
// A poll is accepted only when at least 7 lists were found and the seats add up to exactly 120,
// so a misread number cannot slip through. Inlined into index.ts at deploy; tested by test_exit.mjs.

const HE = "א-ת";
// [party key, patterns]; order matters only for readability, every pattern is anchored on word edges.
const EXIT_PARTIES = [
  ["likud", ["הליכוד", "ליכוד"]],
  ["yashar", ["ישר!", "ישר", "איזנקוט"]],
  ["together", ["ביחד", "בנט"]],
  ["dems", ["הדמוקרטים", "דמוקרטים"]],
  ["joint", ["הרשימה המשותפת", "המשותפת", "חד\"ש-תע\"ל", "חד\"ש"]],
  ["shas", ["ש\"ס", "ש״ס", "שס"]],
  ["otzma", ["עוצמה יהודית", "עוצמה", "בן גביר"]],
  ["utj", ["יהדות התורה", "ג'", "ג׳"]],
  ["yb", ["ישראל ביתנו", "ליברמן"]],
  ["rzp", ["הציונות הדתית", "ציונות דתית", "סמוטריץ'", "סמוטריץ׳"]],
  ["raam", ["רע\"ם", "רע״ם", "רעם"]],
  ["reserv", ["המילואימניקים", "מילואימניקים", "הנדל"]],
  ["amcha", ["עמך ישראל", "וינטר"]],
  ["haredi", ["הציבור החרדי"]],
  ["noam", ["נעם"]],
];
const CHANNELS = [
  ["חדשות 12", /(חדשות|ערוץ|קשת|רשת)\s*12|N12|מאקו/i],
  ["כאן 11", /כאן\s*(11|חדשות)?|ערוץ\s*11/],
  ["חדשות 13", /(חדשות|ערוץ|רשת)\s*13/],
  ["ערוץ 14", /(ערוץ|עכשיו)\s*14|חדשות\s*14/],
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function readSeats(text) {
  const t = " " + String(text).replace(/\s+/g, " ") + " ";
  const seats = {};
  for (const [key, pats] of EXIT_PARTIES) {
    for (const p of pats) {
      // party word not glued to other Hebrew letters, then up to 12 non-digit chars, then 1-2 digits
      const re = new RegExp(`(?:^|[^${HE}])${esc(p)}(?![${HE}])[^\\d\\n]{0,12}?(\\d{1,2})(?!\\d)`);
      const m = t.match(re);
      if (m) { seats[key] = Number(m[1]); break; }
    }
  }
  return seats;
}

export function readExitPoll(text) {
  if (!/מדגם|מדגמ/.test(text)) return null;
  const ch = CHANNELS.find(([, re]) => re.test(text));
  if (!ch) return null;
  const seats = readSeats(text);
  const keys = Object.keys(seats);
  const total = keys.reduce((s, k) => s + seats[k], 0);
  if (keys.length < 7 || total !== 120) return null;
  return { channel: ch[0], seats };
}

// items: [{text, date, source}] newest first -> {live, updated, polls:[...]} or null
export function collectExitPolls(items, since) {
  const best = {};
  for (const it of items) {
    if (since && it.date < since) continue;
    const p = readExitPoll(it.text);
    if (!p) continue;
    if (!best[p.channel] || it.date > best[p.channel].date) {
      best[p.channel] = { channel: p.channel, pollster: "לפי מבזק " + it.source, source: it.source, date: it.date,
        time: new Date(it.date).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }),
        seats: p.seats };
    }
  }
  const polls = Object.values(best);
  return polls.length ? { live: true, auto: true, updated: new Date().toISOString(), polls } : null;
}
