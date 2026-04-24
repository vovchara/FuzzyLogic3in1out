import { jsPDF } from "jspdf";
import { t } from "../i18n";
import type { FuzzyEvaluation, FuzzySystem, FuzzyVariable } from "../fuzzy/types";

interface ExportArgs {
  system: FuzzySystem;
  inputs: Readonly<Record<string, number>>;
  evaluation: FuzzyEvaluation;
}

export async function exportResultPdf({ system, inputs, evaluation }: ExportArgs): Promise<void> {
  const div = document.createElement("div");
  div.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:720px",
    "padding:40px",
    "background:#fff",
    "color:#0f172a",
    'font:14px/1.45 ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  ].join(";");
  div.innerHTML = buildResultHtml(system, inputs, evaluation);
  document.body.appendChild(div);
  try {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    await renderDomToPdf(doc, div);
    doc.save(`${system.id}-result-${Date.now()}.pdf`);
  } finally {
    div.remove();
  }
}

export async function exportFormulasPdf(system: FuzzySystem, sourceEl: HTMLElement): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  await renderDomToPdf(doc, sourceEl);
  doc.save(`${system.id}-formulas.pdf`);
}

async function renderDomToPdf(doc: jsPDF, source: HTMLElement): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(source, { backgroundColor: "#ffffff", scale: 2 });
  const img = canvas.toDataURL("image/png");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 30;
  const imgW = pageWidth - margin * 2;
  const imgH = imgW * (canvas.height / canvas.width);
  const printable = pageHeight - margin * 2;
  if (imgH <= printable) {
    doc.addImage(img, "PNG", margin, margin, imgW, imgH);
    return;
  }
  let offsetY = 0;
  while (offsetY < imgH) {
    doc.addImage(img, "PNG", margin, margin - offsetY, imgW, imgH);
    offsetY += printable;
    if (offsetY < imgH) doc.addPage();
  }
}

function buildResultHtml(
  system: FuzzySystem,
  inputs: Readonly<Record<string, number>>,
  evaluation: FuzzyEvaluation,
): string {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const outputTerm = system.output.terms.find((x) => x.id === evaluation.mostActiveTerm);
  const outputColor = outputTerm?.color ?? "#0f172a";
  const allVars: FuzzyVariable[] = [...system.inputs, system.output];

  const inputsRows = system.inputs
    .map(
      (v) => `
    <tr>
      <td style="padding:4px 16px 4px 0;color:#475569">${esc(t(v.nameKey))}</td>
      <td style="padding:4px 0;font-family:ui-monospace,monospace;font-weight:600;text-align:right">${(inputs[v.id] ?? 0).toFixed(2)}</td>
    </tr>`,
    )
    .join("");

  const membershipCols = allVars
    .map((v) => {
      const ms = evaluation.memberships[v.id] ?? {};
      const rows = v.terms
        .map((term) => {
          const value = ms[term.id] ?? 0;
          const active = value > 0.1 && isMaxInObject(ms, term.id);
          return `
          <tr${active ? ' style="background:#f1f5f9"' : ""}>
            <td style="padding:2px 8px 2px 0">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${term.color};margin-right:6px;vertical-align:middle"></span>
              <span style="color:#334155">${esc(t(term.nameKey))}</span>
            </td>
            <td style="padding:2px 0;font-family:ui-monospace,monospace;font-size:12px;text-align:right;color:#0f172a;font-weight:${active ? "600" : "400"}">${value.toFixed(3)}</td>
          </tr>`;
        })
        .join("");
      return `
      <div>
        <div style="font-size:11px;font-weight:600;color:#0f172a;margin-bottom:6px">
          <span style="font-family:ui-monospace,monospace;color:#94a3b8">${esc(v.id)}</span>
          — ${esc(t(v.nameKey))}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">${rows}</table>
      </div>`;
    })
    .join("");

  const H2 =
    "font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin:0 0 10px 0";

  return `
    <h1 style="font-size:22px;font-weight:700;margin:0 0 4px 0;color:#0f172a">${esc(t(system.nameKey))}</h1>
    <p style="color:#64748b;font-size:11px;margin:0 0 28px 0">${esc(t("pdf.generatedAt"))}: ${now}</p>

    <h2 style="${H2}">${esc(t("pdf.inputs"))}</h2>
    <table style="margin-bottom:24px;border-collapse:collapse">${inputsRows}</table>

    <h2 style="${H2}">${esc(t("pdf.result"))}</h2>
    <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:4px">
      <span style="color:#64748b;font-size:12px">${esc(t(system.output.nameKey))}</span>
      <span style="font-size:28px;font-weight:700;color:${outputColor};font-family:ui-monospace,monospace">${evaluation.output.toFixed(2)}</span>
      <span style="color:#94a3b8;font-size:12px">/ ${system.output.range[1]}</span>
    </div>
    <div style="margin-bottom:28px">
      <span style="color:#64748b;font-size:12px">${esc(t("output.mostActive"))}:</span>
      <span style="color:${outputColor};font-weight:600;margin-left:6px">${outputTerm ? esc(t(outputTerm.nameKey)) : "—"}</span>
    </div>

    <h2 style="${H2}">${esc(t("pdf.memberships"))}</h2>
    <div style="display:grid;grid-template-columns:repeat(${allVars.length},1fr);gap:20px">${membershipCols}</div>
  `;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function isMaxInObject(ms: Readonly<Record<string, number>>, key: string): boolean {
  const target = ms[key] ?? 0;
  for (const v of Object.values(ms)) if (v > target) return false;
  return true;
}
