export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'mack' } = req.query;

  // Test ulike URL-varianter
  const tests = [
    {
      label: 'v2_no_lang',
      url: `https://www.vinmonopolet.no/vmpws/v2/vmp/search?q=${encodeURIComponent(q)}&searchType=product&currentPage=0&pageSize=2`,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'no-NO,no;q=0.9', 'Origin': 'https://www.vinmonopolet.no', 'Referer': 'https://www.vinmonopolet.no/' },
    },
    {
      label: 'v2_with_store',
      url: `https://www.vinmonopolet.no/vmpws/v2/vmp/search?q=${encodeURIComponent(q)}&searchType=product&currentPage=0&pageSize=2&fields=FULL`,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.vinmonopolet.no/' },
    },
    {
      label: 'v1',
      url: `https://www.vinmonopolet.no/vmpws/v1/vmp/search?q=${encodeURIComponent(q)}&searchType=product&pageSize=2`,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    },
    {
      label: 'api_products',
      url: `https://apis.vinmonopolet.no/products/v0/details-normal?productShortNameContains=${encodeURIComponent(q)}&maxResults=2`,
      headers: { 'Ocp-Apim-Subscription-Key': process.env.VMP_API_KEY || '', 'Accept': 'application/json' },
    },
  ];

  const results = {};
  for (const t of tests) {
    try {
      const r = await fetch(t.url, { headers: t.headers });
      const text = await r.text();
      results[t.label] = { status: r.status, preview: text.slice(0, 300) };
    } catch(e) {
      results[t.label] = { error: e.message };
    }
  }

  res.status(200).json(results);
}
