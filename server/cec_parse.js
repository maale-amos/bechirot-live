// Parsers for the Central Elections Committee result pages (same format since the 21st Knesset).
// Used by index.ts (copied in at deploy time by deploy_supabase.py) and tested by test_cec.mjs against
// the archived 2022 files. Plain JS on purpose so both Deno and Node can run it.

const num = (s) => Number(String(s || "").replace(/[^\d.]/g, "")) || 0;
const text = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// votesNN.bechirot.gov.il/nationalresults -> {eligible, voters, valid, invalid, turnout, pctCounted, lists:[{name, letters, votes, seats}]}
export function parseNational(html) {
  const out = { eligible: 0, voters: 0, valid: 0, invalid: 0, turnout: 0, pctCounted: null, lists: [] };
  const sumTable = html.match(/בעלי זכות בחירה[\s\S]*?<\/table>/);
  if (sumTable) {
    const rows = sumTable[0].match(/<tr[\s\S]*?<\/tr>/g) || [];
    const dataRow = rows.find((r) => /<td/.test(r)) || "";
    const cells = (dataRow.match(/<td[\s\S]*?<\/td>/g) || []).map(text);
    if (cells.length >= 5) {
      out.eligible = num(cells[0]); out.voters = num(cells[1]); out.turnout = num(cells[2]);
      out.valid = num(cells[3]); out.invalid = num(cells[4]);
    }
  }
  for (const r of html.match(/<tr[^>]*>\s*<td[^>]*scope="row"[\s\S]*?<\/tr>/g) || []) {
    const c = (r.match(/<td[\s\S]*?<\/td>/g) || []).map(text);
    if (c.length < 5) continue;
    out.lists.push({ name: c[0], letters: c[1], seats: num(c[2]), votes: num(c[4]) });
  }
  // counting progress, if the page states it ("... קלפיות ... 87.5%")
  const t = text(html);
  const m = t.match(/קלפיות\s*(?:שנספרו|שנקלטו|שהוזנו|שדווחו)[^%]{0,40}?(\d{1,3}(?:\.\d+)?)\s?%/);
  if (m) out.pctCounted = Math.min(100, Number(m[1]));
  else if (/תוצאות סופיות/.test(t)) out.pctCounted = 100;
  return out;
}

// mediaNN.bechirot.gov.il/files/expc.csv -> [{name, voters, valid, votes:{letters: n}}]
export function parseExpc(csv) {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim());
  const iName = head.indexOf("שם ישוב"), iVoters = head.indexOf("מצביעים"), iValid = head.indexOf("כשרים");
  if (iName < 0 || iValid < 0) return [];
  const first = iValid + 1, out = [];
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const votes = {};
    for (let i = first; i < head.length; i++) { const v = num(c[i]); if (v) votes[head[i]] = v; }
    out.push({ name: (c[iName] || "").trim(), voters: num(c[iVoters]), valid: num(c[iValid]), votes });
  }
  return out;
}

// Build the page's results.json shape. keepNames: localities always included (sector towns).
export function buildResults(nat, locs, eligibleFallback, keepNames) {
  const byLetters = {};
  nat.lists.forEach((l) => { byLetters[l.letters] = l.name; });
  const eligible = nat.eligible || eligibleFallback;
  let pct = nat.pctCounted;
  let estimated = false;
  if (pct == null) { pct = eligible ? Math.min(99, nat.voters / (eligible * 0.7) * 100) : 0; estimated = true; }
  const keep = new Set(keepNames || []);
  const sorted = locs.filter((x) => x.valid > 0).sort((a, b) => b.valid - a.valid);
  const chosen = sorted.filter((x, i) => i < 60 || keep.has(x.name));
  return {
    live: true, source: "ועדת הבחירות המרכזית", updated: new Date().toISOString(),
    pctCounted: Math.round(pct * 10) / 10, pctEstimated: estimated,
    turnout: nat.turnout || (eligible ? nat.voters / eligible * 100 : 0),
    eligible, voters: nat.voters, valid: nat.valid,
    parties: nat.lists.map((l) => ({ name: l.name, letters: l.letters, votes: l.votes, officialSeats: l.seats })),
    localities: chosen.map((x) => {
      const v = {};
      for (const k in x.votes) v[byLetters[k] || k] = x.votes[k];
      return { name: x.name, voters: x.voters, votes: v };
    }),
  };
}
