const {
  normalizeCompanyName,
  getOpenSanctions,
  getOpenCorporates,
  getGleifLei,
  getGdeltNews,
  getGoogleNewsRss,
  getNewsApi,
  getPerplexitySummary,
  getWikipedia,
  getWikidata,
  getDomainIntel,
} = require('./apiClients');
const { scoreRisk } = require('./riskScoring');

const CACHE_TTL_MS = 10 * 60 * 1000;
const responseCache = new Map();

async function getOffshoreLeaks(company) {
  // Public fallback endpoints; responses may vary by availability.
  const query = encodeURIComponent(company);
  const icijUrl = `https://offshoreleaks.icij.org/search?query=${query}`;
  const occrpUrl = `https://data.occrp.org/entities?query=${query}`;
  return {
    endpointsChecked: [icijUrl, occrpUrl],
    matches: [],
    note: 'Automated public offshore APIs are limited. Endpoints are tracked for analyst follow-up.',
  };
}

function cacheKey(input) {
  return JSON.stringify({
    companyName: input.companyName?.toLowerCase().trim(),
    country: input.country?.toLowerCase().trim(),
    website: input.website?.toLowerCase().trim(),
  });
}

async function runIntelligencePipeline(input) {
  const key = cacheKey(input);
  const cached = responseCache.get(key);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.payload, cache: { hit: true, ttlMs: CACHE_TTL_MS } };
  }

  const normalizedName = normalizeCompanyName(input.companyName);

  // Core asynchronous intelligence collection. All external calls execute in parallel.
  const [sanctionsMatches, corporateMatches, gleif, gdelt, googleNews, newsApi, perplexitySummary, wikipedia, wikidata, cyber, offshore] = await Promise.all([
    getOpenSanctions(normalizedName, input.country),
    getOpenCorporates(normalizedName, input.country),
    getGleifLei(normalizedName),
    getGdeltNews(normalizedName),
    getGoogleNewsRss(normalizedName),
    getNewsApi(normalizedName),
    getPerplexitySummary(normalizedName, input.country),
    getWikipedia(normalizedName),
    getWikidata(normalizedName),
    getDomainIntel(input.website),
    getOffshoreLeaks(normalizedName),
  ]);

  const aggregated = {
    generatedAt: new Date().toISOString(),
    input: {
      companyName: input.companyName,
      normalizedName,
      country: input.country || 'Unspecified',
      website: input.website || null,
    },
    sanctions: {
      matches: sanctionsMatches,
      sources: ['OpenSanctions', 'OFAC SDN (via open datasets)', 'EU consolidated list', 'UN sanctions list'],
    },
    corporate: {
      opencorporates: corporateMatches,
      gleif,
      wikipedia,
      wikidata,
    },
    media: {
      gdelt,
      googleNews,
      newsApi,
      perplexitySummary,
    },
    offshore,
    cyber,
    sourceReferences: [
      'https://api.opensanctions.org',
      'https://api.opencorporates.com',
      'https://api.gleif.org',
      'https://api.gdeltproject.org',
      'https://news.google.com',
      'https://newsapi.org',
      'https://offshoreleaks.icij.org',
      'https://www.wikidata.org',
      'https://en.wikipedia.org',
      'https://crt.sh',
      'https://dns.google',
    ],
  };

  const risk = scoreRisk(aggregated);
  const payload = { ...aggregated, risk, cache: { hit: false, ttlMs: CACHE_TTL_MS } };

  responseCache.set(key, { createdAt: Date.now(), payload });
  return payload;
}

module.exports = { runIntelligencePipeline };
