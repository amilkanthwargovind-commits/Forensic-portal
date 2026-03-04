const DEFAULT_TIMEOUT = 12000;
const MAX_MEDIA_RESULTS = 10;

async function safeFetchJson(url, options = {}, fallback = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      return fallback;
    }
    return await response.json();
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeFetchText(url, options = {}, fallback = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      return fallback;
    }
    return await response.text();
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCompanyName(companyName = '') {
  return companyName
    .trim()
    .replace(/\b(limited|ltd|incorporated|inc|corp|corporation|gmbh|sa|sarl|plc)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s.&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function companyTokens(company) {
  return normalizeCompanyName(company)
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function isEntityMatch(company, ...fields) {
  const tokens = companyTokens(company);
  if (tokens.length === 0) return false;
  const haystack = fields
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (!haystack) return false;

  const fullName = normalizeCompanyName(company).toLowerCase();
  if (fullName && haystack.includes(fullName)) return true;

  const matchedTokens = tokens.filter((token) => haystack.includes(token)).length;
  return matchedTokens >= Math.max(2, Math.ceil(tokens.length * 0.6));
}

function dedupeByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.url) return false;
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function toIsoDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toISOString().split('T')[0];
}

function buildNewsItem({ title, source, date, url, summary }) {
  return {
    title: title || 'Untitled',
    source: source || 'Unknown source',
    date: toIsoDate(date),
    url,
    summary: summary || 'No summary available.',
  };
}

function buildSearchQuery(company, country) {
  const quoteName = `"${company}"`;
  return encodeURIComponent(`${quoteName} ${country || ''}`.trim());
}

async function getOpenSanctions(company, country) {
  const apiKey = process.env.OPENSANCTIONS_API_KEY;
  if (!apiKey) {
    return { matches: [], warning: 'Missing OPENSANCTIONS_API_KEY. OpenSanctions screening was skipped.' };
  }

  const url = `https://api.opensanctions.org/match/default?schema=Thing&name=${buildSearchQuery(company, country)}&limit=5`;
  const data = await safeFetchJson(
    url,
    {
      headers: {
        Authorization: `ApiKey ${apiKey}`,
      },
    },
    { results: [] },
  );

  const matches = (data?.results || [])
    .filter((entry) => isEntityMatch(company, entry?.caption, entry?.properties?.name?.join(' '), entry?.match?.name))
    .map((entry) => ({
      dataset: entry?.dataset || entry?.datasets?.[0] || 'OpenSanctions',
      entity: entry?.caption || entry?.properties?.name?.[0] || 'Potential match',
      score: Number((entry?.score || 0).toFixed?.(2)) || entry?.score || 0,
      url: entry?.id ? `https://www.opensanctions.org/entities/${entry.id}/` : 'https://www.opensanctions.org',
    }));

  return { matches };
}

async function getOpenCorporates(company, country) {
  const token = process.env.OPENCORPORATES_API_KEY;
  const jurisdiction = country ? `&jurisdiction_code=${country.toLowerCase()}` : '';
  const url = `https://api.opencorporates.com/v0.4/companies/search?q=${buildSearchQuery(company, '')}${jurisdiction}${token ? `&api_token=${token}` : ''}`;
  const data = await safeFetchJson(url, {}, { results: { companies: [] } });

  const records = (data?.results?.companies || [])
    .map((entry) => entry?.company)
    .filter(Boolean)
    .filter((companyEntry) => isEntityMatch(company, companyEntry?.name))
    .slice(0, 5)
    .map((companyEntry) => ({
      registeredName: companyEntry?.name || 'Unknown',
      jurisdiction: companyEntry?.jurisdiction_code || 'Unknown',
      incorporationDate: companyEntry?.incorporation_date || 'Unknown',
      companyStatus: companyEntry?.current_status || companyEntry?.company_type || 'Unknown',
      registryUrl: companyEntry?.registry_url || companyEntry?.opencorporates_url || 'https://opencorporates.com',
      directors: companyEntry?.officers?.map((officer) => officer.name).filter(Boolean) || [],
      companyNumber: companyEntry?.company_number || null,
    }));

  return {
    records,
    warning: token ? null : 'OPENCORPORATES_API_KEY is not configured; some registry fields may be limited.',
  };
}

async function getGleifLei(company) {
  const q = encodeURIComponent(company);
  const url = `https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${q}`;
  const data = await safeFetchJson(url, {}, { data: [] });
  return (data?.data || []).filter((entry) => isEntityMatch(company, entry?.attributes?.value));
}

async function getNewsApi(company) {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    return { items: [], warning: 'Missing NEWS_API_KEY. NewsAPI collection skipped.' };
  }

  const url = `https://newsapi.org/v2/everything?q=${buildSearchQuery(company)}&language=en&pageSize=20&sortBy=relevancy&apiKey=${apiKey}`;
  const data = await safeFetchJson(url, {}, { articles: [] });
  const items = (data?.articles || [])
    .filter((article) => isEntityMatch(company, article?.title, article?.description, article?.content))
    .map((article) =>
      buildNewsItem({
        title: article?.title,
        source: article?.source?.name,
        date: article?.publishedAt,
        url: article?.url,
        summary: article?.description || article?.content,
      }),
    );

  return { items };
}

async function getGdeltNews(company) {
  const query = encodeURIComponent(`"${company}"`);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&format=json&maxrecords=25&sort=HybridRel`;
  const data = await safeFetchJson(url, {}, { articles: [] });

  const items = (data?.articles || [])
    .filter((article) => isEntityMatch(company, article?.title, article?.seendate, article?.domain))
    .map((article) =>
      buildNewsItem({
        title: article?.title,
        source: article?.sourcecountry || article?.domain,
        date: article?.seendate,
        url: article?.url,
        summary: article?.socialimage ? `Referenced image: ${article.socialimage}` : `Coverage from ${article?.domain || 'media source'}`,
      }),
    );

  return items;
}

async function getGoogleNewsRss(company) {
  const q = encodeURIComponent(`"${company}"`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await safeFetchText(url, {}, '');
  const itemMatches = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<description>(.*?)<\/description>/g)];

  return itemMatches
    .map((m) => {
      const title = m[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1');
      const description = m[4]?.replace(/<[^>]+>/g, ' ').trim();
      return buildNewsItem({
        title,
        source: 'Google News',
        date: m[3],
        url: m[2],
        summary: description,
      });
    })
    .filter((article) => isEntityMatch(company, article?.title, article?.summary));
}

async function getPerplexitySummary(company, country) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return { content: null, warning: 'Missing PERPLEXITY_API_KEY. AI narrative enrichment skipped.' };
  }

  const body = {
    model: 'sonar-pro',
    messages: [
      {
        role: 'system',
        content: 'You are an OSINT investigator. Provide concise facts that are directly tied to the queried entity.',
      },
      {
        role: 'user',
        content: `Prepare a factual investigative synopsis for ${company} (${country || 'global'}) with clear factual statements only.`,
      },
    ],
  };

  const data = await safeFetchJson(
    'https://api.perplexity.ai/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    null,
  );

  return { content: data?.choices?.[0]?.message?.content || null };
}

function getDomainFromUrl(website) {
  if (!website) return null;
  const normalized = website.startsWith('http') ? website : `https://${website}`;
  try {
    return new URL(normalized).hostname;
  } catch {
    return website.replace(/^https?:\/\//, '').split('/')[0];
  }
}

async function getDomainIntel(website) {
  const domain = getDomainFromUrl(website);
  if (!domain) return { available: false };

  const [crtData, dnsData, rdapData] = await Promise.all([
    safeFetchJson(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {}, []),
    safeFetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {}, null),
    safeFetchJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {}, null),
  ]);

  const dnsAnswers = dnsData?.Answer || [];
  const ipv4 = dnsAnswers.find((answer) => answer.type === 1)?.data;
  const hostLookup = ipv4 ? await safeFetchJson(`https://ipwho.is/${encodeURIComponent(ipv4)}`, {}, null) : null;

  const events = rdapData?.events || [];
  const registrationEvent = events.find((event) => event?.eventAction === 'registration');
  const createdDate = registrationEvent?.eventDate || rdapData?.events?.[0]?.eventDate || null;
  const creationYear = createdDate ? new Date(createdDate).getUTCFullYear() : null;

  return {
    available: true,
    domain,
    dnsAnswers,
    certificates: Array.isArray(crtData) ? crtData.slice(0, 5) : [],
    sslSignals: Array.isArray(crtData) && crtData.length > 0 ? 'Certificate transparency records found' : 'No certificate records found',
    createdDate: createdDate || 'Unknown',
    creationYear: creationYear || 'Unknown',
    registrar: rdapData?.entities?.[0]?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3] || rdapData?.port43 || 'Unknown',
    hostingProvider: hostLookup?.connection?.org || hostLookup?.org || 'Unknown',
  };
}

function scoreMediaRelevance(item, company) {
  const name = normalizeCompanyName(company).toLowerCase();
  const text = `${item.title} ${item.summary}`.toLowerCase();
  let score = 0;
  if (text.includes(name)) score += 3;
  const tokenHits = companyTokens(company).filter((token) => text.includes(token)).length;
  score += tokenHits;
  if (item.source && item.source !== 'Unknown source') score += 1;
  if (item.date !== 'Unknown') score += 1;
  return score;
}

function mergeAndRankMedia(company, collections = []) {
  const flattened = dedupeByUrl(collections.flat());
  return flattened
    .filter((item) => isEntityMatch(company, item.title, item.summary))
    .sort((a, b) => scoreMediaRelevance(b, company) - scoreMediaRelevance(a, company))
    .slice(0, MAX_MEDIA_RESULTS);
}

function buildLitigationQueries(company) {
  return ['lawsuit', 'court', 'litigation', 'fraud', 'investigation'].map((term) => `"${company}" ${term}`);
}

function extractLitigationSignals(company, mediaItems) {
  const credibleDomains = ['reuters.com', 'bloomberg.com', 'wsj.com', 'ft.com', 'apnews.com', 'courtlistener.com', 'law360.com'];
  const patterns = ['lawsuit', 'court', 'litigation', 'fraud', 'investigation', 'indictment', 'settlement'];

  return mediaItems
    .filter((item) => {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      const hasPattern = patterns.some((pattern) => text.includes(pattern));
      const domain = (() => {
        try {
          return new URL(item.url).hostname.replace('www.', '');
        } catch {
          return '';
        }
      })();
      const credible = credibleDomains.some((candidate) => domain.endsWith(candidate));
      return hasPattern && credible && isEntityMatch(company, item.title, item.summary);
    })
    .slice(0, 10);
}


async function getLitigationMedia(company) {
  const queries = buildLitigationQueries(company);
  const apiKey = process.env.NEWS_API_KEY;

  const newsApiPromises = apiKey
    ? queries.map((query) =>
        safeFetchJson(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=en&pageSize=5&sortBy=relevancy&apiKey=${apiKey}`,
          {},
          { articles: [] },
        ),
      )
    : [];

  const gdeltPromises = queries.map((query) =>
    safeFetchJson(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=5&sort=HybridRel`,
      {},
      { articles: [] },
    ),
  );

  const [newsApiResults, gdeltResults] = await Promise.all([Promise.all(newsApiPromises), Promise.all(gdeltPromises)]);

  const newsItems = (newsApiResults || []).flatMap((result) => result?.articles || []).map((article) =>
    buildNewsItem({
      title: article?.title,
      source: article?.source?.name,
      date: article?.publishedAt,
      url: article?.url,
      summary: article?.description || article?.content,
    }),
  );

  const gdeltItems = (gdeltResults || []).flatMap((result) => result?.articles || []).map((article) =>
    buildNewsItem({
      title: article?.title,
      source: article?.sourcecountry || article?.domain,
      date: article?.seendate,
      url: article?.url,
      summary: `Coverage from ${article?.domain || 'media source'}`,
    }),
  );

  return dedupeByUrl([...newsItems, ...gdeltItems]).filter((item) => isEntityMatch(company, item.title, item.summary));
}

module.exports = {
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
};
