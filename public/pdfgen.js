// public/pdfgen.js
// PDF generator for Montana Child Support Worksheets A/B/C.
// Requires template PDFs at /templates/WorksheetA-template.pdf, etc.

import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib@1.17.1";

/**
 * Safely set a text field if it exists.
 */
function safeSetText(form, name, value) {
  try {
    const field = form.getTextField(name);
    field.setText(String(value ?? ""));
  } catch (e) {
    // Field might not exist yet – that's okay for early testing.
    console.warn("Missing field in PDF template:", name);
  }
}

/**
 * Generate a combined PDF of Worksheets A/B/C and download it.
 * `calc` is the result of runMontanaChildSupport().
 * `meta` can contain parent names, etc.
 */
export async function generateWorksheets(calc, meta = {}) {
  const { parentAName = "Parent A", parentBName = "Parent B" } = meta;

  // Load Worksheet A template
  let wsADoc;
  try {
    const wsABytes = await fetch("/templates/WorksheetA-template.pdf").then(r => r.arrayBuffer());
    wsADoc = await PDFDocument.load(wsABytes);
  } catch (err) {
    console.warn("Could not load Worksheet A template:", err);
    throw err;
  }

  const formA = wsADoc.getForm();
  const wsA = calc.worksheetA;

  // Example field names – adjust to match your actual AcroForm field names
  safeSetText(formA, "A_parentA_name", parentAName);
  safeSetText(formA, "A_parentB_name", parentBName);

  safeSetText(formA, "A_L1i_mother", wsA.mother.L1i);
  safeSetText(formA, "A_L1i_father", wsA.father.L1i);
  safeSetText(formA, "A_L2l_mother", wsA.mother.L2l);
  safeSetText(formA, "A_L2l_father", wsA.father.L2l);

  safeSetText(formA, "A_L3_mother", wsA.mother.L3);
  safeSetText(formA, "A_L3_father", wsA.father.L3);
  safeSetText(formA, "A_L5_mother", wsA.mother.L5);
  safeSetText(formA, "A_L5_father", wsA.father.L5);
  safeSetText(formA, "A_L6_mother", wsA.mother.L6);
  safeSetText(formA, "A_L6_father", wsA.father.L6);
  safeSetText(formA, "A_L7_mother", wsA.mother.L7);
  safeSetText(formA, "A_L7_father", wsA.father.L7);

  safeSetText(formA, "A_primary_total", wsA.primaryTotal);
  safeSetText(formA, "A_total_supplements", wsA.totalSupp);
  safeSetText(formA, "A_total_support_need", wsA.totalAnnualSupportNeed);

  safeSetText(formA, "A_mother_sola", wsA.mother.sola);
  safeSetText(formA, "A_father_sola", wsA.father.sola);
  safeSetText(formA, "A_mother_gross_obl", wsA.mother.grossObl);
  safeSetText(formA, "A_father_gross_obl", wsA.father.grossObl);
  safeSetText(formA, "A_mother_credit", wsA.mother.credit);
  safeSetText(formA, "A_father_credit", wsA.father.credit);
  safeSetText(formA, "A_mother_annual_after_credit", wsA.mother.annualAfterCredit);
  safeSetText(formA, "A_father_annual_after_credit", wsA.father.annualAfterCredit);

  const wsAFinal = await wsADoc.save();

  // OPTIONAL: load Worksheet B and C templates here when you’ve created fields.
  // For now we only include Worksheet A in the packet.

  const finalDoc = await PDFDocument.create();

  const wsADoc2 = await PDFDocument.load(wsAFinal);
  const wsAPages = await finalDoc.copyPages(wsADoc2, wsADoc2.getPageIndices());
  wsAPages.forEach(p => finalDoc.addPage(p));

  // TODO: When ready, load and append Worksheet B and C pages:
  // const wsBBytes = await fetch("/templates/WorksheetB-template.pdf").then(r => r.arrayBuffer());
  // const wsBDoc = await PDFDocument.load(wsBBytes);
  // const wsBPages = await finalDoc.copyPages(wsBDoc, wsBDoc.getPageIndices());
  // wsBPages.forEach(p => finalDoc.addPage(p));
  //
  // const wsCBytes = await fetch("/templates/WorksheetC-template.pdf").then(r => r.arrayBuffer());
  // const wsCDoc = await PDFDocument.load(wsCBytes);
  // const wsCPages = await finalDoc.copyPages(wsCDoc, wsCDoc.getPageIndices());
  // wsCPages.forEach(p => finalDoc.addPage(p));

  const outBytes = await finalDoc.save();
  const blob = new Blob([outBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Montana-Child-Support-Worksheets.pdf";
  a.click();
  URL.revokeObjectURL(url);
}
