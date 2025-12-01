// shared/engine.js
// Montana Child Support Calculator Engine (Worksheet A + B + C)

export const PERSONAL_ALLOWANCE = 20345;

export const PRIMARY_ALLOWANCE_BY_CHILD = {
  1: 6104, 2: 10173, 3: 14242, 4: 16276,
  5: 18311, 6: 20345, 7: 22380, 8: 24414,
};

export const SOLA_FACTOR_BY_CHILD = {
  1: 0.14, 2: 0.21, 3: 0.27, 4: 0.31,
  5: 0.35, 6: 0.39, 7: 0.43, 8: 0.47,
};

export const PARENTING_CREDIT_FACTOR = 0.0069;

export function roundDollar(x) {
  return Math.round(Number(x) || 0);
}

export function fmt(x) {
  return Number(x || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function applyWorksheetC(line3, guidelineOb) {
  if (line3 <= 0) return 0;
  const min = 0.12 * line3;
  return guidelineOb < min ? min : guidelineOb;
}

// === Worksheet A (single parent) ===
export function computeWorksheetA(totalIncome, deductions, numChildren, suppTotal) {
  totalIncome = Number(totalIncome) || 0;
  deductions = Number(deductions) || 0;
  numChildren = Math.max(1, Math.min(8, numChildren || 1));
  suppTotal = Number(suppTotal) || 0;

  const primaryAllowance = PRIMARY_ALLOWANCE_BY_CHILD[numChildren];
  const solaFactor = SOLA_FACTOR_BY_CHILD[numChildren];

  const line1i = roundDollar(totalIncome);
  const line2l = roundDollar(deductions);
  const line3 = roundDollar(line1i - line2l);
  const line4 = PERSONAL_ALLOWANCE;
  const line5 = roundDollar(Math.max(0, line3 - line4));

  const line6 = line5 > 0 ? roundDollar(0.12 * line3) : 0;
  const line7 = roundDollar(Math.max(line5, line6));

  const line13_total = roundDollar(primaryAllowance + suppTotal);

  return {
    line1i, line2l, line3, line4, line5, line6, line7,
    primaryAllowance, suppTotal,
    line13_total,
    solaFactor
  };
}

// === Worksheet A combined (both parents) ===
export function completeWorksheetAForBoth(mA, fA) {
  const combined7 = mA.line7 + fA.line7 || 1;
  const shareM = mA.line7 / combined7;
  const shareF = fA.line7 / combined7;

  const line15_m = roundDollar(mA.line13_total * shareM);
  const line15_f = roundDollar(fA.line13_total * shareF);

  const line16_m = roundDollar(Math.min(line15_m, mA.line5));
  const line16_f = roundDollar(Math.min(line15_f, fA.line5));

  const line17_m = roundDollar(Math.max(0, mA.line5 - line16_m));
  const line17_f = roundDollar(Math.max(0, fA.line5 - line16_f));

  const line20_m = roundDollar(mA.solaFactor * line17_m);
  const line20_f = roundDollar(fA.solaFactor * line17_f);

  const line21_m = roundDollar(line16_m + line20_m);
  const line21_f = roundDollar(line16_f + line20_f);

  let line22_m = roundDollar(Math.max(line21_m, mA.line6));
  let line22_f = roundDollar(Math.max(line21_f, fA.line6));

  line22_m = roundDollar(applyWorksheetC(mA.line3, line22_m));
  line22_f = roundDollar(applyWorksheetC(fA.line3, line22_f));

  const line24_m = line22_m;
  const line24_f = line22_f;

  return {
    shareM, shareF,
    line15_m, line15_f,
    line16_m, line16_f,
    line17_m, line17_f,
    line20_m, line20_f,
    line21_m, line21_f,
    line22_m, line22_f,
    line24_m, line24_f
  };
}

// === Spread line 24 across kids ===
export function computePerChildObligations(line24_m, line24_f, numChildren) {
  const n = Math.max(1, numChildren);
  const perM = roundDollar(line24_m / n);
  const perF = roundDollar(line24_f / n);
  return Array.from({ length: n }, (_, i) => ({
    index: i + 1,
    mAnnual: perM,
    fAnnual: perF,
  }));
}

// === Worksheet B adjustment ===
export function computeSharedParentingTransferForChild(M, F, daysA, daysB) {
  const overA = Math.max(0, daysA - 110);
  const overB = Math.max(0, daysB - 110);

  const adjA = roundDollar(M - (PARENTING_CREDIT_FACTOR * overA * M));
  const adjB = roundDollar(F - (PARENTING_CREDIT_FACTOR * overB * F));

  const diff = roundDollar(Math.abs(adjA - adjB));
  const high = Math.max(adjA, adjB);
  const annual = Math.min(diff, high);

  let payer = 'NONE';
  if (adjA > adjB) payer = 'A';
  else if (adjB > adjA) payer = 'B';

  return { annual, payer };
}

// === High-level engine ===
export function runMontanaChildSupport(inputs) {
  const {
    mIncome, mDed,
    fIncome, fDed,
    numChildren,
    supplements,
    parenting
  } = inputs;

  const suppTotal =
    (supplements.childcare || 0) +
    (supplements.health || 0) +
    (supplements.med || 0) +
    (supplements.other || 0);

  const mA = computeWorksheetA(mIncome, mDed, numChildren, suppTotal);
  const fA = computeWorksheetA(fIncome, fDed, numChildren, suppTotal);

  mA.line13_total = mA.primaryAllowance + mA.suppTotal;
  fA.line13_total = fA.primaryAllowance + fA.suppTotal;

  const A = completeWorksheetAForBoth(mA, fA);

  const children = computePerChildObligations(A.line24_m, A.line24_f, numChildren);

  // Determine if Worksheet B applies
  const anyShared = parenting.some(p => p.daysA > 110 && p.daysB > 110);

  let totalAnnual = 0;
  let perChildResults = [];

  if (anyShared) {
    // Worksheet B
    perChildResults = children.map((c, i) => {
      const p = parenting[i];
      if (p.daysA > 110 && p.daysB > 110) {
        const res = computeSharedParentingTransferForChild(
          c.mAnnual, c.fAnnual, p.daysA, p.daysB
        );
        totalAnnual += res.annual;
        return {
          child: c.index,
          type: "shared",
          annual: res.annual,
          payer: res.payer,
          daysA: p.daysA, daysB: p.daysB
        };
      } else {
        return {
          child: c.index,
          type: "primary",
          annual: 0,
          payer: "NONE",
          daysA: p.daysA, daysB: p.daysB
        };
      }
    });
  } else {
    // Primary residence
    const line24_diff = Math.abs(A.line24_m - A.line24_f);
    totalAnnual = line24_diff;
    const payer = A.line24_m > A.line24_f ? 'A' : 'B';

    perChildResults = children.map(c => ({
      child: c.index,
      type: "primary",
      annual: roundDollar(totalAnnual / numChildren),
      payer,
      daysA: parenting[0].daysA,
      daysB: parenting[0].daysB
    }));
  }

  return {
    mA, fA, A,
    perChildResults,
    totalAnnual,
    totalMonthly: roundDollar(totalAnnual / 12)
  };
}
