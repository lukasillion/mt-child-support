// public/engine.js
// Core Montana Child Support engine for the wizard + Worksheet A.
// - Tracks Worksheet A lines 1–24 explicitly (including SOLA 15–23)
// - Returns shape expected by index.html and pdfgen.js

// Simple formatter used by the UI
export function fmt(n) {
  const num = Number.isFinite(+n) ? +n : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

// Core constants – same as your earlier estimator
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

// helpers
function toNum(x) {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(x, min, max) {
  const n = parseInt(x, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function roundDollar(x) {
  return Math.round(toNum(x));
}

/**
 * Main engine entry point.
 *
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

  // --- LINES 1–2: totals (we’re aggregating W-2 style inputs already in the wizard) ---

  // Line 1i: total gross income
  mother.L1i = grossMother;
  father.L1i = grossFather;

  // Line 2l: total deductions counted as “other support paid”
  // (you can expand this later to track 2a–2k explicitly)
  mother.L2l = otherSupportMother;
  father.L2l = otherSupportFather;

  // --- LINES 3–7: available income and minimum support ---

  // Line 3: income after deductions
  mother.L3 = mother.L1i - mother.L2l;
  father.L3 = father.L1i - father.L2l;

  // Line 4: subtract personal allowance
  mother.L4 = mother.L3 - PERSONAL_ALLOWANCE;
  father.L4 = father.L3 - PERSONAL_ALLOWANCE;

  // Line 5: income available for support (no minimum floor yet)
  mother.L5 = Math.max(0, mother.L4);
  father.L5 = Math.max(0, father.L4);

  // Line 6: minimum 12% of gross
  mother.L6 = grossMother * 0.12;
  father.L6 = grossFather * 0.12;

  // Line 7: greater of line 5 or line 6
  mother.L7 = Math.max(mother.L5, mother.L6);
  father.L7 = Math.max(father.L5, father.L6);

  // Combined line 7 & shares
  const L7_combined = mother.L7 + father.L7;
  worksheetA.L7_combined = L7_combined;

  const shareMother = L7_combined > 0 ? mother.L7 / L7_combined : 0.5;
  const shareFather = 1 - shareMother;

  worksheetA.shareMother = shareMother;
  worksheetA.shareFather = shareFather;

  // Line 8: combined available income
  worksheetA.L8 = L7_combined;

  // Line 9: share of combined (percent, used only for display)
  worksheetA.L9_mother = shareMother;
  worksheetA.L9_father = shareFather;

  // Line 10: # children
  worksheetA.L10_children = numChildren;

  // Line 11: primary allowance
  worksheetA.L11_primary_allowance = primaryAllowance;

  // Line 12: supplements
  worksheetA.L12a_childcare = childcare;
  worksheetA.L12b_health = health;
  worksheetA.L12c_unreimbursed_med = med;
  worksheetA.L12d_other = otherSupp;
  worksheetA.L12e_total = totalSupplements;

  // Line 13: total primary + supplements
  worksheetA.L13_total = primaryAllowance + totalSupplements;

  worksheetA.primaryAllowance = primaryAllowance;
  worksheetA.totalSupplements = totalSupplements;

  // --- SOLA SECTION (LINES 15–23) ---

  function computeSOLA(parent, share) {
    const out = {};

    // CSSD rule: if line 6 > line 5, skip 15–20 and use line 6 as line 21.
    const skipSOLA = parent.L6 > parent.L5;

    if (skipSOLA) {
      out.L15 = null;
      out.L16 = null;
      out.L17 = null;
      out.L18a = null;
      out.L18b = null;
      out.L19 = null;
      out.L20 = null;

      out.L21 = parent.L6; // “enter line 6 amount”
      out.L22 = 0;         // no additional credits modeled yet
      out.L23 = out.L21 - out.L22;

      // Line 24: annual obligation (we’ll round to nearest dollar for line 24)
      out.L24 = roundDollar(out.L23);
      return out;
    }

    // Line 15: line 7 minus share of primary allowance and supplements
    out.L15 = parent.L7 - share * primaryAllowance - share * totalSupplements;

    // Line 16: pre-SOLA credits (0 for now; can be expanded later)
    out.L16 = 0;

    // Line 17
    out.L17 = out.L15 - out.L16;

    // Line 18a/18b: additional adjustments (0 for now)
    out.L18a = 0;
    out.L18b = 0;

    // Line 19
    out.L19 = out.L17 - (out.L18a + out.L18b);

    // Line 20: SOLA = adjusted income × SOLA factor
    out.L20 = out.L19 * solaFactor;

    // Line 21: because we’re not skipping SOLA, equals line 20
    out.L21 = out.L20;

    // Line 22: post-SOLA credits (0 for now)
    out.L22 = 0;

    // Line 23
    out.L23 = out.L21 - out.L22;

    // Line 24: annual obligation (rounded to nearest dollar for worksheet)
    out.L24 = roundDollar(out.L23);

    return out;
  }

  const solaM = computeSOLA(mother, shareMother);
  const solaF = computeSOLA(father, shareFather);

  Object.assign(mother, solaM);
  Object.assign(father, solaF);

  worksheetA.mother = mother;
  worksheetA.father = father;

  // Total annual support sums + who pays whom
  const annualM = mother.L24 || 0;
  const annualF = father.L24 || 0;

  worksheetA.totalSupportAnnual = annualM + annualF;

  let payer = null;
  let payAnnual = 0;

  if (annualM > annualF) {
    payer = "M";
    payAnnual = annualM - annualF;
  } else if (annualF > annualM) {
    payer = "F";
    payAnnual = annualF - annualM;
  } else {
    payer = null;
    payAnnual = 0;
  }

  const totalMonthly = roundDollar(payAnnual / 12);

  // Each parent’s own total monthly guideline obligation
  const totalMonthlyM = roundDollar(annualM / 12);
  const totalMonthlyF = roundDollar(annualF / 12);

  // Basic per-child breakdown (for display; not driving the worksheet math)
  const perChildResults = [];
  for (let i = 0; i < numChildren; i++) {
    const p = parenting[i] || { daysA: 0, daysB: 0 };
    const annualPerChildM = annualM / numChildren;
    const annualPerChildF = annualF / numChildren;

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
  // --------------------------------------------------
// INTERNAL WORKSHEET C ADJUSTMENT (OTHER CHILDREN)
// --------------------------------------------------

// These come from your wizard inputs
// (you already collect these)
const motherOtherSupport = mOtherSupport || 0;
const fatherOtherSupport = fOtherSupport || 0;

// Adjust the obligations used downstream
const adjustedMotherL24 = Math.max(
  0,
  worksheetA.mother.L24 - motherOtherSupport
);

const adjustedFatherL24 = Math.max(
  0,
  worksheetA.father.L24 - fatherOtherSupport
);

// IMPORTANT:
// Override ONLY for downstream use (Worksheet B + final transfer)
worksheetA.mother.adjustedL24 = adjustedMotherL24;
worksheetA.father.adjustedL24 = adjustedFatherL24;

// --------------------------------------------------
// WORKSHEET B – PART 1 (Shared Parenting Allocation)
// --------------------------------------------------
const worksheetBPart1 = {
  numChildren,
  L1: {}, L2: {}, L3: {}, L4: {}, L6: {},
  L5_total: 0,

  // totals-only lines
  L7_total: 0,
  L8_total: 0,
  L9_total: 0,
  L11_total: 0,
  L16_total: 0,
  L17_total: 0,
  L18_total: 0,
  L20_total: 0,

  mother: {
    L10: {}, L12: {}, L13: {}, L14: {}, L15: {}
  },
  father: {
    L19: {}, L21: {}, L22: {}, L23: {}, L24: {}
  }
};

const childLabels = Array.from({ length: numChildren }, (_, i) =>
  `CH${String(i + 1).padStart(2, "0")}`
);

// ---- Lines 1–4 ----
const perChildPrimary = worksheetA.primaryAllowance / numChildren;
const perChildSupp = worksheetA.totalSupplements / numChildren;

childLabels.forEach(ch => {
  worksheetBPart1.L1[ch] = 1;
  worksheetBPart1.L2[ch] = perChildPrimary;
  worksheetBPart1.L3[ch] = perChildSupp;
  worksheetBPart1.L4[ch] = perChildPrimary + perChildSupp;
});

// ---- Line 5 (total only) ----
worksheetBPart1.L5_total = childLabels.reduce(
  (s, ch) => s + worksheetBPart1.L4[ch], 0
);

// ---- Line 6 ----
childLabels.forEach(ch => {
  worksheetBPart1.L6[ch] =
    worksheetBPart1.L5_total > 0
      ? worksheetBPart1.L4[ch] / worksheetBPart1.L5_total
      : 0;
});

// ---- Mother side (7–15) ----
worksheetBPart1.L7_total = worksheetA.mother.L22;
worksheetBPart1.L8_total = worksheetA.mother.L20;
worksheetBPart1.L9_total = worksheetBPart1.L7_total - worksheetBPart1.L8_total;
worksheetBPart1.L11_total = worksheetA.mother.L20;

childLabels.forEach(ch => {
  worksheetBPart1.mother.L10[ch] =
    worksheetBPart1.L6[ch] * worksheetBPart1.L9_total;

  worksheetBPart1.mother.L12[ch] =
    worksheetBPart1.L11_total / numChildren;

  worksheetBPart1.mother.L13[ch] =
    worksheetBPart1.mother.L10[ch] +
    worksheetBPart1.mother.L12[ch];

  worksheetBPart1.mother.L14[ch] =
    worksheetA.mother.L23 / numChildren;

  worksheetBPart1.mother.L15[ch] =
    worksheetBPart1.mother.L13[ch] -
    worksheetBPart1.mother.L14[ch];
});

// ---- Father side (16–24) ----
worksheetBPart1.L16_total = worksheetA.father.L22;
worksheetBPart1.L17_total = worksheetA.father.L20;
worksheetBPart1.L18_total = worksheetBPart1.L16_total - worksheetBPart1.L17_total;
worksheetBPart1.L20_total = worksheetA.father.L20;

childLabels.forEach(ch => {
  worksheetBPart1.father.L19[ch] =
    worksheetBPart1.L6[ch] * worksheetBPart1.L18_total;

  worksheetBPart1.father.L21[ch] =
    worksheetBPart1.L20_total / numChildren;

  worksheetBPart1.father.L22[ch] =
    worksheetBPart1.father.L19[ch] +
    worksheetBPart1.father.L21[ch];

  worksheetBPart1.father.L23[ch] =
    worksheetA.father.L23 / numChildren;

  worksheetBPart1.father.L24[ch] =
    worksheetBPart1.father.L22[ch] -
    worksheetBPart1.father.L23[ch];
});

  return {
    worksheetA,
    payer,
    totalMonthly,
    totalMonthlyM,
    totalMonthlyF,
    perChildResults,
  };
}
