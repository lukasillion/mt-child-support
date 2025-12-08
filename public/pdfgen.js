// public/pdfgen.js
// Fills Montana CSSD Worksheet A using results from runMontanaChildSupport.
// Assumes a fillable PDF template at /templates/WorksheetA-template.pdf
// with field names like A_L1i_mother, A_L2l_father, etc.

import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib@1.17.1";

function safeSetText(form, name, value) {
  try {
    const field = form.getTextField(name);
    field.setText(
      value === undefined || value === null || Number.isNaN(value)
        ? ""
        : String(value)
    );
  } catch (e) {
    console.warn("Missing field in Worksheet A template:", name);
  }
}

// simple formatter for dollars
function fmtDollar(x) {
  const n = Number.isFinite(+x) ? +x : 0;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * calc: result of runMontanaChildSupport(...)
 * meta: {
 *   parentAName: string,
 *   parentBName: string,
 *   numChildren: number,
 *   supplements: { childcare, health, med, other }
 * }
 */
export async function generateWorksheets(calc, meta = {}) {
  const {
    parentAName = "Parent A",
    parentBName = "Parent B",
    numChildren = 1,
    supplements = {},
  } = meta;

  // For now we treat Parent A as "mother" and Parent B as "father" on the CSSD form.
  // Later we can add a role selector (Mother/Father/Other) and remap accordingly.
  const wsA = calc.worksheetA || {};
  const mother = wsA.mother || {};
  const father = wsA.father || {};

  // Derive combined / share values if not already stored
  const L7_mother = Number(mother.L7 || 0);
  const L7_father = Number(father.L7 || 0);
  const L7_combined = L7_mother + L7_father;

  const shareM =
    typeof mother.share === "number" && !Number.isNaN(mother.share)
      ? mother.share
      : L7_combined > 0
      ? L7_mother / L7_combined
      : 0.5;

  const shareF =
    typeof father.share === "number" && !Number.isNaN(father.share)
      ? father.share
      : 1 - shareM;

  const childrenCount =
    numChildren || (Array.isArray(calc.perChildResults) ? calc.perChildResults.length : 1);

  const primaryAllowance = wsA.primaryTotal ?? wsA.primaryAllowance ?? 0;
  const suppChildcare = supplements.childcare || 0;
  const suppHealth = supplements.health || 0;
  const suppMed = supplements.med || 0;
  const suppOther = supplements.other || 0;
  const suppTotal =
    wsA.totalSupp ||
    suppChildcare + suppHealth + suppMed + suppOther;

  const totalSupportNeed =
    wsA.totalAnnualSupportNeed ||
    primaryAllowance + suppTotal + (mother.sola || 0) + (father.sola || 0);

  // Decide who is payer for line 27
  const payer = calc.payer; // "M" or "F" or null
  const monthlyTransfer = calc.totalMonthly || 0;

  let L27_mother = "";
  let L27_father = "";
  if (payer === "M") {
    L27_mother = fmtDollar(monthlyTransfer);
  } else if (payer === "F") {
    L27_father = fmtDollar(monthlyTransfer);
  }

  // Load Worksheet A template PDF
  const wsABytes = await fetch("/templates/WorksheetA-template.pdf").then((r) =>
    r.arrayBuffer()
  );
  const wsADoc = await PDFDocument.load(wsABytes);
  const formA = wsADoc.getForm();

  // --- HEADER / NAMES ---
  safeSetText(formA, "A_parent_mother_name", parentAName);
  safeSetText(formA, "A_parent_father_name", parentBName);

  // --- TOTAL INCOME & DEDUCTIONS (lines 1i, 2l) ---
  safeSetText(formA, "A_L1i_mother", fmtDollar(mother.L1i));
  safeSetText(formA, "A_L1i_father", fmtDollar(father.L1i));
  safeSetText(formA, "A_L2l_mother", fmtDollar(mother.L2l));
  safeSetText(formA, "A_L2l_father", fmtDollar(father.L2l));

  // --- LINES 3–7 ---
  safeSetText(formA, "A_L3_mother", fmtDollar(mother.L3));
  safeSetText(formA, "A_L3_father", fmtDollar(father.L3));
  safeSetText(formA, "A_L4_mother", fmtDollar(mother.L4));
  safeSetText(formA, "A_L4_father", fmtDollar(father.L4));
  safeSetText(formA, "A_L5_mother", fmtDollar(mother.L5));
  safeSetText(formA, "A_L5_father", fmtDollar(father.L5));
  safeSetText(formA, "A_L6_mother", fmtDollar(mother.L6));
  safeSetText(formA, "A_L6_father", fmtDollar(father.L6));
  safeSetText(formA, "A_L7_mother", fmtDollar(mother.L7));
  safeSetText(formA, "A_L7_father", fmtDollar(father.L7));

  // --- LINE 8: combined L7 ---
  safeSetText(formA, "A_L8_combined", fmtDollar(L7_combined));

  // --- LINE 9: shares (percentages) ---
  safeSetText(formA, "A_share_mother", (shareM * 100).toFixed(1));
  safeSetText(formA, "A_share_father", (shareF * 100).toFixed(1));

  // --- LINE 10: number of children ---
  safeSetText(formA, "A_L10_children", String(childrenCount));

  // --- LINE 11: primary allowance ---
  safeSetText(formA, "A_L11_primary_allowance", fmtDollar(primaryAllowance));

  // --- LINE 12: supplements ---
  safeSetText(formA, "A_L12a_childcare", fmtDollar(suppChildcare));
  safeSetText(formA, "A_L12b_health", fmtDollar(suppHealth));
  safeSetText(formA, "A_L12c_unreimbursed_med", fmtDollar(suppMed));
  safeSetText(formA, "A_L12d_other", fmtDollar(suppOther));
  safeSetText(formA, "A_L12e_total", fmtDollar(suppTotal));

  // --- LINE 13: primary + supplements ---
  safeSetText(formA, "A_L13_total", fmtDollar(primaryAllowance + suppTotal));

  // --- OPTIONAL: total support need, if you made that field ---
  safeSetText(formA, "A_total_support_need", fmtDollar(totalSupportNeed));

  // --- LINES 21–24 (we map our consolidated annualAfterCredit here if available) ---
  // Note: our engine compresses SOLA steps, so we do NOT try to fill 15–20 exactly.
  // We only populate the final annual obligations if the engine provides them.
  if (mother.annualAfterCredit != null) {
    safeSetText(formA, "A_L21_mother", fmtDollar(mother.annualAfterCredit));
  }
  if (father.annualAfterCredit != null) {
    safeSetText(formA, "A_L21_father", fmtDollar(father.annualAfterCredit));
  }

  // If you want, you can also mirror annualAfterCredit into L24 fields:
  safeSetText(formA, "A_L24_mother", fmtDollar(mother.annualAfterCredit));
  safeSetText(formA, "A_L24_father", fmtDollar(father.annualAfterCredit));

  // --- LINE 27: Monthly transfer obligation ---
  safeSetText(formA, "A_L27_mother", L27_mother);
  safeSetText(formA, "A_L27_father", L27_father);

  // (You can add preparer name/date here later if you like)
  // safeSetText(formA, "A_L28_preparer_name", "Montana Child Support Estimator");
  // safeSetText(formA, "A_L28_preparer_date", new Date().toLocaleDateString());

  // Save and prompt download
  const filledBytes = await wsADoc.save();
  const blob = new Blob([filledBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "WorksheetA-Montana-Child-Support.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
