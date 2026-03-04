const { runIntelligencePipeline } = require('../lib/intelligencePipeline');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { companyName, country } = req.body || {};
  if (!companyName) return res.status(400).json({ error: 'companyName required' });

  const intel = await runIntelligencePipeline({ companyName, country, website: '' });
  res.status(200).json({ sanctions: intel.sanctions, riskSignals: intel.risk.signals.filter((s) => s.category.includes('Sanctions')) });
};
