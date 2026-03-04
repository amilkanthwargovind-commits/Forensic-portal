const { runIntelligencePipeline } = require('../lib/intelligencePipeline');
const { formatReport } = require('../lib/reportFormatter');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { companyName, country, website } = req.body || {};
  if (!companyName) return res.status(400).json({ error: 'companyName required' });

  const intel = await runIntelligencePipeline({ companyName, country, website });
  const report = formatReport(intel);
  res.status(200).json({ report, intel });
};
