// public/pdfgen.js
// Fills Worksheet A template using PDF-LIB.
// Worksheets B/C will be added after engine finalization.

import {
  PDFDocument,
  StandardFonts,
  rgb
} from "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.js";

// Helper to safely set text without crashing if a field is missing
function safeSet(form, name, value) {
  try {
    const field = form.getTextField(name);
    field.setText(value ?? "");
  } catch (e) {
    console.warn("Missing PDF field:", name);
  }
}

function fmtDollar(x) {
  const n = Number(x);
  return Number.isFinite(n)
    ? Math.round(n).toLocaleString()
    : "";
}

/**
 * calc = result of runMontanaChildSupport()
 * meta = { parentAName, parentBName, numChildren, childcare, health, med, otherSupp }
 */
export async function generateWorksheets(calc, meta) {
  // Load Worksheet A template
  const url = "/templates/WorksheetA-template.pdf";
  const templateBytes = await fetch(url).then(r => r.arrayBuffer());

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const A = calc.worksheetA;
  const M = A.mother;
  const F = A.father;

  // --- Parent names ---
  safeSet(form, "A_parentA_name", meta.parentAName);
  safeSet(form, "A_parentB_name", meta.parentBName);

  // --- Lines 1i – 13 ---
  safeSet(form, "A_L1i_mother", fmtDollar(M.L1i));
  safeSet(form, "A_L1i_father", fmtDollar(F.L1i));

  safeSet(form, "A_L2l_mother", fmtDollar(M.L2l));
  safeSet(form, "A_L2l_father", fmtDollar(F.L2l));

  safeSet(form, "A_L3_mother", fmtDollar(M.L3));
  safeSet(form, "A_L3_father", fmtDollar(F.L3));

  safeSet(form, "A_L4_mother", fmtDollar(M.L4));
  safeSet(form, "A_L4_father", fmtDollar(F.L4));

  safeSet(form, "A_L5_mother", fmtDollar(M.L5));
  safeSet(form, "A_L5_father", fmtDollar(F.L5));

  safeSet(form, "A_L6_mother", fmtDollar(M.L6));
  safeSet(form, "A_L6_father", fmtDollar(F.L6));

  safeSet(form, "A_L7_mother", fmtDollar(M.L7));
  safeSet(form, "A_L7_father", fmtDollar(F.L7));

  safeSet(form, "A_L8_combined", fmtDollar(A.L8));

  safeSet(form, "A_L9_mother", (A.shareMother * 100).toFixed(1) + "%");
  safeSet(form, "A_L9_father", (A.shareFather * 100).toFixed(1) + "%");

  safeSet(form, "A_L10_children", String(meta.numChildren));

  safeSet(form, "A_L11_allowance", fmtDollar(A.primaryAllowance));

  safeSet(form, "A_L12a_childcare", fmtDollar(A.L12a_childcare));
  safeSet(form, "A_L12b_health", fmtDollar(A.L12b_health));
  safeSet(form, "A_L12c_med", fmtDollar(A.L12c_unreimbursed_med));
  safeSet(form, "A_L12d_other", fmtDollar(A.L12d_other));
  safeSet(form, "A_L12e_total", fmtDollar(A.L12e_total));

  safeSet(form, "A_L13_total", fmtDollar(A.L13_total));

  // --- SOLA lines 15–24 ---
  const MFIELDS = [
    "L15", "L16", "L17",
    "L18a", "L18b",
    "L19", "L20", "L21",
    "L22", "L23", "L24"
  ];

  MFIELDS.forEach(line => {
    safeSet(form, `A_${line}_mother`, M[line] == null ? "" : fmtDollar(M[line]));
    safeSet(form, `A_${line}_father`, F[line] == null ? "" : fmtDollar(F[line]));
  });

  // --- Finalize PDF ---
  const pdfBytes = await pdfDoc.save();

  // Trigger download
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Montana-Worksheet-A.pdf";
  link.click();
}
