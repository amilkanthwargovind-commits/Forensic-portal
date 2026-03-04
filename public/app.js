const form = document.getElementById('intel-form');
const reportViewer = document.getElementById('report-viewer');
const rawViewer = document.getElementById('raw-viewer');
const rawOutput = document.getElementById('raw-output');
const downloadBtn = document.getElementById('download-pdf');
const copyBtn = document.getElementById('copy-report');
const rawBtn = document.getElementById('toggle-raw');
const statusWrap = document.getElementById('pipeline-status');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');

let latestReportText = '';

const stages = [
  'Normalizing entity details',
  'Collecting sanctions and watchlist data',
  'Collecting corporate registry data',
  'Collecting media and OSINT signals',
  'Assessing domain and cyber indicators',
  'Scoring risk and drafting narrative',
  'Rendering final report',
];

function setProgress(index) {
  const pct = Math.min(100, Math.round(((index + 1) / stages.length) * 100));
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = stages[index] || 'Completed';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const companyName = document.getElementById('companyName').value.trim();
  const country = document.getElementById('country').value.trim();
  const website = document.getElementById('website').value.trim();

  if (!companyName) return;

  statusWrap.classList.remove('hidden');
  reportViewer.innerHTML = '<p class="text-slate-300">Intelligence pipeline running...</p>';
  downloadBtn.disabled = true;
  copyBtn.disabled = true;
  rawBtn.disabled = true;

  const ticker = setInterval(() => {
    const current = Number(progressFill.style.width.replace('%', ''));
    const approxStage = Math.min(stages.length - 1, Math.floor((current / 100) * stages.length));
    setProgress(approxStage);
  }, 600);

  try {
    stages.forEach((_, i) => setTimeout(() => setProgress(i), i * 500));

    const response = await fetch('/api/intelligence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, country, website }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unknown error');

    clearInterval(ticker);
    setProgress(stages.length);

    reportViewer.innerHTML = data.report.html;
    rawOutput.textContent = JSON.stringify(data.intel, null, 2);
    latestReportText = reportViewer.innerText;

    downloadBtn.disabled = false;
    copyBtn.disabled = false;
    rawBtn.disabled = false;
  } catch (error) {
    clearInterval(ticker);
    reportViewer.innerHTML = `<p class="text-rose-300">Failed to generate report: ${error.message}</p>`;
  }
});

downloadBtn.addEventListener('click', () => {
  window.print();
});

copyBtn.addEventListener('click', async () => {
  if (!latestReportText) return;
  await navigator.clipboard.writeText(latestReportText);
  copyBtn.textContent = 'Copied';
  setTimeout(() => (copyBtn.textContent = 'Copy Report Text'), 1200);
});

rawBtn.addEventListener('click', () => {
  rawViewer.classList.toggle('hidden');
});
