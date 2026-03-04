function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function classifyRisk(score) {
  if (score >= 61) return 'High Risk';
  if (score >= 31) return 'Medium Risk';
  return 'Low Risk';
}

function calculateRiskSignals(intel) {
  const signals = [];

  const sanctionsCount = intel?.sanctions?.matches?.length || 0;
  if (sanctionsCount > 0) {
    signals.push({ category: 'Sanctions match', weight: 40, severity: 'high', detail: `${sanctionsCount} potential watchlist matches` });
  }

  const offshoreHits = intel?.offshore?.matches?.length || 0;
  if (offshoreHits > 0) {
    signals.push({ category: 'Offshore leaks', weight: 30, severity: 'high', detail: `${offshoreHits} offshore dataset references` });
  }

  const mediaHits = (intel?.media?.gdelt?.length || 0) + (intel?.media?.newsApi?.length || 0) + (intel?.media?.googleNews?.length || 0);
  if (mediaHits >= 5) {
    signals.push({ category: 'Adverse media volume', weight: 18, severity: 'medium', detail: `${mediaHits} media records reviewed` });
  } else if (mediaHits > 0) {
    signals.push({ category: 'Limited media profile', weight: 8, severity: 'low', detail: `${mediaHits} media records reviewed` });
  }

  if (!intel?.input?.website) {
    signals.push({ category: 'Missing website', weight: 12, severity: 'medium', detail: 'No official corporate website provided' });
  }

  if (intel?.cyber?.available && (intel?.cyber?.certificates?.length || 0) === 0) {
    signals.push({ category: 'Weak cyber footprint', weight: 10, severity: 'medium', detail: 'No SSL transparency entries detected' });
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
