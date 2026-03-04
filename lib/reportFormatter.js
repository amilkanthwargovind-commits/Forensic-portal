function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toSourceList(items, fallback = 'No material findings were identified during automated screening.') {
  if (!items || items.length === 0) return `<p>${fallback}</p>`;
  return `<ul class="report-list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function buildExecutiveSummary(intel) {
  const sanctionsText = intel.sanctions.matches.length
    ? `${intel.sanctions.matches.length} potential sanctions/watchlist match(es) were flagged and require analyst verification.`
    : 'No sanctions or watchlist matches were identified.';

  const litigationText = intel.litigation.signals.length
    ? `${intel.litigation.signals.length} credible litigation-related media signals were identified.`
    : 'No credible litigation signals were identified from screened media sources.';

  const mediaText = intel.media.articles.length
    ? `${intel.media.articles.length} relevant media articles were matched directly to the entity name.`
    : 'No strongly relevant adverse media was found in the current run.';

  const domainText = intel.cyber.available
    ? `Domain intelligence shows registrar ${intel.cyber.registrar || 'unknown'} and creation year ${intel.cyber.creationYear || 'unknown'}.`
    : 'No domain intelligence was collected because a website was not provided.';

  return `The entity was screened across sanctions datasets, corporate registries, adverse media sources, litigation indicators, and domain intelligence checks. ${sanctionsText} ${mediaText} ${litigationText} ${domainText} Final risk classification is ${intel.risk.classification} (${intel.risk.score}/100).`;
}

function formatReport(intel) {
  const { input, risk, corporate, sanctions, media, cyber, offshore, generatedAt, warnings, litigation } = intel;

  const riskColor = risk.classification === 'High Risk' ? '#dc2626' : risk.classification === 'Medium Risk' ? '#d97706' : '#16a34a';

  const corporateSummary = corporate.registryRecords.map(
    (record) =>
      `<strong>${escapeHtml(record.registeredName)}</strong> | ${escapeHtml(record.jurisdiction)} | Incorporated: ${escapeHtml(
        record.incorporationDate,
      )} | Status: ${escapeHtml(record.companyStatus)} ${
        record.registryUrl
          ? `<a class="source-link" href="${record.registryUrl}" target="_blank" rel="noopener noreferrer">🔗 Registry</a>`
          : ''
      }`,
  );

  const sanctionsSummary = sanctions.matches.map(
    (match) =>
      `${escapeHtml(match.entity)} (${escapeHtml(match.dataset)}) ${
        match.url ? `<a class="source-link" href="${match.url}" target="_blank" rel="noopener noreferrer">🔗 Record</a>` : ''
      }`,
  );

  const mediaSummary = media.articles.map(
    (article) =>
      `<strong>${escapeHtml(article.title)}</strong> <span class="muted">(${escapeHtml(article.date)} • ${escapeHtml(
        article.source,
      )})</span><br/>${escapeHtml(article.summary)} <a class="source-link" href="${article.url}" target="_blank" rel="noopener noreferrer">🔗 Source</a>`,
  );

  const litigationSummary = litigation.signals.map(
    (signal) =>
      `<strong>${escapeHtml(signal.title)}</strong> <span class="muted">(${escapeHtml(signal.date)} • ${escapeHtml(
        signal.source,
      )})</span><br/>${escapeHtml(signal.summary)} <a class="source-link" href="${signal.url}" target="_blank" rel="noopener noreferrer">🔗 Source</a>`,
  );

  const sourceSummary = intel.sourceReferences.map(
    (source) =>
      `<a class="source-link" href="${source.url}" target="_blank" rel="noopener noreferrer">🔗 ${escapeHtml(source.label)}</a>`,
  );

  return {
    title: `${input.companyName} - AI Forensic Due Diligence Report`,
    html: `
      <article class="report-document">
        <section class="report-cover">
          <div>
            <h1>AI Forensic Due Diligence Report</h1>
            <h2>${escapeHtml(input.companyName)}</h2>
            <p><strong>Country:</strong> ${escapeHtml(input.country)}</p>
            <p><strong>Date:</strong> ${new Date(generatedAt).toLocaleString()}</p>
          </div>
          <div class="risk-panel">
            <div class="risk-chip" style="background:${riskColor}">${risk.classification} (${risk.score}/100)</div>
            <div class="heatmap"><div style="width:${risk.score}%; background:${riskColor}"></div></div>
          </div>
        </section>

        ${warnings?.length ? `<section class="section-card"><h3>API Warnings</h3>${toSourceList(warnings.map((w) => escapeHtml(w)))}</section>` : ''}

        <section class="section-card">
          <h3>Executive Summary</h3>
          <p>${escapeHtml(buildExecutiveSummary(intel))}</p>
        </section>

        <section class="section-card">
          <h3>Corporate Registry Intelligence</h3>
          ${toSourceList(corporateSummary, 'No matching corporate registry records were identified.')}
        </section>

        <section class="section-card">
          <h3>Sanctions & Watchlist Screening</h3>
          <p>${escapeHtml(sanctions.summary)}</p>
          ${toSourceList(sanctionsSummary, 'No sanctions or watchlist matches identified.')}
        </section>

        <section class="section-card">
          <h3>Adverse Media Analysis</h3>
          <p><strong>Search query:</strong> ${escapeHtml(media.searchQuery)}</p>
          ${toSourceList(mediaSummary, 'No relevant media articles matched to the entity name.')}
          ${media.perplexitySummary ? `<div class="note-box"><strong>AI Intelligence Brief:</strong><p>${escapeHtml(media.perplexitySummary)}</p></div>` : ''}
        </section>

        <section class="section-card">
          <h3>Legal & Litigation Indicators</h3>
          <p><strong>Queries used:</strong> ${escapeHtml(litigation.queries.join(' | '))}</p>
          ${toSourceList(litigationSummary, 'No credible litigation signals identified in trusted media sources.')}
        </section>

        <section class="section-card">
          <h3>Domain Intelligence</h3>
          <p><strong>Domain:</strong> ${escapeHtml(cyber.domain || 'N/A')}</p>
          <p><strong>DNS records identified:</strong> ${cyber.dnsAnswers?.length || 0}</p>
          <p><strong>SSL transparency:</strong> ${escapeHtml(cyber.sslSignals || 'N/A')}</p>
          <p><strong>Creation year:</strong> ${escapeHtml(String(cyber.creationYear || 'Unknown'))}</p>
          <p><strong>Registrar:</strong> ${escapeHtml(cyber.registrar || 'Unknown')}</p>
          <p><strong>Hosting provider:</strong> ${escapeHtml(cyber.hostingProvider || 'Unknown')}</p>
        </section>

        <section class="section-card">
          <h3>Risk Signals</h3>
          ${toSourceList(risk.signals.map((signal) => `${escapeHtml(signal.category)} (+${signal.weight}) - ${escapeHtml(signal.detail)}`), 'No red flags reached scoring thresholds.')}
        </section>

        <section class="section-card">
          <h3>Source References</h3>
          ${toSourceList(sourceSummary, 'No direct source references available in this run.')}
          <p class="timestamp">Intelligence timestamp: ${escapeHtml(generatedAt)}</p>
          <p class="timestamp">Offshore screening note: ${escapeHtml(offshore.note || 'N/A')}</p>
        </section>
      </article>
    `,
  };
}

module.exports = { formatReport };
