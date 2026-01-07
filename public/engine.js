// public/engine.js
// Core Montana Child Support engine for the wizard + Worksheet A.
//
// - Tracks Worksheet A lines 1a–1h, 1i, 2a–2l, 3–13, 15–24, and 27
// - Uses the same input shape index.html already passes
// - Still approximates sub-lines where the wizard doesn’t collect data

// Formatter reused by UI
export function fmt(n) {
  const num = Number.isFinite(+n) ? +n : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

// Core constants – from CSSD tables (Policy 404.2, current as of packet)
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

function roundDollar(x) {
  return Math.round(toNum(x));
}

// Worksheet C minimum-support helper (WS-C table)
function worksheetCMinimum(line3) {
  const L3 = toNum(line3);
  if (L3 <= 0) return 0;

  const ratio = L3 / PERSONAL_ALLOWANCE;
  let factor = 0;

  if (ratio <= 0.25) factor = 0.0;
  else if (ratio <= 0.31) factor = 0.01;
  else if (ratio <= 0.38) factor = 0.02;
  else if (ratio <= 0.45) factor = 0.03;
  else if (ratio <= 0.52) factor = 0.04;
  else if (ratio <= 0.59) factor = 0.05;
  else if (ratio <= 0.66) factor = 0.06;
  else if (ratio <= 0.73) factor = 0.07;
  else if (ratio <= 0.80) factor = 0.08;
  else if (ratio <= 0.87) factor = 0.09;
  else if (ratio <= 0.94) factor = 0.10;
  else factor = 0.11;

  return roundDollar(L3 * factor);
}

/**
 * Main engine entry point.
 *
 * input = {
 *   grossMother,
 *   grossFather,
 *   otherSupportMother, // ordered child support for other children (WS-A 2a)
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
  const grossMother = toNum(input.grossMother); // this will be WS-A 1i for mother
  const grossFather = toNum(input.grossFather);

  const otherSupportMother = toNum(input.otherSupportMother); // WS-A 2a
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

  const worksheetA = {
    primaryAllowance,
    totalSupplements,
  };

  const mother = {};
  const father = {};
  worksheetA.mother = mother;
  worksheetA.father = father;

  // -------------------------
  // WS-A PART 1: INCOME (1a–1h, 1i)
  // -------------------------
  // For now, treat entire gross as wages (1a) and other sub-lines as 0.
  // This keeps totals correct and avoids blanks, but does not try to
  // reconstruct exact income mix without more wizard inputs.

  // Mother income
  mother.L1a = grossMother;
  mother.L1b = 0;
  mother.L1c = 0;
  mother.L1d = 0;
  mother.L1e = 0; // imputed – not collected yet
  mother.L1f = 0; // EITC – not collected yet
  mother.L1g = 0;
  mother.L1h = 0;
  mother.L1i =
    mother.L1a +
    mother.L1b +
    mother.L1c +
    mother.L1d +
    mother.L1e +
    mother.L1f +
    mother.L1g +
    mother.L1h;

  // Father income
  father.L1a = grossFather;
  father.L1b = 0;
  father.L1c = 0;
  father.L1d = 0;
  father.L1e = 0;
  father.L1f = 0;
  father.L1g = 0;
  father.L1h = 0;
  father.L1i =
    father.L1a +
    father.L1b +
    father.L1c +
    father.L1d +
    father.L1e +
    father.L1f +
    father.L1g +
    father.L1h;

  // -------------------------
  // WS-A PART 1: DEDUCTIONS (2a–2l) – limited to 2a for now
  // -------------------------

  // Mother: only 2a (other children support) is modeled; all others 0.
  mother.L2a = otherSupportMother;
  mother.L2b = 0;
  mother.L2c = 0;
  mother.L2d = 0;
  mother.L2e = 0;
  mother.L2f = 0;
  mother.L2g = 0;
  mother.L2h = 0;
  mother.L2i = 0;
  mother.L2j = 0;
  mother.L2k = 0;
  mother.L2l =
    mother.L2a +
    mother.L2b +
    mother.L2c +
    mother.L2d +
    mother.L2e +
    mother.L2f +
    mother.L2g +
    mother.L2h +
    mother.L2i +
    mother.L2j +
    mother.L2k;

  // Father
  father.L2a = otherSupportFather;
  father.L2b = 0;
  father.L2c = 0;
  father.L2d = 0;
  father.L2e = 0;
  father.L2f = 0;
  father.L2g = 0;
  father.L2h = 0;
  father.L2i = 0;
  father.L2j = 0;
  father.L2k = 0;
  father.L2l =
    father.L2a +
    father.L2b +
    father.L2c +
    father.L2d +
    father.L2e +
    father.L2f +
    father.L2g +
    father.L2h +
    father.L2i +
    father.L2j +
    father.L2k;

  worksheetA.L2l_mother = mother.L2l;
  worksheetA.L2l_father = father.L2l;

  // -------------------------
  // Lines 3–7: income after deductions, personal allowance, minimums
  // -------------------------

  // 3: income after deductions
  mother.L3 = mother.L1i - mother.L2l;
  father.L3 = father.L1i - father.L2l;

  // 4: personal allowance (from table 1)
  mother.L4 = PERSONAL_ALLOWANCE;
  father.L4 = PERSONAL_ALLOWANCE;

  // 5: income available (3 – 4, floor at 0)
  mother.L5 = Math.max(0, mother.L3 - mother.L4);
  father.L5 = Math.max(0, father.L3 - father.L4);

  // 6: minimum support – WS-C if L5 <= 0, else 12% of line 3
  if (mother.L5 <= 0) {
    mother.L6 = worksheetCMinimum(mother.L3);
  } else {
    mother.L6 = roundDollar(mother.L3 * 0.12);
  }

  if (father.L5 <= 0) {
    father.L6 = worksheetCMinimum(father.L3);
  } else {
    father.L6 = roundDollar(father.L3 * 0.12);
  }

  // 7: higher of lines 5 & 6
  mother.L7 = Math.max(mother.L5, mother.L6);
  father.L7 = Math.max(father.L5, father.L6);

  // Combined line 7 & shares
  const L7_combined = mother.L7 + father.L7;
  worksheetA.L7_combined = L7_combined;
  worksheetA.L8 = L7_combined; // line 8: combined income available

  const shareMother = L7_combined > 0 ? mother.L7 / L7_combined : 0.5;
  const shareFather = 1 - shareMother;

  worksheetA.shareMother = shareMother;
  worksheetA.shareFather = shareFather;

  worksheetA.L9_mother = shareMother;
  worksheetA.L9_father = shareFather;

  // -------------------------
  // Lines 10–13: children, primary allowance, supplements
  // -------------------------

  worksheetA.L10_children = numChildren;
  worksheetA.L11_primary_allowance = primaryAllowance;

  worksheetA.L12a_childcare = childcare;
  worksheetA.L12b_health = health;
  worksheetA.L12c_unreimbursed_med = med;
  worksheetA.L12d_other = otherSupp;
  worksheetA.L12e_total = totalSupplements;

  worksheetA.L13_total = primaryAllowance + totalSupplements;

  // -------------------------
  // Lines 15–24: SOLA (WS-A Part 2)
  // -------------------------

  function computeSOLA(parent, share) {
    const out = {};

    // Check line 14 condition: if line 6 > line 5, skip to 21 and use line 6.
    const skipSola = parent.L6 > parent.L5;

    if (skipSola) {
      out.L15 = null;
      out.L16 = null;
      out.L17 = 0;
      out.L18a = 0;
      out.L18b = 0;
      out.L19 = 0;
      out.L20 = 0;

      out.L21 = parent.L6;
      out.L22 = Math.max(out.L21, parent.L6); // still compare to line 6
      out.L23 = 0; // credit for expenses paid – not modeled yet
      out.L24 = roundDollar(Math.max(0, out.L22 - out.L23));
      return out;
    }

    // 15: parent share of total (line 13 x line 9)
    out.L15 = worksheetA.L13_total * share;

    // 16: lower of line 15 and line 5
    out.L16 = Math.min(out.L15, parent.L5);

    // 17: income available for SOLA
    out.L17 = Math.max(0, parent.L5 - out.L16);

    // 18a/18b: WS-D & other – currently 0, can be wired later
    out.L18a = 0;
    out.L18b = 0;

    // 19: adjusted income for SOLA
    out.L19 = Math.max(0, out.L17 - (out.L18a + out.L18b));

    // 20: SOLA amount (WS-E)
    out.L20 = roundDollar(out.L19 * solaFactor);

    // 21: add line 16 and line 20
    out.L21 = out.L16 + out.L20;

    // 22: gross annual child support – higher of line 21 and line 6
    out.L22 = Math.max(out.L21, parent.L6);

    // 23: credit for expenses paid – we don’t know payer mix yet
    out.L23 = 0;

    // 24: annual support per parent
    out.L24 = roundDollar(Math.max(0, out.L22 - out.L23));

    return out;
  }

  const solaM = computeSOLA(mother, shareMother);
  const solaF = computeSOLA(father, shareFather);

  Object.assign(mother, solaM);
  Object.assign(father, solaF);

  // -------------------------
  // Totals, transfer, per-child breakdown, line 27
  // -------------------------

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
  const totalMonthlyM = roundDollar(annualM / 12);
  const totalMonthlyF = roundDollar(annualF / 12);

  // Line 27: final monthly transfer, in column of paying parent
  worksheetA.L27_mother = payer === "M" ? totalMonthly : 0;
  worksheetA.L27_father = payer === "F" ? totalMonthly : 0;

  // Per-child breakdown (simple split; WS-B shared-parenting refinements
  // happen in Worksheet B logic, not here)
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

  return {
    worksheetA,
    payer,
    totalMonthly,
    totalMonthlyM,
    totalMonthlyF,
    perChildResults,
  };
}
