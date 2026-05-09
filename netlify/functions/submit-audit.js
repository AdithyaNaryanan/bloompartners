"use strict";

// ─── Scoring ──────────────────────────────────────────────────────────────────

function computeScoring(d) {
  let stageMatch = 0;
  if (["preschool", "microschool"].includes(d.school_type)) stageMatch += 1;
  const units = parseInt(d.units) || 0;
  if (units >= 1 && units <= 5) stageMatch += 1;
  const target = parseInt(d.target_units) || 0;
  if (target >= 5 && target <= 20) stageMatch += 1;

  let economicFloor = 0;
  if (["2-5cr", "5cr+"].includes(d.revenue_per_unit)) economicFloor += 1;
  else if (d.revenue_per_unit === "1-2cr") economicFloor += 0.5;
  if (["20-30", "30+"].includes(d.operating_margin)) economicFloor += 1;
  else if (d.operating_margin === "10-20") economicFloor += 0.5;
  const util = parseInt(d.utilization) || 0;
  if (util >= 80) economicFloor += 1;
  else if (util >= 60) economicFloor += 0.5;
  economicFloor = Math.min(3, Math.round(economicFloor));

  let founderReadiness = 0;
  if (d.senior_leaders === "yes") founderReadiness += 1;
  else if (d.senior_leaders === "in_progress") founderReadiness += 0.5;
  if (["substantial", "complete"].includes(d.codification)) founderReadiness += 1;
  else if (d.codification === "partial") founderReadiness += 0.5;
  if (d.open_to_capital === "yes") founderReadiness += 1;
  else if (d.open_to_capital === "maybe") founderReadiness += 0.5;
  founderReadiness = Math.min(3, Math.round(founderReadiness));

  let ambitionMatch = 0;
  const timeline = parseInt(d.timeline) || 99;
  if (timeline >= 2 && timeline <= 5) ambitionMatch += 1;
  else if (timeline > 5 && timeline <= 8) ambitionMatch += 0.5;
  if (target >= 5 && target <= 20) ambitionMatch += 1;
  if (["5-15cr", "15-50cr", "50cr+"].includes(d.capital_need)) ambitionMatch += 1;
  else if (d.capital_need === "1-5cr") ambitionMatch += 0.5;
  ambitionMatch = Math.min(3, Math.round(ambitionMatch));

  const total = stageMatch + economicFloor + founderReadiness + ambitionMatch;
  const recommendation =
    total >= 9 ? "reach_out" :
    total >= 6 ? "discuss_internally" :
    "no_followup";

  return { stageMatch, economicFloor, founderReadiness, ambitionMatch, total, recommendation };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf-8")
    : (event.body || "");
  const params = new URLSearchParams(raw);
  const d = Object.fromEntries(params.entries());

  const firstName = (d.first_name || "").trim();
  const email = (d.email || "").trim();

  if (!firstName || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing name or email" }) };
  }

  const scoring = computeScoring(d);

  console.log(`[audit] ${firstName} <${email}> — score: ${scoring.total}/12 → ${scoring.recommendation}`);
  console.log(`[audit] submission: ${JSON.stringify(d)}`);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  };
};
