const APP_CONFIG = {
  pdfScale: 2.2,
  imageMaxWidth: 1800,
  ocrLanguage: "eng",
  csvFileName: "ocr-extracted-table.csv",
};

const fileInput = document.getElementById("fileInput");
const runOcrBtn = document.getElementById("runOcrBtn");
const clearBtn = document.getElementById("clearBtn");
const copyTextBtn = document.getElementById("copyTextBtn");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const languageSelect = document.getElementById("languageSelect");
const statusText = document.getElementById("statusText");
const progressBar = document.getElementById("progressBar");
const fileName = document.getElementById("fileName");
const canvas = document.getElementById("previewCanvas");
const ocrText = document.getElementById("ocrText");
const tableBody = document.getElementById("tableBody");

const ctx = canvas.getContext("2d");
let selectedFile = null;
let extractedRows = [];

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  if (!file) return;

  selectedFile = file;
  fileName.textContent = file.name;
  runOcrBtn.disabled = true;
  downloadCsvBtn.disabled = true;
  extractedRows = [];
  renderRows([]);
  setProgress(0);
  setStatus("Rendering file preview...");

  try {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      await renderPdfFirstPage(file);
    } else if (file.type.startsWith("image/")) {
      await renderImage(file);
    } else {
      throw new Error("Unsupported file type. Please upload PDF or image.");
    }

    runOcrBtn.disabled = false;
    setStatus("Preview ready. Click Run OCR.");
  } catch (error) {
    setStatus(error.message || "Failed to load file.", true);
  }
});

runOcrBtn.addEventListener("click", runOcr);
clearBtn.addEventListener("click", clearApp);
copyTextBtn.addEventListener("click", copyRawText);
downloadCsvBtn.addEventListener("click", downloadCsv);

async function renderPdfFirstPage(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js failed to load. Check your internet connection.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: APP_CONFIG.pdfScale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;
}

async function renderImage(file) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Image failed to load."));
    image.src = imageUrl;
  });

  const ratio = Math.min(1, APP_CONFIG.imageMaxWidth / image.width);
  canvas.width = Math.round(image.width * ratio);
  canvas.height = Math.round(image.height * ratio);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(imageUrl);
}

async function runOcr() {
  if (!selectedFile) {
    setStatus("Please upload a file first.", true);
    return;
  }

  if (!window.Tesseract) {
    setStatus("Tesseract.js failed to load. Check your internet connection.", true);
    return;
  }

  runOcrBtn.disabled = true;
  downloadCsvBtn.disabled = true;
  ocrText.value = "";
  renderRows([]);
  setProgress(0);
  setStatus("Starting OCR...");

  try {
    const worker = await Tesseract.createWorker(languageSelect.value || APP_CONFIG.ocrLanguage, 1, {
      logger: (message) => {
        if (message.status) {
          const percentage = message.progress ? Math.round(message.progress * 100) : 0;
          setStatus(`${message.status} ${percentage ? `${percentage}%` : ""}`);
          setProgress(percentage);
        }
      },
    });

    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    });

    const result = await worker.recognize(canvas);
    await worker.terminate();

    const text = result.data.text || "";
    ocrText.value = text;

    extractedRows = extractInvoiceRows(text);
    renderRows(extractedRows);

    downloadCsvBtn.disabled = extractedRows.length === 0;
    setProgress(100);
    setStatus(
      extractedRows.length
        ? `OCR complete. Extracted ${extractedRows.length} table row(s).`
        : "OCR complete, but table rows were not detected. Check the raw text."
    );
  } catch (error) {
    setStatus(error.message || "OCR failed.", true);
  } finally {
    runOcrBtn.disabled = false;
  }
}

function extractInvoiceRows(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const rows = [];

  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ").trim();

    // Looks for invoice row format:
    // 1 Item name here 1 7,785.00 10.00% 7,006.50
    const rowMatch = normalized.match(
      /^(\d+)\s+(.+?)\s+(\d+)\s+([\d,]+(?:\.\d{2})?)\s+(\d+(?:\.\d{1,2})?%)\s+([\d,]+(?:\.\d{2})?)$/
    );

    if (rowMatch) {
      rows.push({
        number: rowMatch[1],
        item: rowMatch[2],
        quantity: rowMatch[3],
        unitPrice: rowMatch[4],
        discount: rowMatch[5],
        total: rowMatch[6],
      });
    }
  }

  return rows;
}

function cleanLine(line) {
  return line
    .replace(/[|]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function renderRows(rows) {
  tableBody.innerHTML = "";

  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No rows extracted yet.</td></tr>';
    return;
  }

  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(row.number)}</td>
      <td>${escapeHtml(row.item)}</td>
      <td>${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.unitPrice)}</td>
      <td>${escapeHtml(row.discount)}</td>
      <td>${escapeHtml(row.total)}</td>
    `;

    fragment.appendChild(tr);
  });

  tableBody.appendChild(fragment);
}

async function copyRawText() {
  const text = ocrText.value.trim();

  if (!text) {
    setStatus("No OCR text to copy.", true);
    return;
  }

  await navigator.clipboard.writeText(text);
  setStatus("Raw OCR text copied.");
}

function downloadCsv() {
  if (!extractedRows.length) {
    setStatus("No table rows to download.", true);
    return;
  }

  const header = ["#", "Item", "Quantity", "Unit price", "Discount", "Total"];
  const rows = extractedRows.map((row) => [
    row.number,
    row.item,
    row.quantity,
    row.unitPrice,
    row.discount,
    row.total,
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = APP_CONFIG.csvFileName;
  link.click();

  URL.revokeObjectURL(url);
  setStatus("CSV downloaded.");
}

function clearApp() {
  selectedFile = null;
  fileInput.value = "";
  fileName.textContent = "No file selected";
  runOcrBtn.disabled = true;
  downloadCsvBtn.disabled = true;
  ocrText.value = "";
  extractedRows = [];
  renderRows([]);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  setProgress(0);
  setStatus("Upload a file to start.");
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setProgress(value) {
  progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}
