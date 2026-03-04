const DEFAULT_TIMEOUT = 12000;

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

function buildQuery(company, country) {
  return encodeURIComponent(`${company} ${country || ''}`.trim());
}

async function getOpenSanctions(company, country) {
  const q = buildQuery(company, country);
  const url = `https://api.opensanctions.org/match/default?schema=Thing&name=${q}`;
  const data = await safeFetchJson(url, {}, { results: [] });
  return data?.results || [];
}

async function getOpenCorporates(company, country) {
  const token = process.env.OPENCORPORATES_API_KEY;
  const jurisdiction = country ? `&jurisdiction_code=${country.toLowerCase()}` : '';
  const q = buildQuery(company, '');
  const url = `https://api.opencorporates.com/v0.4/companies/search?q=${q}${jurisdiction}${token ? `&api_token=${token}` : ''}`;
  const data = await safeFetchJson(url, {}, { results: { companies: [] } });
  return data?.results?.companies || [];
}

async function getGleifLei(company) {
  const q = encodeURIComponent(company);
  const url = `https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${q}`;
  const data = await safeFetchJson(url, {}, { data: [] });
  return data?.data || [];
}

async function getGdeltNews(company) {
  const q = encodeURIComponent(company);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=10`;
  const data = await safeFetchJson(url, {}, { articles: [] });
  return data?.articles || [];
}

async function getGoogleNewsRss(company) {
  const q = encodeURIComponent(company);
  const url = `https://news.google.com/rss/search?q=${q}`;
  const xml = await safeFetchText(url, {}, '');
  const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/g)]
    .slice(0, 8)
    .map((m) => ({ title: m[1], url: m[2] }));
  return items;
}

async function getNewsApi(company) {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) return [];
  const q = encodeURIComponent(company);
  const url = `https://newsapi.org/v2/everything?q=${q}&language=en&pageSize=10&apiKey=${apiKey}`;
  const data = await safeFetchJson(url, {}, { articles: [] });
  return data?.articles || [];
}

async function getPerplexitySummary(company, country) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  const body = {
    model: 'sonar-pro',
    messages: [
      {
        role: 'system',
        content: 'You are an intelligence analyst. Return concise factual bullets and cite source domains when possible.',
      },
      {
        role: 'user',
        content: `Summarize adverse media and compliance concerns for ${company} (${country || 'global'}) in 6 bullets.`,
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

  return data?.choices?.[0]?.message?.content || null;
}

async function getWikipedia(company) {
  const q = encodeURIComponent(company);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${q}`;
  return safeFetchJson(url, {}, null);
}

async function getWikidata(company) {
  const q = encodeURIComponent(company);
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q}&language=en&format=json&origin=*`;
  const data = await safeFetchJson(url, {}, { search: [] });
  return data?.search || [];
}

async function getDomainIntel(website) {
  if (!website) return { available: false };

  const domain = website.replace(/^https?:\/\//, '').split('/')[0];
  const [crtData, dnsData] = await Promise.all([
    safeFetchJson(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {}, []),
    safeFetchJson(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {}, null),
  ]);

  const certificates = Array.isArray(crtData) ? crtData.slice(0, 5) : [];
  const dnsAnswers = dnsData?.Answer || [];

  return {
    available: true,
    domain,
    dnsAnswers,
    certificates,
    sslSignals: certificates.length > 0 ? 'Certificate transparency records found' : 'No certificate records found',
  };
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
  getWikipedia,
  getWikidata,
  getDomainIntel,
};
