// public/pdfgen.js
// Fill Montana CSSD Worksheets A + B using pdf-lib (client-side).
// - Assumes templates are located at:
//     /templates/WorksheetA-template.pdf
//     /templates/WorksheetB-template.pdf
// - Assumes engine returns:
//     calc.worksheetA { mother:{...}, father:{...}, shareMother, shareFather, ... }
//     calc.worksheetBPart1 (object)
//     calc.worksheetBPart2 (array)   [optional, but supported]
// - Fills numeric fields with rounded whole dollars by default,
//   but keeps blanks ONLY for lines CSSD says to skip (SOLA skip block).

import {
  PDFDocument,
} from "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.js";

// -----------------------------
// Helpers
// -----------------------------

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

// CSSD worksheets are generally whole-dollar values on the form
function fmtDollar(x) {
  const v = n(x);
  return Math.round(v).toLocaleString();
}

// For percent fields like line 9 shares
function fmtPct(x, decimals = 2) {
  const v = n(x) * 100;
  return `${v.toFixed(decimals)}%`;
}

function safeGetField(form, name) {
  try {
    return form.getField(name);
  } catch {
    return null;
  }
}

// Set text into a text field (if it exists)
function safeSetText(form, name, value) {
  const f = safeGetField(form, name);
  if (!f) return;
  try {
    // TextField
    if (typeof f.setText === "function") {
      f.setText(value ?? "");
      return;
    }
    // Some PDF tools create fields that still accept setText
  } catch (e) {
    console.warn("Could not set text field:", name, e);
  }
}

// Check a checkbox field (if it exists)
function safeCheck(form, name, checked = true) {
  const f = safeGetField(form, name);
  if (!f) return;
  try {
    if (typeof f.check === "function" && checked) f.check();
    if (typeof f.uncheck === "function" && !checked) f.uncheck();
  } catch (e) {
    console.warn("Could not set checkbox:", name, e);
  }
}

// Set a numeric field as dollars; optionally blank if null/undefined
function safeSetDollar(form, name, value, { blankIfNull = false } = {}) {
  if (blankIfNull && (value === null || value === undefined)) {
    safeSetText(form, name, "");
    return;
  }
  safeSetText(form, name, fmtDollar(value));
}

// Same but default to "0" if missing (for required numeric boxes)
function safeSetDollarZero(form, name, value) {
  const v = (value === null || value === undefined) ? 0 : value;
  safeSetText(form, name, fmtDollar(v));
}

// Convenience: loops CH01..CH08
function childKey(i) {
  return `CH${String(i).padStart(2, "0")}`;
}

// Merge all pages from src into dest
async function appendAllPages(destDoc, srcDoc) {
  const pages = await destDoc.copyPages(srcDoc, srcDoc.getPageIndices());
  pages.forEach(p => destDoc.addPage(p));
}

// -----------------------------
// Worksheet A filling
// -----------------------------

function fillWorksheetA(form, calc, meta) {
  const A = calc.worksheetA || {};
  const M = A.mother || {};
  const F = A.father || {};

  // Names (your template uses these)
  safeSetText(form, "A_parentA_name", meta.parentAName ?? "");
  safeSetText(form, "A_parentB_name", meta.parentBName ?? "");

  // ---- Line 1a–1i (income categories)
  // If your engine currently only provides L1i, the others will be missing.
  // We still fill them (0) so the worksheet is complete and auditable.
  const L1parts = ["L1a","L1b","L1c","L1d","L1e","L1f","L1g","L1h","L1i"];
  L1parts.forEach(k => {
    safeSetDollarZero(form, `A_${k}_mother`, M[k]);
    safeSetDollarZero(form, `A_${k}_father`, F[k]);
  });

  // ---- Line 2a–2l (deductions)
  const L2parts = ["L2a","L2b","L2c","L2d","L2e","L2f","L2g","L2h","L2i","L2j","L2k","L2l"];
  L2parts.forEach(k => {
    safeSetDollarZero(form, `A_${k}_mother`, M[k]);
    safeSetDollarZero(form, `A_${k}_father`, F[k]);
  });

  // ---- Lines 3–7 (per-parent)
  ["L3","L4","L5","L6","L7"].forEach(k => {
    safeSetDollarZero(form, `A_${k}_mother`, M[k]);
    safeSetDollarZero(form, `A_${k}_father`, F[k]);
  });

  // ---- Line 8 combined (one box)
  // Your field naming: A_L8_combined
  safeSetDollarZero(form, "A_L8_combined", A.L8);

  // ---- Line 9 shares
  // Your field naming: A_L9_mother / A_L9_father (as percent text)
  // If missing in calc, compute from line7.
  let shareM = A.shareMother;
  let shareF = A.shareFather;
  if (shareM === undefined || shareF === undefined) {
    const comb = n(M.L7) + n(F.L7);
    shareM = comb ? n(M.L7) / comb : 0.5;
    shareF = 1 - shareM;
  }
  safeSetText(form, "A_L9_mother", fmtPct(shareM, 2));
  safeSetText(form, "A_L9_father", fmtPct(shareF, 2));

  // ---- Line 10 children
  safeSetText(form, "A_L10_children", String(meta.numChildren ?? ""));

  // ---- Line 11 primary allowance
  safeSetDollarZero(form, "A_L11_allowance", A.primaryAllowance ?? A.L11_primary_allowance);

  // ---- Line 12a–12e supplements (these should be auditable)
  // If your engine doesn’t carry these, we fill from meta.
  safeSetDollarZero(form, "A_L12a_childcare", A.L12a_childcare ?? meta.childcare ?? 0);
  safeSetDollarZero(form, "A_L12b_health", A.L12b_health ?? meta.health ?? 0);
  safeSetDollarZero(form, "A_L12c_med", A.L12c_unreimbursed_med ?? meta.med ?? 0);
  safeSetDollarZero(form, "A_L12d_other", A.L12d_other ?? meta.otherSupp ?? 0);

  // Total supplements:
  const suppTotal = n(A.L12e_total ?? (meta.childcare ?? 0) + (meta.health ?? 0) + (meta.med ?? 0) + (meta.otherSupp ?? 0));
  safeSetDollarZero(form, "A_L12e_total", suppTotal);

  // ---- Line 13 total (primary + supplements)
  safeSetDollarZero(form, "A_L13_total", A.L13_total ?? (n(A.primaryAllowance ?? A.L11_primary_allowance) + suppTotal));

  // ---- SOLA / lines 15–24
  // KEY RULE: if engine marked skipped lines as null, we leave them blank.
  // Otherwise, fill them (including 0 where appropriate).
  const solaLines = ["L15","L16","L17","L18a","L18b","L19","L20","L21","L22","L23","L24"];

  const motherSkips = (M.L15 === null || M.L15 === undefined) && (M.L21 !== undefined); // heuristic
  const fatherSkips = (F.L15 === null || F.L15 === undefined) && (F.L21 !== undefined);

  solaLines.forEach(k => {
    // Mother
    if (motherSkips && ["L15","L16","L17","L18a","L18b","L19","L20"].includes(k)) {
      safeSetText(form, `A_${k}_mother`, "");
    } else {
      // For non-skip lines, if missing -> 0
      safeSetDollarZero(form, `A_${k}_mother`, M[k]);
    }

    // Father
    if (fatherSkips && ["L15","L16","L17","L18a","L18b","L19","L20"].includes(k)) {
      safeSetText(form, `A_${k}_father`, "");
    } else {
      safeSetDollarZero(form, `A_${k}_father`, F[k]);
    }
  });

  // ---- If your Worksheet A template has a final monthly transfer field:
  // You previously mentioned it was blank; field name depends on your tagging.
  // Common patterns you used earlier:
  //   A_L27_mother / A_L27_father
  // If those exist, we fill them here:
  const payMonthly = n(calc.totalMonthly);
  if (safeGetField(form, "A_L27_mother") || safeGetField(form, "A_L27_father")) {
    // Put the transfer on the payer side, 0 on the other side.
    if (calc.payer === "M") {
      safeSetDollarZero(form, "A_L27_mother", payMonthly);
      safeSetDollarZero(form, "A_L27_father", 0);
    } else if (calc.payer === "F") {
      safeSetDollarZero(form, "A_L27_mother", 0);
      safeSetDollarZero(form, "A_L27_father", payMonthly);
    } else {
      safeSetDollarZero(form, "A_L27_mother", 0);
      safeSetDollarZero(form, "A_L27_father", 0);
    }
  }
}

// -----------------------------
// Worksheet B Part 1 + Part 2 filling
// Uses the exact field names you extracted.
// -----------------------------

function fillWorksheetB(form, calc) {
  const B1 = calc.worksheetBPart1;
  const B2 = calc.worksheetBPart2;

  // If no Worksheet B was computed, do nothing (Worksheet A-only cases)
  if (!B1 && !B2) return;

  // ---- PART 1
  if (B1) {
    const nKids = B1.numChildren || 0;

    // Checkboxes for children in Part 1: B1_CH01.. etc
    for (let i = 1; i <= 8; i++) {
      const ch = childKey(i);
      const on = i <= nKids;
      // These are checkboxes in your field list: "B1_CH01" etc.
      safeCheck(form, `B1_${ch}`, on);
    }

    // Lines 1–4 and 6 are per child and totals exist separately.
    // Your field names:
    //   B1_L1_CH01, B1_L2_CH01, B1_L3_CH01, B1_L4_CH01, B1_L6_CH01
    // Mother per-child: B1_L10_CH01_mother ... B1_L15_CH01_mother
    // Father per-child: B1_L19_CH01_father ... B1_L24_CH01_father
    for (let i = 1; i <= nKids; i++) {
      const ch = childKey(i);

      // L1 is often a check/mark; your list shows B1_L1_CHxx as text fields.
      // We’ll put "1" (or "X" if you prefer). Use "1" because it remains numeric.
      safeSetText(form, `B1_L1_${ch}`, "1");

      safeSetDollarZero(form, `B1_L2_${ch}`, B1.L2?.[ch]);
      safeSetDollarZero(form, `B1_L3_${ch}`, B1.L3?.[ch]);
      safeSetDollarZero(form, `B1_L4_${ch}`, B1.L4?.[ch]);

      // L6 is a percentage text on the form; your field list shows B1_L6_CHxx.
      const pct = B1.L6?.[ch];
      safeSetText(form, `B1_L6_${ch}`, `${(n(pct) * 100).toFixed(2)}%`);

      // Mother lines 10–15 (per child)
      safeSetDollarZero(form, `B1_L10_${ch}_mother`, B1.mother?.L10?.[ch]);
      safeSetDollarZero(form, `B1_L12_${ch}_mother`, B1.mother?.L12?.[ch]);
      safeSetDollarZero(form, `B1_L13_${ch}_mother`, B1.mother?.L13?.[ch]);
      safeSetDollarZero(form, `B1_L14_${ch}_mother`, B1.mother?.L14?.[ch]);
      safeSetDollarZero(form, `B1_L15_${ch}_mother`, B1.mother?.L15?.[ch]);

      // Father lines 19, 21–24 (per child)
      safeSetDollarZero(form, `B1_L19_${ch}_father`, B1.father?.L19?.[ch]);
      safeSetDollarZero(form, `B1_L21_${ch}_father`, B1.father?.L21?.[ch]);
      safeSetDollarZero(form, `B1_L22_${ch}_father`, B1.father?.L22?.[ch]);
      safeSetDollarZero(form, `B1_L23_${ch}_father`, B1.father?.L23?.[ch]);
      safeSetDollarZero(form, `B1_L24_${ch}_father`, B1.father?.L24?.[ch]);
    }

    // Totals-only lines (these field names exist in your list)
    safeSetDollarZero(form, "B_L5_total", B1.L5_total);
    safeSetDollarZero(form, "B_L7_total", B1.L7_total);
    safeSetDollarZero(form, "B_L8_total", B1.L8_total);
    safeSetDollarZero(form, "B_L9_total", B1.L9_total);
    safeSetDollarZero(form, "B_L11_total", B1.L11_total);
    safeSetDollarZero(form, "B_L16_total", B1.L16_total);
    safeSetDollarZero(form, "B_L17_total", B1.L17_total);
    safeSetDollarZero(form, "B_L18_total", B1.L18_total);
    safeSetDollarZero(form, "B_L20_total", B1.L20_total);
  }

  // ---- PART 2 (per-child sections)
  // Your extracted field names follow:
  //   B2_CH01_L1_mother, B2_CH01_L1_father, etc.
  // Your current pdfgen stub assumes:
  //   calc.worksheetBPart2 is an array like:
  //     [{ childIndex:1, lines:{ L1:{mother, father}, L2:{mother,father}, ... } }, ...]
  if (Array.isArray(B2)) {
    for (const child of B2) {
      const idx = Number(child.childIndex);
      if (!Number.isFinite(idx) || idx < 1 || idx > 8) continue;
      const ch = childKey(idx);

      const lines = child.lines || {};
      // Write every line present in that object:
      for (const [lineKey, vals] of Object.entries(lines)) {
        const mVal = vals?.mother;
        const fVal = vals?.father;

        // Field names on PDF:
        // B2_CH01_L10_mother, B2_CH01_L10_father, etc.
        safeSetDollarZero(form, `B2_${ch}_${lineKey}_mother`, mVal);
        safeSetDollarZero(form, `B2_${ch}_${lineKey}_father`, fVal);
      }
    }
  }
}

// -----------------------------
// Main export: generates merged PDF A+B
// -----------------------------

/**
 * calc = result of runMontanaChildSupport()
 * meta = { parentAName, parentBName, numChildren, childcare, health, med, otherSupp }
 */
export async function generateWorksheets(calc, meta) {
  // Load templates
  const [aBytes, bBytes] = await Promise.all([
    fetch("/templates/WorksheetA-template.pdf").then(r => r.arrayBuffer()),
    fetch("/templates/WorksheetB-template.pdf").then(r => r.arrayBuffer()),
  ]);

  const aDoc = await PDFDocument.load(aBytes);
  const bDoc = await PDFDocument.load(bBytes);

  // Fill Worksheet A
  {
    const formA = aDoc.getForm();
    fillWorksheetA(formA, calc, meta);
    // If you want a "flattened" PDF (non-editable fields), uncomment:
    // formA.flatten();
  }

  // Fill Worksheet B
  {
    const formB = bDoc.getForm();
    fillWorksheetB(formB, calc);
    // If you want flatten:
    // formB.flatten();
  }

  // Merge into one output PDF
  const outDoc = await PDFDocument.create();
  await appendAllPages(outDoc, aDoc);
  await appendAllPages(outDoc, bDoc);

  const outBytes = await outDoc.save();

  // Trigger download
  const blob = new Blob([outBytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Montana-CSSD-Worksheets-A-B.pdf";
  link.click();
}
