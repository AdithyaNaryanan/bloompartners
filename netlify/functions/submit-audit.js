"use strict";

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Each dimension is 0-3. Total 9+ → reach out. 6-8 → discuss. <6 → no follow-up.
// Scores are NEVER revealed to the founder; they inform the LLM's tone.

function computeScoring(d) {
  // Stage match: right segment + currently at 1-4 units + 5-15 unit target
  let stageMatch = 0;
  if (["preschool", "microschool"].includes(d.school_type)) stageMatch += 1;
  const units = parseInt(d.units) || 0;
  if (units >= 1 && units <= 5) stageMatch += 1;
  const target = parseInt(d.target_units) || 0;
  if (target >= 5 && target <= 20) stageMatch += 1;

  // Economic floor: revenue / unit, margin, utilization
  let economicFloor = 0;
  if (["2-5cr", "5cr+"].includes(d.revenue_per_unit)) economicFloor += 1;
  else if (d.revenue_per_unit === "1-2cr") economicFloor += 0.5;
  if (["20-30", "30+"].includes(d.operating_margin)) economicFloor += 1;
  else if (d.operating_margin === "10-20") economicFloor += 0.5;
  const util = parseInt(d.utilization) || 0;
  if (util >= 80) economicFloor += 1;
  else if (util >= 60) economicFloor += 0.5;
  economicFloor = Math.min(3, Math.round(economicFloor));

  // Founder readiness: team depth, codification, openness to capital
  let founderReadiness = 0;
  if (d.senior_leaders === "yes") founderReadiness += 1;
  else if (d.senior_leaders === "in_progress") founderReadiness += 0.5;
  if (["substantial", "complete"].includes(d.codification)) founderReadiness += 1;
  else if (d.codification === "partial") founderReadiness += 0.5;
  if (d.open_to_capital === "yes") founderReadiness += 1;
  else if (d.open_to_capital === "maybe") founderReadiness += 0.5;
  founderReadiness = Math.min(3, Math.round(founderReadiness));

  // Ambition match: realistic timeline, sensible target, appropriate capital range
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

// ─── Submission JSON for Claude ───────────────────────────────────────────────

function buildSubmission(d) {
  return {
    school: {
      type: d.school_type,
      units_today: d.units,
      students_enrolled: d.students,
      waitlist_depth: d.waitlist,
      what_parents_say: d.parent_word || "(not provided)",
    },
    founder_and_team: {
      years_running: d.years_running,
      school_independence_without_founder: d.independence,
      senior_leaders_who_could_run_campus: d.senior_leaders,
      timeline_to_goal_years: d.timeline,
    },
    economics: {
      revenue_per_unit_mature: d.revenue_per_unit,
      operating_margin_mature: d.operating_margin,
      capacity_utilization_pct: `${d.utilization}%`,
      estimated_capex_new_unit: d.new_unit_capex,
    },
    ambition: {
      target_units_in_3_5_years: d.target_units,
      capital_need_range: d.capital_need,
      what_scaling_unlocks: d.scaling_unlocks || "(not provided)",
    },
    readiness: {
      codification_status: d.codification,
      open_to_outside_capital_with_governance: d.open_to_capital,
      why_reaching_out_now: d.why_now || "(not provided)",
    },
    additional_context: d.anything_else || "(none)",
  };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(submission, scoring, firstName) {
  return `You are writing a personalized "Readiness Profile" email to a preschool or microschool founder in India who just completed Bloom Partners' readiness audit. Bloom is a capital + operating partner for India's best founder-led preschools — selective, soulful, honest. Voice: gatekeeper energy. Respectful of the founder, direct about gaps. No fluff, no consultant-speak, no "exciting opportunity to work together" language. No emojis. No "best regards." No HTML formatting — plain text only.

Here is the founder's submission:
${JSON.stringify(submission, null, 2)}

Here is the internal scoring (use to calibrate honesty — DO NOT reveal scores or numerical ratings to the founder):
${JSON.stringify(scoring, null, 2)}

Write an email with this exact structure:

1. Opening line: "Thanks, ${firstName} — here's what your audit told us." (one line only, no fluff before or after)

2. The Readiness Profile — 4 labeled dimensions. Each is 1-2 sentences: one on what is strong, one on what is a gap. If everything is strong in a dimension, name what to defend. If everything is weak, name the most important thing to fix first. Use these exact labels:

Academic clarity:
Founder and team depth:
Economic foundation:
Scaling readiness:

3. One paragraph of "what to do next" — useful, specific advice based on their largest gap. Not a sales pitch. Concrete, not abstract. 3-4 sentences.

4. Closing line, verbatim: "If we see a fit on our side, you'll hear from us within five business days. If not, this profile is yours to use however it's useful."

5. Sign-off: "— Bloom Partners"

Total length: 250-350 words. Direct, soulful, India-aware. Honest beats polished. If the founder is clearly weak on multiple dimensions, say so kindly — don't soften it into uselessness. Currency is ₹ (Indian Rupees).`;
}

// ─── Claude API call ──────────────────────────────────────────────────────────

async function generateProfile(submission, scoring, firstName) {
  const prompt = buildPrompt(submission, scoring, firstName);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.content[0].text.trim();
}

// ─── Resend email ─────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, text, bcc }) {
  const payload = {
    from: "Bloom Partners <profile@bloompartners.xyz>",
    to: [to],
    subject,
    text,
  };
  if (bcc) payload.bcc = [bcc];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Parse URL-encoded body
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf-8")
    : (event.body || "");
  const params = new URLSearchParams(raw);
  const d = Object.fromEntries(params.entries());

  const firstName = (d.first_name || "").trim();
  const email = (d.email || "").trim();

  if (!firstName || !email || !/\S+@\S+\.\S+/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing name or email" }) };
  }

  console.log(`[audit] submission from ${firstName} <${email}>`);

  const submission = buildSubmission(d);
  const scoring = computeScoring(d);

  console.log(`[audit] score: ${scoring.total}/12 → ${scoring.recommendation}`);

  // ── Generate Readiness Profile ──────────────────────────────────────────────
  let profileText;
  let llmFailed = false;

  try {
    profileText = await generateProfile(submission, scoring, firstName);
    console.log(`[audit] profile generated (${profileText.length} chars)`);
  } catch (err) {
    console.error(`[audit] LLM failed: ${err.message}`);
    llmFailed = true;
    profileText =
      `Thanks, ${firstName}. We've received your audit and we'll be in touch within five business days if there's a fit.\n\n— Bloom Partners`;

    // Notify operator of LLM failure
    if (process.env.OPERATOR_EMAIL) {
      await sendEmail({
        to: process.env.OPERATOR_EMAIL,
        subject: `[Bloom Audit] LLM failure — ${firstName} (${email})`,
        text: `LLM generation failed.\nError: ${err.message}\n\nSubmission:\n${JSON.stringify(d, null, 2)}\n\nScoring:\n${JSON.stringify(scoring, null, 2)}`,
      }).catch(e => console.error(`[audit] operator notify failed: ${e.message}`));
    }
  }

  // ── Send email to founder ───────────────────────────────────────────────────
  try {
    await sendEmail({
      to: email,
      subject: "Your Bloom Readiness Profile",
      text: profileText,
      bcc: process.env.OPERATOR_EMAIL,
    });
    console.log(`[audit] email sent to ${email}`);
  } catch (err) {
    console.error(`[audit] email send failed: ${err.message}`);
    // Still return 200 — submission was received, email issue is operator's problem
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, emailFailed: true, llmFailed }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, llmFailed }),
  };
};
