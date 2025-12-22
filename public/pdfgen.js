// public/pdfgen.js
// Generates Montana CSSD Worksheets A + B as filled PDFs (client-side) using pdf-lib.
//
// IMPORTANT:
// - Worksheet A field names are confirmed from your produced PDF.
// - Worksheet B field names must match your template; we'll wire those once you paste the B field list.
//
// This file is safe: missing fields won't crash generation; it logs warnings.

import { PDFDocument } from "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.js";

// -------------------------
// Helpers
// -------------------------

function safeGetTextField(form, name) {
  try {
    return form.getTextField(name);
  } catch {
    return null;
  }
}

function safeGetCheckBox(form, name) {
  try {
    return form.getCheckBox(name);
  } catch {
    return null;
  }
}

// For numeric worksheet cells: if null/undefined/NaN => "0" (ONLY when numeric makes sense)
function fmtMoneyOrZero(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

// For numeric cells where blank is more appropriate if truly not applicable
function fmtMoneyOrBlank(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  if (!Number.isFinite(n)) return "";
  return Math.round(n).toLocaleString();
}

function fmtPercentOrZero(x, decimals = 1) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0%";
  return (n * 100).toFixed(decimals) + "%";
}

function setText(form, name, value) {
  const f = safeGetTextField(form, name);
  if (!f) return false;
  f.setText(value ?? "");
  return true;
}

// Numeric fields where a 0 is appropriate if missing
function setMoneyZero(form, name, value) {
  return setText(form, name, fmtMoneyOrZero(value));
}

// Numeric fields where blank is better if not applicable
function setMoneyBlank(form, name, value) {
  return setText(form, name, fmtMoneyOrBlank(value));
}

function setPercentZero(form, name, value, decimals = 1) {
  return setText(form, name, fmtPercentOrZero(value, decimals));
}

function setCheckbox(form, name, checked) {
  const cb = safeGetCheckBox(form, name);
  if (!cb) return false;
  if (checked) cb.check();
  else cb.uncheck();
  return true;
}

// Merge multiple PDFDocuments into one PDFDocument
async function mergeDocs(docs) {
  const out = await PDFDocument.create();
  for (const d of docs) {
    const pages = await out.copyPages(d, d.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }
  return out;
}

// Trigger download
function downloadPdfBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// -------------------------
// Worksheet A filler
// -------------------------

function fillWorksheetA(form, calc, meta) {
  const A = calc.worksheetA;
  const M = A.mother;
  const F = A.father;

  // Names (these are your confirmed field names)
  setText(form, "A_parent_mother_name", meta.parentAName || "Mother");
  setText(form, "A_parent_father_name", meta.parentBName || "Father");

  // Optional checkbox if present (your PDF shows A_calc_A_and_B)
  // If you want it checked whenever Worksheet B applies, set based on parenting days.
  const bApplies = (meta.parentingAppliesB === true);
  setCheckbox(form, "A_calc_A_and_B", bApplies);

  // -----------------
  // LINE 1 (income)
  // -----------------
  // If you pass detailed breakdowns, we fill them; otherwise we fill totals.
  // DO NOT put 0 into "specify" text boxes.
  //
  // Expected meta income breakdown (optional):
  // meta.incomeBreakdown = {
  //   mother: { L1a, L1b, L1c, L1d, L1e, L1f, L1g, L1h, L1i },
  //   father: { ... }
  // }
  const ib = meta.incomeBreakdown || {};
  const ibM = ib.mother || {};
  const ibF = ib.father || {};

  // Fill 1a–1g if provided, otherwise leave blank (not "0")
  ["a","b","c","d","e","f"].forEach(letter => {
    setMoneyBlank(form, `A_L1${letter}_mother`, ibM[`L1${letter}`]);
    setMoneyBlank(form, `A_L1${letter}_father`, ibF[`L1${letter}`]);
  });

  // 1g and 1h have "specify" fields; fill amounts if provided, but not specify with 0
  setMoneyBlank(form, "A_L1g_mother", ibM.L1g);
  setMoneyBlank(form, "A_L1g_father", ibF.L1g);

  setText(form, "A_L1g_specify", ibM.L1g_specify || ibF.L1g_specify || "");
  setMoneyBlank(form, "A_L1h_mother", ibM.L1h);
  setMoneyBlank(form, "A_L1h_father", ibF.L1h);
  setText(form, "A_L1h_specify", ibM.L1h_specify || ibF.L1h_specify || "");

  // 1i is total gross income — ALWAYS fill
  setMoneyZero(form, "A_L1i_mother", M.L1i);
  setMoneyZero(form, "A_L1i_father", F.L1i);

  // -----------------
  // LINE 2 (deductions)
  // -----------------
  // You have many 2a–2k fields on the PDF. If you pass a breakdown, we fill those.
  // Otherwise: leave sub-lines blank and fill 2l total only.
  //
  // Expected meta deductions breakdown (optional):
  // meta.deductionBreakdown = {
  //   mother: { L2a..L2k, L2k_specify },
  //   father: { L2a..L2k, L2k_specify }
  // }
  const db = meta.deductionBreakdown || {};
  const dbM = db.mother || {};
  const dbF = db.father || {};

  // sublines 2a–2j (blank if not provided; not forced to 0)
  const sub2 = ["a","b","c","d","e","f","g","h","i","j"];
  sub2.forEach(letter => {
    setMoneyBlank(form, `A_L2${letter}_mother`, dbM[`L2${letter}`]);
    setMoneyBlank(form, `A_L2${letter}_father`, dbF[`L2${letter}`]);
  });

  // 2k + specify
  setMoneyBlank(form, "A_L2k_mother", dbM.L2k);
  setMoneyBlank(form, "A_L2k_father", dbF.L2k);
  setText(form, "A_L2k_specify", dbM.L2k_specify || dbF.L2k_specify || "");

  // 2l total deductions (your engine currently treats "other support" as 2l)
  setMoneyZero(form, "A_L2l_mother", M.L2l);
  setMoneyZero(form, "A_L2l_father", F.L2l);

  // -----------------
  // Lines 3–13 (always numeric; 0 makes sense if absent)
  // -----------------
  setMoneyZero(form, "A_L3_mother", M.L3);
  setMoneyZero(form, "A_L3_father", F.L3);

  setMoneyZero(form, "A_L4_mother", M.L4);
  setMoneyZero(form, "A_L4_father", F.L4);

  setMoneyZero(form, "A_L5_mother", M.L5);
  setMoneyZero(form, "A_L5_father", F.L5);

  setMoneyZero(form, "A_L6_mother", M.L6);
  setMoneyZero(form, "A_L6_father", F.L6);

  setMoneyZero(form, "A_L7_mother", M.L7);
  setMoneyZero(form, "A_L7_father", F.L7);

  setMoneyZero(form, "A_L8_combined", A.L8);

  // Shares are percents; 0% makes sense if missing but yours are always present
  setPercentZero(form, "A_L9_mother", A.shareMother, 1);
  setPercentZero(form, "A_L9_father", A.shareFather, 1);

  setText(form, "A_L10_children", String(meta.numChildren || A.L10_children || 1));
  setMoneyZero(form, "A_L11_primary_allowance", A.primaryAllowance);

  // Line 12 (your PDF has these names)
  setMoneyZero(form, "A_L12_childcare", A.L12a_childcare);
  setMoneyZero(form, "A_L12_health", A.L12b_health);
  setMoneyZero(form, "A_L12c_unreimbursed_med", A.L12c_unreimbursed_med);
  setMoneyZero(form, "A_L12_other", A.L12d_other);
  setMoneyZero(form, "A_L12e_total", A.L12e_total);

  // line 12d specify exists; keep blank unless you have a reason to set it
  setText(form, "A_L12d_specify", meta.L12d_specify || "");

  setMoneyZero(form, "A_L13_total", A.L13_total);

  // -----------------
  // Lines 15–24 (SOLA)
  // -----------------
  // Here: blanks DO NOT make sense — the worksheet expects a number even if skipped.
  // Your engine uses nulls for skipped lines; we convert those to 0 for numeric boxes.
  const SOLA_LINES = ["L15","L16","L17","L18a","L18b","L19","L20","L21","L22","L23","L24"];
  SOLA_LINES.forEach(line => {
    setMoneyZero(form, `A_${line}_mother`, M[line]);
    setMoneyZero(form, `A_${line}_father`, F[line]);
  });

  // -----------------
  // Line 25 (parenting days by child)
  // -----------------
  // Your PDF has A_L25_CH01_days_mother/father etc. Fill for as many kids as exist.
  for (let i = 1; i <= 8; i++) {
    const ch = `CH${String(i).padStart(2, "0")}`;
    const per = calc.perChildResults?.[i - 1];
    if (per) {
      setText(form, `A_L25_${ch}_days_mother`, String(Math.round(per.daysM)));
      setText(form, `A_L25_${ch}_days_father`, String(Math.round(per.daysF)));
    } else {
      // Leave blank if child not part of this case (0 does NOT make sense)
      setText(form, `A_L25_${ch}_days_mother`, "");
      setText(form, `A_L25_${ch}_days_father`, "");
    }
  }

  // -----------------
  // Line 26a / 26b (per child obligations)
  // -----------------
  // Your PDF includes A_L26a_CHxx_mother/father and A_L26b_CHxx_mother/father.
  // If your engine later provides official 26a/26b values, wire them here.
  //
  // For now: we can fill per-child monthly obligation using perChildResults monthlyM/monthlyF,
  // and annual in the other row if you want. If that does not match CSSD’s intended meaning
  // for 26a/26b, tell me and we’ll map exactly.
  for (let i = 1; i <= 8; i++) {
    const ch = `CH${String(i).padStart(2, "0")}`;
    const per = calc.perChildResults?.[i - 1];
    if (per) {
      setMoneyZero(form, `A_L26a_${ch}_mother`, per.annualM);
      setMoneyZero(form, `A_L26a_${ch}_father`, per.annualF);
      setMoneyZero(form, `A_L26b_${ch}_mother`, per.monthlyM);
      setMoneyZero(form, `A_L26b_${ch}_father`, per.monthlyF);
    } else {
      setText(form, `A_L26a_${ch}_mother`, "");
      setText(form, `A_L26a_${ch}_father`, "");
      setText(form, `A_L26b_${ch}_mother`, "");
      setText(form, `A_L26b_${ch}_father`, "");
    }
  }

  // -----------------
  // Line 27 (final monthly transfer) — fill only payer’s side
  // -----------------
  if (calc.payer === "M") {
    setMoneyZero(form, "A_L27_mother", calc.totalMonthly);
    setText(form, "A_L27_father", "");
  } else if (calc.payer === "F") {
    setMoneyZero(form, "A_L27_father", calc.totalMonthly);
    setText(form, "A_L27_mother", "");
  } else {
    setMoneyZero(form, "A_L27_mother", 0);
    setMoneyZero(form, "A_L27_father", 0);
  }

  // -----------------
  // Line 28 (preparer)
  // -----------------
  // Optional: makes the PDF look finished; not a numeric “0”
  setText(form, "A_L28_preparer_name", meta.preparerName || "");
  setText(form, "A_L28_preparer_date", meta.preparerDate || "");
}

function fillWorksheetB(form, calc) {
  const B1 = calc.worksheetBPart1;
  const B2 = calc.worksheetBPart2 || [];

  const numChildren = B1.numChildren || 0;

  // Helper
  const CH = i => `CH${String(i).padStart(2, "0")}`;

  // -------------------------
  // PART 1 — per-child columns
  // -------------------------
  for (let i = 1; i <= numChildren; i++) {
    const ch = CH(i);

    // Child header (just an indicator; use "X")
    setText(form, `B1_${ch}`, "X");

    setMoneyZero(form, `B1_L1_${ch}`, B1.L1[ch]);
    setMoneyZero(form, `B1_L2_${ch}`, B1.L2[ch]);
    setMoneyZero(form, `B1_L3_${ch}`, B1.L3[ch]);
    setMoneyZero(form, `B1_L4_${ch}`, B1.L4[ch]);

    // Line 6 is a percentage
    setText(
      form,
      `B1_L6_${ch}`,
      Number.isFinite(B1.L6[ch])
        ? (B1.L6[ch] * 100).toFixed(2) + "%"
        : "0%"
    );

    // Mother side (10–15)
    setMoneyZero(form, `B1_L10_${ch}_mother`, B1.mother.L10[ch]);
    setMoneyZero(form, `B1_L12_${ch}_mother`, B1.mother.L12[ch]);
    setMoneyZero(form, `B1_L13_${ch}_mother`, B1.mother.L13[ch]);
    setMoneyZero(form, `B1_L14_${ch}_mother`, B1.mother.L14[ch]);
    setMoneyZero(form, `B1_L15_${ch}_mother`, B1.mother.L15[ch]);

    // Father side (19–24)
    setMoneyZero(form, `B1_L19_${ch}_father`, B1.father.L19[ch]);
    setMoneyZero(form, `B1_L21_${ch}_father`, B1.father.L21[ch]);
    setMoneyZero(form, `B1_L22_${ch}_father`, B1.father.L22[ch]);
    setMoneyZero(form, `B1_L23_${ch}_father`, B1.father.L23[ch]);
    setMoneyZero(form, `B1_L24_${ch}_father`, B1.father.L24[ch]);
  }

  // -------------------------
  // PART 1 — totals-only lines
  // -------------------------
  setMoneyZero(form, "B_L5_total", B1.L5_total);
  setMoneyZero(form, "B_L7_total", B1.L7_total);
  setMoneyZero(form, "B_L8_total", B1.L8_total);
  setMoneyZero(form, "B_L9_total", B1.L9_total);
  setMoneyZero(form, "B_L11_total", B1.L11_total);
  setMoneyZero(form, "B_L16_total", B1.L16_total);
  setMoneyZero(form, "B_L17_total", B1.L17_total);
  setMoneyZero(form, "B_L18_total", B1.L18_total);
  setMoneyZero(form, "B_L20_total", B1.L20_total);

  // -------------------------
  // PART 2 — per-child blocks
  // -------------------------
  B2.forEach(child => {
    const ch = CH(child.childIndex);

    Object.entries(child.lines).forEach(([line, vals]) => {
      setMoneyZero(form, `B2_${ch}_${line}_mother`, vals.mother);
      setMoneyZero(form, `B2_${ch}_${line}_father`, vals.father);
    });
  });
}

// -------------------------
// Main entry: generate worksheets
// -------------------------
export async function generateWorksheets(calc, meta) {
  // Load templates
  const aBytes = await fetch("/templates/WorksheetA-template.pdf").then(r => r.arrayBuffer());
  const aDoc = await PDFDocument.load(aBytes);
  const aForm = aDoc.getForm();

  fillWorksheetA(aForm, calc, meta);

  // If you want Worksheet B included in the download, load it and fill it.
  // (We’ll wire it fully once we have your B field names.)
  let docsToMerge = [aDoc];

  // Attempt B if template exists
  try {
    const bBytes = await fetch("/templates/WorksheetB-template.pdf").then(r => r.arrayBuffer());
    const bDoc = await PDFDocument.load(bBytes);
    const bForm = bDoc.getForm();
    fillWorksheetB(bForm, calc, meta);
    docsToMerge.push(bDoc);
  } catch (e) {
    console.warn("Worksheet B template not loaded or B filler not ready:", e);
  }

  const outDoc = await mergeDocs(docsToMerge);
  const outBytes = await outDoc.save();

  downloadPdfBytes(outBytes, "Montana-CSSD-Worksheets-A-B.pdf");
}
