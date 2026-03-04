function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function classifyRisk(score) {
  if (score >= 61) return 'High Risk';
  if (score >= 26) return 'Medium Risk';
  return 'Low Risk';
}

function calculateRiskSignals(intel) {
  const signals = [];

  if ((intel?.sanctions?.matches?.length || 0) > 0) {
    signals.push({
      category: 'Sanctions hit',
      weight: 50,
      severity: 'critical',
      detail: `${intel.sanctions.matches.length} sanctions/watchlist match(es) identified.`,
    });
  }

  if ((intel?.offshore?.matches?.length || 0) > 0) {
    signals.push({
      category: 'Offshore leak match',
      weight: 40,
      severity: 'high',
      detail: `${intel.offshore.matches.length} offshore leak references identified.`,
    });
  }

  if ((intel?.litigation?.signals?.length || 0) > 0) {
    signals.push({
      category: 'Litigation evidence',
      weight: 30,
      severity: 'high',
      detail: `${intel.litigation.signals.length} credible litigation references found.`,
    });
  }

  if ((intel?.media?.articles?.length || 0) >= 3) {
    signals.push({
      category: 'Adverse media',
      weight: 20,
      severity: 'medium',
      detail: `${intel.media.articles.length} relevant media records analyzed.`,
    });
  }

  const currentYear = new Date().getUTCFullYear();
  const creationYear = Number(intel?.cyber?.creationYear);
  if (Number.isFinite(creationYear) && creationYear >= currentYear - 1) {
    signals.push({
      category: 'New domain',
      weight: 10,
      severity: 'medium',
      detail: `Domain appears recently created in ${creationYear}.`,
    });
  }

  if ((intel?.media?.articles?.length || 0) <= 1 && !(intel?.corporate?.registryRecords?.length || 0)) {
    signals.push({
      category: 'Limited digital presence',
      weight: 5,
      severity: 'low',
      detail: 'Entity has limited discoverable media and registry footprint.',
    });
  }

  return signals;
}

function scoreRisk(intel) {
  const signals = calculateRiskSignals(intel);
  const rawScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const score = clampScore(rawScore);

  return {
    score,
    classification: classifyRisk(score),
    signals,
  };
}

module.exports = { scoreRisk, classifyRisk };
