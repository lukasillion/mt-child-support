// shared/engine.js
// Core engine for Montana child support, annualized + CSSD-style rounding.

// --- Rounding helpers (CSSD instructions: .49 down, .50 up, round as you go) ---
// See CSSD packet: "ANNUALIZE all entries unless otherwise instructed, & ROUND all cents to dollars"
// (If $0.49 or less, round down; if $0.50 or more, round up).

export function r0(x) {
  return Math.round(Number.isFinite(+x) ? +x : 0);
}

export function r2(x) {
  const n = Number.isFinite(+x) ? +x : 0;
  return Math.round(n * 100) / 100;
}

// Format for display
export function fmt(x) {
  const n = Number.isFinite(+x) ? +x : 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// --- Guideline constants (you can adjust these if CSSD tables change) ---

// Personal allowance (per parent, annual) – from CSSD table 1.
const PERSONAL_ALLOWANCE = 20345;

// Primary child support allowance by number of children (annual, total for case).
// These should match the current CSSD schedule (Table 2).
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

// SOLA factor by number of children – % of income used for SOLA.
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

// Credit factor in Worksheet B (parenting time adjustment)
const CREDIT_FACTOR = 0.0069;

// Worksheet C – minimum support bands (ratio = line 3 / line 4)
const MIN_SUPPORT_BANDS = [
  { min: 0.0,   max: 0.25, mult: 0.00 },
  { min: 0.251, max: 0.31, mult: 0.01 },
  { min: 0.311, max: 0.38, mult: 0.02 },
  { min: 0.381, max: 0.45, mult: 0.03 },
  { min: 0.451, max: 0.52, mult: 0.04 },
  { min: 0.521, max: 0.59, mult: 0.05 },
  { min: 0.591, max: 0.66, mult: 0.06 },
  { min: 0.661, max: 0.73, mult: 0.07 },
  { min: 0.731, max: 0.80, mult: 0.08 },
  { min: 0.801, max: 0.87, mult: 0.09 },
  { min: 0.871, max: 0.94, mult: 0.10 },
  { min: 0.941, max: 1.00, mult: 0.11 },
];

// --- Worksheet C: minimum support for a single parent ---

function computeWorksheetC(line3, line4) {
  const L3 = r0(line3);
  const L4 = r0(line4);
  const ratio = L4 === 0 ? 0 : (L3 / L4);

  let mult = 0.0;
  for (const band of MIN_SUPPORT_BANDS) {
    if (ratio >= band.min && ratio <= band.max) {
      mult = band.mult;
      break;
    }
  }
  const minSupport = r0(L3 * mult);
  return { ratio, mult, minSupport };
}

// --- Worksheet A: compute lines for one parent (without primary/supplement split yet) ---

function computeWorksheetAPart1(grossAnnual, deductionsAnnual) {
  const L1i = r0(grossAnnual);          // total income
  const L2l = r0(deductionsAnnual);     // total allowable deductions
  const L3  = r0(L1i - L2l);            // income after deductions

  const L4  = PERSONAL_ALLOWANCE;
  const L5  = r0(Math.max(0, L3 - L4)); // income available for child support

  // Line 6: if L5 == 0, we use Worksheet C; otherwise 12% of line 3
  let L6;
  let wsC = null;
  if (L5 <= 0) {
    wsC = computeWorksheetC(L3, L4);
    L6 = wsC.minSupport;
  } else {
    L6 = r0(0.12 * L3);
  }

  const L7 = r0(Math.max(L5, L6));      // line 7 = greater of 5 and 6

  return {
    L1i, L2l, L3, L4, L5, L6, L7,
    wsC, // may be null if not needed
  };
}

// --- Worksheet B, Part 2, for ONE child (using per-child obligations) ---

function computeWorksheetBPart2ForChild(mAnnualObl, fAnnualObl, daysM, daysF) {
  const L1_M = r0(mAnnualObl);
  const L1_F = r0(fAnnualObl);

  const L2_M = daysM;
  const L2_F = daysF;

  const M_over110 = L2_M > 110;
  const F_over110 = L2_F > 110;
  const bothOver110 = M_over110 && F_over110;

  // If not both parents over 110 days, guideline lets the lower-time parent pay base obligation.
  if (!bothOver110) {
    if (L2_M > L2_F) {
      // Mother has more time; father pays his full obligation
      return {
        line12_M: 0,
        line12_F: L1_F,
      };
    } else if (L2_F > L2_M) {
      // Father has more time; mother pays full obligation
      return {
        line12_M: L1_M,
        line12_F: 0,
      };
    } else {
      // Equal days but both <= 110 – treat as neither getting cred factor; pick higher obligation
      if (L1_M > L1_F) {
        return { line12_M: L1_M - L1_F, line12_F: 0 };
      } else if (L1_F > L1_M) {
        return { line12_M: 0, line12_F: L1_F - L1_M };
      } else {
        return { line12_M: 0, line12_F: 0 };
      }
    }
  }

  // Both parents over 110 days → do full credit calculation
  const L4_M = 110;
  const L4_F = 110;
  const L5_M = Math.max(0, L2_M - L4_M);
  const L5_F = Math.max(0, L2_F - L4_F);

  const L6_M = CREDIT_FACTOR;
  const L6_F = CREDIT_FACTOR;

  const L7_M = L6_M * L5_M;
  const L7_F = L6_F * L5_F;

  const L8_M = r0(L7_M * L1_M);
  const L8_F = r0(L7_F * L1_F);

  const L9_M = r0(L1_M - L8_M);
  const L9_F = r0(L1_F - L8_F);

  const diff = Math.abs(L9_M - L9_F);
  let L10_M = 0, L10_F = 0;
  if (L9_M > L9_F) L10_M = diff;
  if (L9_F > L9_M) L10_F = diff;

  const L11_M = Math.min(L10_M, L1_M);
  const L11_F = Math.min(L10_F, L1_F);

  const L12_M = L11_M;
  const L12_F = L11_F;

  return {
    line12_M: L12_M,
    line12_F: L12_F,
  };
}

// --- Main: runMontanaChildSupport ---
// This keeps the same shape you’ve already been using in your wizards.

export function runMontanaChildSupport(params) {
  const {
    mIncome = 0, // "mother" or Parent A – annual gross
    mDed = 0,    // A deductions (taxes, mandatory retirement, etc.)
    fIncome = 0, // "father" or Parent B – annual gross
    fDed = 0,    // B deductions
    numChildren = 1,
    supplements = { childcare: 0, health: 0, med: 0, other: 0 },
    parenting = [], // [{ daysA, daysB }] length == numChildren
  } = params || {};

  const kids = Math.max(1, Math.min(8, numChildren || 1));

  const totalSupp =
    (supplements.childcare || 0) +
    (supplements.health || 0) +
    (supplements.med || 0) +
    (supplements.other || 0);

  // Worksheet A Part 1 for each parent
  const mA1 = computeWorksheetAPart1(mIncome, mDed);
  const fA1 = computeWorksheetAPart1(fIncome, fDed);

  const combinedL7 = r0(mA1.L7 + fA1.L7);

  let shareM = 0.5;
  let shareF = 0.5;
  if (combinedL7 > 0) {
    shareM = mA1.L7 / combinedL7;
    shareF = fA1.L7 / combinedL7;
  }

  // Primary allowance and supplements split by share
  const primaryTotal = PRIMARY_ALLOWANCE_BY_CHILD[kids] || PRIMARY_ALLOWANCE_BY_CHILD[8];
  const solaFactor = SOLA_FACTOR_BY_CHILD[kids] || SOLA_FACTOR_BY_CHILD[8];

  const mPrimaryShare = r0(shareM * primaryTotal);
  const fPrimaryShare = r0(shareF * primaryTotal);

  const mSuppShare = r0(shareM * totalSupp);
  const fSuppShare = r0(shareF * totalSupp);

  // Income left for SOLA
  const mIncomeForSola = r0(Math.max(0, mA1.L5 - mPrimaryShare - mSuppShare));
  const fIncomeForSola = r0(Math.max(0, fA1.L5 - fPrimaryShare - fSuppShare));

  const mSOLA = r0(mIncomeForSola * solaFactor);
  const fSOLA = r0(fIncomeForSola * solaFactor);

  const totalAnnualSupportNeed = r0(primaryTotal + totalSupp + mSOLA + fSOLA);

  const mGrossObl = r0(shareM * totalAnnualSupportNeed);
  const fGrossObl = r0(shareF * totalAnnualSupportNeed);

  // Credit for expenses paid directly (childcare/health/med/other by share)
  const mCredit = mSuppShare;
  const fCredit = fSuppShare;

  const mAnnualAfterCredit = r0(Math.max(0, mGrossObl - mCredit));
  const fAnnualAfterCredit = r0(Math.max(0, fGrossObl - fCredit));

  // --- Per-child obligations and Worksheet B parenting adjustment ---

  // For now we assume each child has equal share of obligation.
  const mPerChildBase = mAnnualAfterCredit / kids;
  const fPerChildBase = fAnnualAfterCredit / kids;

  const perChildResults = [];
  let sumAnnualM = 0;
  let sumAnnualF = 0;

  for (let i = 0; i < kids; i++) {
    const sched = parenting[i] || parenting[0] || { daysA: 255, daysB: 110 };
    const daysM = sched.daysA;
    const daysF = sched.daysB;

    const b2 = computeWorksheetBPart2ForChild(mPerChildBase, fPerChildBase, daysM, daysF);

    const childAnnualM = r0(b2.line12_M);
    const childAnnualF = r0(b2.line12_F);

    sumAnnualM += childAnnualM;
    sumAnnualF += childAnnualF;

    perChildResults.push({
      childIndex: i + 1,
      annualM: childAnnualM,
      annualF: childAnnualF,
      monthlyM: r2(childAnnualM / 12),
      monthlyF: r2(childAnnualF / 12),
      daysM,
      daysF,
    });
  }

  const totalAnnualM = r0(sumAnnualM);
  const totalAnnualF = r0(sumAnnualF);

  const totalMonthlyM = r2(totalAnnualM / 12);
  const totalMonthlyF = r2(totalAnnualF / 12);

  // Final transfer: higher monthly minus lower monthly
  let payer = null;
  let annualTransfer = 0;
  let monthlyTransfer = 0;

  if (totalMonthlyM > totalMonthlyF) {
    payer = "M";
    monthlyTransfer = totalMonthlyM - totalMonthlyF;
  } else if (totalMonthlyF > totalMonthlyM) {
    payer = "F";
    monthlyTransfer = totalMonthlyF - totalMonthlyM;
  } else {
    payer = null;
    monthlyTransfer = 0;
  }

  annualTransfer = r0(monthlyTransfer * 12);
  monthlyTransfer = r2(monthlyTransfer);

  return {
    // Summary
    payer,                 // "M", "F", or null
    totalAnnual: annualTransfer,
    totalMonthly: monthlyTransfer,

    // Per parent totals (sum of per-child)
    totalAnnualM,
    totalAnnualF,
    totalMonthlyM,
    totalMonthlyF,

    // Per child breakdown
    perChildResults,

    // Useful worksheet-like pieces if you want to debug or fill PDFs later
    worksheetA: {
      mother: {
        ...mA1,
        share: shareM,
        primaryShare: mPrimaryShare,
        suppShare: mSuppShare,
        incomeForSola: mIncomeForSola,
        sola: mSOLA,
        grossObl: mGrossObl,
        credit: mCredit,
        annualAfterCredit: mAnnualAfterCredit,
      },
      father: {
        ...fA1,
        share: shareF,
        primaryShare: fPrimaryShare,
        suppShare: fSuppShare,
        incomeForSola: fIncomeForSola,
        sola: fSOLA,
        grossObl: fGrossObl,
        credit: fCredit,
        annualAfterCredit: fAnnualAfterCredit,
      },
      primaryTotal,
      totalSupp,
      totalAnnualSupportNeed,
    },
  };
}
