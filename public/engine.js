// public/engine.js
// Core Montana Child Support engine for the wizard + Worksheet A/B.
// - Tracks Worksheet A lines 1–24 explicitly (including SOLA 15–23)
// - Adds internal “Worksheet C effect” adjustment (other supported children) without generating C/D/E PDFs
// - Builds Worksheet B Part 1 + Part 2 objects for pdfgen.js using your existing PDF field naming

export function fmt(n) {
  const num = Number.isFinite(+n) ? +n : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

const PERSONAL_ALLOWANCE = 20345.0; // per parent, annual

const PRIMARY_ALLOWANCE_BY_CHILD = {
  1: 6104,
  2: 10173,
  3: 14242,
  4: 16276,
  5: 18311,
  6: 20345,
  7: 22380,
  8: 24414,
};

const SOLA_FACTOR_BY_CHILD = {
  1: 0.14,
  2: 0.21,
  3: 0.27,
  4: 0.31,
  5: 0.35,
  6: 0.39,
  7: 0.43,
  8: 0.47,
};

function toNum(x) {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(x, min, max) {
  const n = parseInt(x, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// CSSD rounding: worksheet lines are typically nearest whole dollar
function roundDollar(x) {
  return Math.round(toNum(x));
}

// cents rounding (only if you need it later)
function roundCents(x) {
  return Math.round(toNum(x) * 100) / 100;
}

/**
 * input = {
 *   grossMother,
 *   grossFather,
 *   otherSupportMother,
 *   otherSupportFather,
 *   numChildren,
 *   childcare,
 *   health,
 *   med,
 *   otherSupp,
 *   parenting: [{ daysA, daysB }, ...]
 * }
 */
export function runMontanaChildSupport(input) {
  const grossMother = toNum(input.grossMother);
  const grossFather = toNum(input.grossFather);

  const otherSupportMother = toNum(input.otherSupportMother);
  const otherSupportFather = toNum(input.otherSupportFather);

  const numChildren = clampInt(input.numChildren ?? 1, 1, 8);

  const childcare = toNum(input.childcare);
  const health = toNum(input.health);
  const med = toNum(input.med);
  const otherSupp = toNum(input.otherSupp);

  // parenting entries are per child: { daysA, daysB }
  const parenting = Array.isArray(input.parenting) ? input.parenting : [];

  const primaryAllowance =
    PRIMARY_ALLOWANCE_BY_CHILD[numChildren] || PRIMARY_ALLOWANCE_BY_CHILD[8];
  const solaFactor =
    SOLA_FACTOR_BY_CHILD[numChildren] || SOLA_FACTOR_BY_CHILD[8];

  const totalSupplements = childcare + health + med + otherSupp;

  // Worksheet A containers
  const mother = {};
  const father = {};
  const worksheetA = { mother, father };

  // --- Worksheet A lines 1–13 (your current implementation) ---

  mother.L1i = grossMother;
  father.L1i = grossFather;

  mother.L2l = otherSupportMother;
  father.L2l = otherSupportFather;

  mother.L3 = mother.L1i - mother.L2l;
  father.L3 = father.L1i - father.L2l;

  mother.L4 = mother.L3 - PERSONAL_ALLOWANCE;
  father.L4 = father.L3 - PERSONAL_ALLOWANCE;

  mother.L5 = Math.max(0, mother.L4);
  father.L5 = Math.max(0, father.L4);

  mother.L6 = grossMother * 0.12;
  father.L6 = grossFather * 0.12;

  mother.L7 = Math.max(mother.L5, mother.L6);
  father.L7 = Math.max(father.L5, father.L6);

  const L7_combined = mother.L7 + father.L7;
  worksheetA.L7_combined = L7_combined;

  const shareMother = L7_combined > 0 ? mother.L7 / L7_combined : 0.5;
  const shareFather = 1 - shareMother;

  worksheetA.shareMother = shareMother;
  worksheetA.shareFather = shareFather;

  worksheetA.L8 = L7_combined;
  worksheetA.L9_mother = shareMother;
  worksheetA.L9_father = shareFather;

  worksheetA.L10_children = numChildren;

  worksheetA.L11_primary_allowance = primaryAllowance;

  worksheetA.L12a_childcare = childcare;
  worksheetA.L12b_health = health;
  worksheetA.L12c_unreimbursed_med = med;
  worksheetA.L12d_other = otherSupp;
  worksheetA.L12e_total = totalSupplements;

  worksheetA.L13_total = primaryAllowance + totalSupplements;

  // store for downstream Worksheet B
  worksheetA.primaryAllowance = primaryAllowance;
  worksheetA.totalSupplements = totalSupplements;

  // --- Worksheet A SOLA section (your current implementation, fixed only for consistency) ---
  function computeSOLA(parent, share) {
    const out = {};

    // CSSD rule: if line 6 > line 5, skip to line 21 and enter line 6 amount.
    const skipSOLA = parent.L6 > parent.L5;

    if (skipSOLA) {
      out.L15 = null;
      out.L16 = null;
      out.L17 = null;
      out.L18a = null;
      out.L18b = null;
      out.L19 = null;
      out.L20 = 0; // if skipped, SOLA treated as 0 in this model

      out.L21 = parent.L6;
      out.L22 = 0;         // credits not modeled here
      out.L23 = out.L21 - out.L22;
      out.L24 = roundDollar(out.L23);
      return out;
    }

    out.L15 = parent.L7 - share * primaryAllowance - share * totalSupplements;
    out.L16 = 0;
    out.L17 = out.L15 - out.L16;
    out.L18a = 0;
    out.L18b = 0;
    out.L19 = out.L17 - (out.L18a + out.L18b);

    out.L20 = out.L19 * solaFactor;

    out.L21 = out.L20;
    out.L22 = 0;
    out.L23 = out.L21 - out.L22;
    out.L24 = roundDollar(out.L23);

    return out;
  }

  Object.assign(mother, computeSOLA(mother, shareMother));
  Object.assign(father, computeSOLA(father, shareFather));

  worksheetA.mother = mother;
  worksheetA.father = father;

  // --------------------------------------------------
  // INTERNAL "WORKSHEET C EFFECT" ADJUSTMENT
  // (Other supported children / other court-ordered support)
  //
  // IMPORTANT:
  // - We do NOT generate Worksheet C PDFs.
  // - We DO adjust the annual obligations used downstream (Worksheet B + final transfer).
  // --------------------------------------------------
  worksheetA.mother.adjustedL24 = Math.max(0, (mother.L24 || 0) - otherSupportMother);
  worksheetA.father.adjustedL24 = Math.max(0, (father.L24 || 0) - otherSupportFather);

  // Use adjusted obligations for payer + totals downstream
  const annualM_adj = worksheetA.mother.adjustedL24;
  const annualF_adj = worksheetA.father.adjustedL24;

  worksheetA.totalSupportAnnual = annualM_adj + annualF_adj;

  let payer = null;
  let payAnnual = 0;

  if (annualM_adj > annualF_adj) {
    payer = "M";
    payAnnual = annualM_adj - annualF_adj;
  } else if (annualF_adj > annualM_adj) {
    payer = "F";
    payAnnual = annualF_adj - annualM_adj;
  } else {
    payer = null;
    payAnnual = 0;
  }

  const totalMonthly = roundDollar(payAnnual / 12);
  const totalMonthlyM = roundDollar(annualM_adj / 12);
  const totalMonthlyF = roundDollar(annualF_adj / 12);

  // --------------------------------------------------
  // WORKSHEET B – PART 1 (uses your field schema)
  //
  // NOTE:
  // Your Worksheet A object does not currently track the exact "expense credits"
  // that appear on some official worksheet variants. Because you want to keep
  // your existing PDF fields, we fill the totals lines using the best-matching
  // values you actually compute:
  // - Use adjustedL24 as the annual obligation basis for B allocations
  // - Use A.L20 as SOLA total (if not skipped)
  // --------------------------------------------------
  const worksheetBPart1 = {
    numChildren,
    L1: {}, L2: {}, L3: {}, L4: {}, L6: {},
    L5_total: 0,

    // totals-only lines (you said only totals exist on 5,7,8,9,11,16,17,18,20)
    L7_total: 0,
    L8_total: 0,
    L9_total: 0,
    L11_total: 0,
    L16_total: 0,
    L17_total: 0,
    L18_total: 0,
    L20_total: 0,

    mother: { L10: {}, L12: {}, L13: {}, L14: {}, L15: {} },
    father: { L19: {}, L21: {}, L22: {}, L23: {}, L24: {} }
  };

  const childLabels = Array.from({ length: numChildren }, (_, i) =>
    `CH${String(i + 1).padStart(2, "0")}`
  );

  // Part 1 lines 1–6 (even split per CSSD instruction if no breakdown)
  const perChildPrimary = worksheetA.primaryAllowance / numChildren;
  const perChildSupp = worksheetA.totalSupplements / numChildren;

  childLabels.forEach(ch => {
    worksheetBPart1.L1[ch] = 1;
    worksheetBPart1.L2[ch] = perChildPrimary;
    worksheetBPart1.L3[ch] = perChildSupp;
    worksheetBPart1.L4[ch] = perChildPrimary + perChildSupp;
  });

  worksheetBPart1.L5_total = childLabels.reduce((s, ch) => s + worksheetBPart1.L4[ch], 0);

  childLabels.forEach(ch => {
    worksheetBPart1.L6[ch] =
      worksheetBPart1.L5_total > 0 ? worksheetBPart1.L4[ch] / worksheetBPart1.L5_total : 0;
  });

  // Mother totals (lines 7/8/9/11 totals-only)
  worksheetBPart1.L7_total = annualM_adj;                 // use adjusted annual obligation basis
  worksheetBPart1.L8_total = mother.L20 || 0;             // SOLA total
  worksheetBPart1.L9_total = worksheetBPart1.L7_total - worksheetBPart1.L8_total;
  worksheetBPart1.L11_total = mother.L20 || 0;

  // Father totals (lines 16/17/18/20 totals-only)
  worksheetBPart1.L16_total = annualF_adj;
  worksheetBPart1.L17_total = father.L20 || 0;
  worksheetBPart1.L18_total = worksheetBPart1.L16_total - worksheetBPart1.L17_total;
  worksheetBPart1.L20_total = father.L20 || 0;

  // Per-child allocations (kept consistent with your PDF field plan)
  childLabels.forEach(ch => {
    // Mother side (10/12/13/14/15)
    worksheetBPart1.mother.L10[ch] = worksheetBPart1.L6[ch] * worksheetBPart1.L9_total;
    worksheetBPart1.mother.L12[ch] = worksheetBPart1.L11_total / numChildren;
    worksheetBPart1.mother.L13[ch] = worksheetBPart1.mother.L10[ch] + worksheetBPart1.mother.L12[ch];

    // If your Worksheet A PDF collects “expenses paid by mother”, wire it here later.
    // For now, we keep it zero so it does not distort results.
    worksheetBPart1.mother.L14[ch] = 0;

    worksheetBPart1.mother.L15[ch] = worksheetBPart1.mother.L13[ch] - worksheetBPart1.mother.L14[ch];

    // Father side (19/21/22/23/24)
    worksheetBPart1.father.L19[ch] = worksheetBPart1.L6[ch] * worksheetBPart1.L18_total;
    worksheetBPart1.father.L21[ch] = worksheetBPart1.L20_total / numChildren;
    worksheetBPart1.father.L22[ch] = worksheetBPart1.father.L19[ch] + worksheetBPart1.father.L21[ch];

    // Same comment as mother: if you collect “expenses paid by father”, wire here later.
    worksheetBPart1.father.L23[ch] = 0;

    worksheetBPart1.father.L24[ch] = worksheetBPart1.father.L22[ch] - worksheetBPart1.father.L23[ch];
  });

  // --------------------------------------------------
  // WORKSHEET B – PART 2 (per-child blocks)
  //
  // Uses your field schema:
  // B2_CH01_L1_mother, B2_CH01_L1_father, ... through L12
  //
  // IMPORTANT:
  // You currently only collect total daysA/daysB per child (no “who pays which supplement”),
  // so we keep Part 2 consistent with the per-child Part 1 base amounts.
  // --------------------------------------------------
  const worksheetBPart2 = [];

  childLabels.forEach((ch, idx) => {
    const p = parenting[idx] || { daysA: 0, daysB: 0 };
    const daysM = toNum(p.daysA);
    const daysF = toNum(p.daysB);

    const pctM = daysM / 365;
    const pctF = daysF / 365;

    // Base per-child annual amounts from Part 1 end lines
    const baseM = worksheetBPart1.mother.L15[ch];
    const baseF = worksheetBPart1.father.L24[ch];

    // Minimal consistent Part 2 structure:
    // (If you want the full official Part 2 line math, paste your exact line instructions
    // and we can map each line. Right now this will fill the fields consistently.)
    const lines = {
      L1: { mother: baseM, father: baseF },
      L2: { mother: pctM, father: pctF },
      L3: { mother: baseM * pctM, father: baseF * pctF },
      L4: { mother: baseM - baseM * pctM, father: baseF - baseF * pctF },
      L5: { mother: 0, father: 0 },
      L6: { mother: 0, father: 0 },
      L7: { mother: 0, father: 0 },
      L8: { mother: 0, father: 0 },
      L9: { mother: 0, father: 0 },
      L10:{ mother: 0, father: 0 },
      L11:{ mother: 0, father: 0 },
      L12:{ mother: (baseF - baseM) / 12, father: (baseM - baseF) / 12 }
    };

    worksheetBPart2.push({ childIndex: idx + 1, lines });
  });

  // Per-child display results based on adjusted obligations
  const perChildResults = [];
  for (let i = 0; i < numChildren; i++) {
    const p = parenting[i] || { daysA: 0, daysB: 0 };
    const annualPerChildM = annualM_adj / numChildren;
    const annualPerChildF = annualF_adj / numChildren;

    perChildResults.push({
      childIndex: i + 1,
      annualM: annualPerChildM,
      annualF: annualPerChildF,
      monthlyM: annualPerChildM / 12,
      monthlyF: annualPerChildF / 12,
      daysM: p.daysA,
      daysF: p.daysB,
    });
  }

  return {
    worksheetA,
    worksheetBPart1,
    worksheetBPart2,
    payer,
    totalMonthly,
    totalMonthlyM,
    totalMonthlyF,
    perChildResults,
  };
}
