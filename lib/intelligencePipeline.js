const {
  normalizeCompanyName,
  getOpenSanctions,
  getOpenCorporates,
  getGleifLei,
  getGdeltNews,
  getGoogleNewsRss,
  getNewsApi,
  getPerplexitySummary,
  getDomainIntel,
  mergeAndRankMedia,
  extractLitigationSignals,
  buildLitigationQueries,
  getLitigationMedia,
} = require('./apiClients');
const { scoreRisk } = require('./riskScoring');

const CACHE_TTL_MS = 10 * 60 * 1000;
const responseCache = new Map();

async function getOffshoreLeaks(company) {
  const query = encodeURIComponent(company);
  const icijUrl = `https://offshoreleaks.icij.org/search?query=${query}`;
  return {
    endpointsChecked: [icijUrl],
    matches: [],
    note: 'Automated offshore leak APIs remain limited in this build; endpoint retained for analyst follow-up.',
  };
}

function cacheKey(input) {
  return JSON.stringify({
    companyName: input.companyName?.toLowerCase().trim(),
    country: input.country?.toLowerCase().trim(),
    website: input.website?.toLowerCase().trim(),
  });
}

function collectSourceReferences(intel) {
  const refs = [];

  intel.corporate.registryRecords.forEach((record) => {
    if (record.registryUrl) {
      refs.push({ label: `OpenCorporates: ${record.registeredName}`, url: record.registryUrl });
    }
  });

  intel.sanctions.matches.forEach((match) => {
    refs.push({ label: `OpenSanctions: ${match.entity}`, url: match.url });
  });

  intel.media.articles.forEach((article) => {
    refs.push({ label: `${article.source}: ${article.title}`, url: article.url });
  });

  intel.litigation.signals.forEach((signal) => {
    refs.push({ label: `Litigation signal: ${signal.title}`, url: signal.url });
  });

  return refs.filter((ref) => ref.url);
}

async function runIntelligencePipeline(input) {
  const key = cacheKey(input);
  const cached = responseCache.get(key);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.payload, cache: { hit: true, ttlMs: CACHE_TTL_MS } };
  }

  const normalizedName = normalizeCompanyName(input.companyName);

  const [sanctionsData, corporateData, gleif, gdeltNews, googleNews, newsApiData, perplexityData, cyber, offshore, litigationFeed] = await Promise.all([
    getOpenSanctions(normalizedName, input.country),
    getOpenCorporates(normalizedName, input.country),
    getGleifLei(normalizedName),
    getGdeltNews(normalizedName),
    getGoogleNewsRss(normalizedName),
    getNewsApi(normalizedName),
    getPerplexitySummary(normalizedName, input.country),
    getDomainIntel(input.website),
    getOffshoreLeaks(normalizedName),
    getLitigationMedia(normalizedName),
  ]);

  const mediaArticles = mergeAndRankMedia(normalizedName, [gdeltNews, googleNews, newsApiData.items]);
  const litigationSignals = extractLitigationSignals(normalizedName, [...mediaArticles, ...litigationFeed]);

  const warnings = [
    sanctionsData.warning,
    corporateData.warning,
    newsApiData.warning,
    perplexityData.warning,
  ].filter(Boolean);

  const aggregated = {
    generatedAt: new Date().toISOString(),
    input: {
      companyName: input.companyName,
      normalizedName,
      country: input.country || 'Unspecified',
      website: input.website || null,
    },
    warnings,
    sanctions: {
      matches: sanctionsData.matches,
      summary:
        sanctionsData.matches.length === 0
          ? 'No sanctions or watchlist matches identified.'
          : `${sanctionsData.matches.length} potential sanctions/watchlist matches identified.`,
    },
    corporate: {
      registryRecords: corporateData.records,
      gleif,
    },
    media: {
      articles: mediaArticles,
      searchQuery: `"${normalizedName}"`,
      perplexitySummary: perplexityData.content,
    },
    litigation: {
      queries: buildLitigationQueries(normalizedName),
      signals: litigationSignals,
    },
    offshore,
    cyber,
  };

  aggregated.sourceReferences = collectSourceReferences(aggregated);

  const risk = scoreRisk(aggregated);
  const payload = { ...aggregated, risk, cache: { hit: false, ttlMs: CACHE_TTL_MS } };

  responseCache.set(key, { createdAt: Date.now(), payload });
  return payload;
}

module.exports = { runIntelligencePipeline };
