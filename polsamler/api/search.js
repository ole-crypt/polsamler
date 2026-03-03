export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'mack' } = req.query;

  try {
    const url = `https://www.vinmonopolet.no/vmpws/v2/vmp/search?q=${encodeURIComponent(q)}&searchType=product&currentPage=0&pageSize=3`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const status = r.status;
    const text = await r.text();
    res.status(200).json({ status, preview: text.slice(0, 1000) });
  } catch(e) {
    res.status(200).json({ error: e.message });
  }
}
