"use strict";

// ─── Scoring ──────────────────────────────────────────────────────────────────

function computeScoring(d) {
  // Stage match
  let stageMatch = 0;
  if (["preschool", "microschool"].includes(d.school_type)) stageMatch += 1;
  if (["1-2", "3-5"].includes(d.units)) stageMatch += 1;
  if (["3-5", "5-10"].includes(d.target_units)) stageMatch += 1;

  // Economic floor
  let economicFloor = 0;
  if (["2-5cr", "5cr+"].includes(d.revenue_total)) economicFloor += 1;
  else if (d.revenue_total === "1-2cr") economicFloor += 0.5;
  if (["20-30", "30+"].includes(d.operating_margin)) economicFloor += 1;
  else if (d.operating_margin === "10-20") economicFloor += 0.5;
  const selfFund = parseInt(d.capital_self_fund) || 0;
  if (selfFund >= 50) economicFloor += 1;
  else if (selfFund >= 25) economicFloor += 0.5;
  economicFloor = Math.min(3, Math.round(economicFloor));

  // Founder readiness
  let founderReadiness = 0;
  if (d.senior_leaders === "yes") founderReadiness += 1;
  else if (d.senior_leaders === "in_progress") founderReadiness += 0.5;
  if (["substantial", "complete"].includes(d.codification)) founderReadiness += 1;
  else if (d.codification === "partial") founderReadiness += 0.5;
  if (d.open_to_capital === "yes") founderReadiness += 1;
  else if (d.open_to_capital === "maybe") founderReadiness += 0.5;
  founderReadiness = Math.min(3, Math.round(founderReadiness));

  // Ambition match
  let ambitionMatch = 0;
  if (["2-5", "5+"].includes(d.applications_per_seat)) ambitionMatch += 1;
  else if (d.applications_per_seat === "1-2") ambitionMatch += 0.5;
  if (["5-10", "10-25"].includes(d.target_units)) ambitionMatch += 1;
  if (["5-10", "10+"].includes(d.years_running)) ambitionMatch += 0;
  if (d.years_running === "2-5" || d.years_running === "5-10") ambitionMatch += 1;
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
