// public/pdfgen.js
// Fills Montana CSSD Worksheets A and B using pdf-lib.
// Worksheets C/D/E are reference-only and intentionally not filled.

import {
  PDFDocument
} from "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.js";

// Helper: set text safely if field exists
function safeSet(form, name, value) {
  try {
    const field = form.getTextField(name);
    field.setText(value ?? "");
  } catch {
    // Silent fail is intentional – templates may differ slightly
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
 * meta = { parentAName, parentBName, numChildren }
 */
export async function generateWorksheets(calc, meta) {
  const templateBytes = await fetch("/templates/WorksheetA-template.pdf")
    .then(r => r.arrayBuffer());

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const A = calc.worksheetA;
  const M = A.mother;
  const F = A.father;

  // --------------------
  // Worksheet A
  // --------------------

  safeSet(form, "A_parentA_name", meta.parentAName);
  safeSet(form, "A_parentB_name", meta.parentBName);

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

  [
    "L15","L16","L17","L18a","L18b",
    "L19","L20","L21","L22","L23","L24"
  ].forEach(line => {
    safeSet(form, `A_${line}_mother`, M[line] == null ? "" : fmtDollar(M[line]));
    safeSet(form, `A_${line}_father`, F[line] == null ? "" : fmtDollar(F[line]));
  });

  // --------------------
  // Worksheet B – Part 1
  // --------------------

  const B1 = calc.worksheetBPart1;

  Object.keys(B1.L1).forEach(ch => {
    safeSet(form, `B_L1_${ch}`, "X");
    safeSet(form, `B_L2_${ch}`, fmtDollar(B1.L2[ch]));
    safeSet(form, `B_L3_${ch}`, fmtDollar(B1.L3[ch]));
    safeSet(form, `B_L4_${ch}`, fmtDollar(B1.L4[ch]));
    safeSet(form, `B_L6_${ch}`, (B1.L6[ch] * 100).toFixed(2) + "%");
  });

  safeSet(form, "B_L5_total", fmtDollar(B1.L5_total));
  safeSet(form, "B_L7_total", fmtDollar(B1.L7_total));
  safeSet(form, "B_L8_total", fmtDollar(B1.L8_total));
  safeSet(form, "B_L9_total", fmtDollar(B1.L9_total));
  safeSet(form, "B_L11_total", fmtDollar(B1.L11_total));
  safeSet(form, "B_L16_total", fmtDollar(B1.L16_total));
  safeSet(form, "B_L17_total", fmtDollar(B1.L17_total));
  safeSet(form, "B_L18_total", fmtDollar(B1.L18_total));
  safeSet(form, "B_L20_total", fmtDollar(B1.L20_total));

  Object.keys(B1.mother.L15).forEach(ch => {
    safeSet(form, `B_L15_${ch}_mother`, fmtDollar(B1.mother.L15[ch]));
    safeSet(form, `B_L24_${ch}_father`, fmtDollar(B1.father.L24[ch]));
  });

  // --------------------
  // Worksheet B – Part 2
  // --------------------

  calc.worksheetBPart2.forEach(child => {
    const ch = String(child.childIndex).padStart(2, "0");
    Object.entries(child.lines).forEach(([line, vals]) => {
      safeSet(form, `B2_CH${ch}_${line}_mother`, fmtDollar(vals.mother));
      safeSet(form, `B2_CH${ch}_${line}_father`, fmtDollar(vals.father));
    });
  });

  // --------------------
  // Finalize
  // --------------------

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Montana-CSSD-Worksheets-A-B.pdf";
  link.click();
}
