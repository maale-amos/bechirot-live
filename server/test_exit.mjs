// node server/test_exit.mjs — exit-poll reader against flash formats seen in Israeli news.
import { readExitPoll, collectExitPolls } from "./exit_parse.js";

const cases = [
  // comma list, 120 total
  ["מדגם חדשות 12: הליכוד 24, ישר! 21, ביחד 13, הדמוקרטים 9, המשותפת 9, עוצמה יהודית 8, ש\"ס 8, יהדות התורה 7, ישראל ביתנו 7, הציונות הדתית 7, רע\"ם 5, המילואימניקים 2",
    "חדשות 12", { likud: 24, yashar: 21, yb: 7, reserv: 2 }],
  // dashes, line breaks, gershayim variant
  ["🔴 מדגם כאן 11:\nליכוד - 23\nישר - 22\nביחד - 14\nדמוקרטים - 9\nחד\"ש - 8\nעוצמה - 8\nש״ס - 8\nיהדות התורה - 8\nישראל ביתנו - 7\nציונות דתית - 7\nרע״ם - 6",
    "כאן 11", { likud: 23, yashar: 22, joint: 8, raam: 6 }],
  // "ישראל ביתנו" must not be read as "ישר"; "עמך ישראל" not as YB
  ["ערוץ 14 מדגם: הליכוד 30 ישראל ביתנו 5 ישר! 19 ביחד 11 הדמוקרטים 8 המשותפת 8 עוצמה 9 ש\"ס 9 יהדות התורה 8 הציונות הדתית 8 רע\"ם 5 עמך ישראל 0",
    "ערוץ 14", { likud: 30, yb: 5, yashar: 19, amcha: 0 }],
  // sums to 119 -> rejected
  ["מדגם חדשות 13: הליכוד 24, ישר! 21, ביחד 13, הדמוקרטים 9, המשותפת 9, עוצמה יהודית 8, ש\"ס 8, יהדות התורה 7, ישראל ביתנו 7, הציונות הדתית 6, רע\"ם 5, המילואימניקים 2",
    null, null],
  // no exit-poll word -> rejected
  ["סקר חדשות 12: הליכוד 24, ישר! 21, ביחד 13, הדמוקרטים 9, המשותפת 9, עוצמה יהודית 8, ש\"ס 8, יהדות התורה 7, ישראל ביתנו 7, הציונות הדתית 7, רע\"ם 5, המילואימניקים 2",
    null, null],
];
let bad = 0;
for (const [text, ch, expect] of cases) {
  const r = readExitPoll(text);
  let ok = ch === null ? r === null : !!r && r.channel === ch && Object.entries(expect).every(([k, v]) => r.seats[k] === v);
  if (!ok) { bad++; console.log("FAIL", ch, JSON.stringify(r)); }
}
const col = collectExitPolls(cases.map((c, i) => ({ text: c[0], date: "2026-10-27T19:0" + i + ":00Z", source: "test" })), "2026-10-27T18:55:00Z");
if (!col || col.polls.length !== 3) { bad++; console.log("FAIL collect", col && col.polls.length); }
console.log(bad ? bad + " failed" : "OK " + cases.length + " cases");
process.exit(bad ? 1 : 0);
