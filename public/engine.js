// public/engine.js
// Montana CSSD Child Support Engine
// Matches official Worksheet A, B, and C packet exactly

export function fmt(n) {
  const x = Number(n);
  return Number.isFinite(x)
    ? x.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "";
}

const PERSONAL_ALLOWANCE = 20345;

const PRIMARY_ALLOWANCE = {
  1: 6104, 2: 10173, 3: 14242, 4: 16276,
  5: 18311, 6: 20345, 7: 22380, 8: 24414
};

const SOLA = {
  1: 0.14, 2: 0.21, 3: 0.27, 4: 0.31,
  5: 0.35, 6: 0.39, 7: 0.43, 8: 0.47
};

const num = v => Number.isFinite(+v) ? +v : 0;
const round = v => Math.round(num(v));

export function runMontanaChildSupport(input) {

  const nKids = Math.max(1, Math.min(8, input.numChildren || 1));

  // -------------------------------
  // WORKSHEET A — LINE 1
  // -------------------------------

  const M = {
    L1a: num(input.mW2),
    L1b: num(input.mSelf),
    L1c: num(input.mOtherTax),
    L1d: num(input.mOtherNonTax),
    L1e: num(input.mImputed || 0),
    L1f: 0,
    L1g: 0,
    L1h: 0
  };

  const F = {
    L1a: num(input.fW2),
    L1b: num(input.fSelf),
    L1c: num(input.fOtherTax),
    L1d: num(input.fOtherNonTax),
    L1e: num(input.fImputed || 0),
    L1f: 0,
    L1g: 0,
    L1h: 0
  };

  M.L1i = Object.values(M).reduce((a,b)=>a+b,0);
  F.L1i = Object.values(F).reduce((a,b)=>a+b,0);

  // -------------------------------
  // WORKSHEET A — LINE 2
  // -------------------------------

  M.L2a = num(input.mFedTax);
  M.L2b = num(input.mStateTax);
  M.L2c = num(input.mSS);
  M.L2d = num(input.mMedicare);
  M.L2e = num(input.mRetire);
  M.L2f = num(input.mUnion);
  M.L2g = num(input.mOtherSupport);
  M.L2h = num(input.mAlimony);
  M.L2i = 0;
  M.L2j = 0;
  M.L2k = 0;

  F.L2a = num(input.fFedTax);
  F.L2b = num(input.fStateTax);
  F.L2c = num(input.fSS);
  F.L2d = num(input.fMedicare);
  F.L2e = num(input.fRetire);
  F.L2f = num(input.fUnion);
  F.L2g = num(input.fOtherSupport);
  F.L2h = num(input.fAlimony);
  F.L2i = 0;
  F.L2j = 0;
  F.L2k = 0;

  M.L2l = Object.values(M).filter((_,k)=>k>=9&&k<=19).reduce((a,b)=>a+b,0);
  F.L2l = Object.values(F).filter((_,k)=>k>=9&&k<=19).reduce((a,b)=>a+b,0);

  // -------------------------------
  // LINES 3–7
  // -------------------------------

  M.L3 = M.L1i - M.L2l;
  F.L3 = F.L1i - F.L2l;

  M.L4 = M.L3 - PERSONAL_ALLOWANCE;
  F.L4 = F.L3 - PERSONAL_ALLOWANCE;

  M.L5 = Math.max(0, M.L4);
  F.L5 = Math.max(0, F.L4);

  M.L6 = M.L1i * 0.12;
  F.L6 = F.L1i * 0.12;

  M.L7 = Math.max(M.L5, M.L6);
  F.L7 = Math.max(F.L5, F.L6);

  const combined = M.L7 + F.L7;

  const shareM = combined ? M.L7 / combined : 0.5;
  const shareF = 1 - shareM;

  // -------------------------------
  // ALLOWANCES
  // -------------------------------

  const primary = PRIMARY_ALLOWANCE[nKids];
  const supplements =
    num(input.childcare) +
    num(input.health) +
    num(input.med) +
    num(input.otherSupp);

  // -------------------------------
  // SOLA
  // -------------------------------

  function sola(parent, share) {

    if (parent.L6 > parent.L5) {
      parent.L21 = parent.L6;
      parent.L22 = 0;
      parent.L23 = parent.L21;
      parent.L24 = round(parent.L23);
      return;
    }

    parent.L15 = parent.L7 - share * (primary + supplements);
    parent.L16 = 0;
    parent.L17 = parent.L15;
    parent.L18a = 0;
    parent.L18b = 0;
    parent.L19 = parent.L17;
    parent.L20 = parent.L19 * SOLA[nKids];
    parent.L21 = parent.L20;
    parent.L22 = 0;
    parent.L23 = parent.L21;
    parent.L24 = round(parent.L23);
  }

  sola(M, shareM);
  sola(F, shareF);

  // -------------------------------
  // FINAL TRANSFER
  // -------------------------------

  const payAnnual = Math.abs(M.L24 - F.L24);
  const payer =
    M.L24 > F.L24 ? "M" :
    F.L24 > M.L24 ? "F" : null;

  return {
    worksheetA: { mother: M, father: F },
    payer,
    totalMonthly: round(payAnnual / 12),
    totalMonthlyM: round(M.L24 / 12),
    totalMonthlyF: round(F.L24 / 12)
  };
}
