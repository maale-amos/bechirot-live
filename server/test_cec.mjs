// node server/test_cec.mjs <nationalresults.html> <expc.csv> — checks the parsers against archived 2022 files.
import { readFileSync } from "node:fs";
import { parseNational, parseExpc, buildResults } from "./cec_parse.js";

const nat = parseNational(readFileSync(process.argv[2], "utf8"));
const locs = parseExpc(readFileSync(process.argv[3], "utf8"));
const res = buildResults(nat, locs, 0, ["בני ברק", "אלעד"]);
const fail = [];
if (nat.eligible !== 6788804) fail.push("eligible " + nat.eligible);
if (nat.valid !== 4764742) fail.push("valid " + nat.valid);
if (nat.lists.length < 10) fail.push("lists " + nat.lists.length);
const seats = nat.lists.reduce((s, l) => s + l.seats, 0);
if (seats !== 120) fail.push("seats " + seats);
const likud = nat.lists.find((l) => l.letters === "מחל");
if (!likud || likud.votes !== 1115336) fail.push("likud " + (likud && likud.votes));
const locSum = locs.reduce((s, x) => s + (x.votes["מחל"] || 0), 0);
if (Math.abs(locSum - 1115336) > 5) fail.push("likud by localities " + locSum);
if (!res.localities.some((x) => x.name === "בני ברק")) fail.push("bnei brak missing");
console.log(JSON.stringify({ lists: nat.lists.length, seats, localities: locs.length, chosen: res.localities.length,
  pct: res.pctCounted, est: res.pctEstimated, turnout: res.turnout, sample: Object.keys(res.localities[0].votes).length }));
console.log(fail.length ? "FAIL " + fail.join("; ") : "OK");
process.exit(fail.length ? 1 : 0);
