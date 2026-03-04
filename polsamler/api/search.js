export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const debug = {};

  const urls = [
    'https://raw.githubusercontent.com/AlexGustafsson/systembolaget-api-data/main/data/assortment.json',
    'https://github.com/AlexGustafsson/systembolaget-api-data/raw/main/data/assortment.json',
    'https://api.github.com/repos/AlexGustafsson/systembolaget-api-data/contents/data/assortment.json',
  ];

  for (const url of urls) {
    const key = url.split('/')[2];
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      debug[key + '_status'] = r.status;
      if (r.ok) {
        const text = await r.text();
        debug[key + '_size'] = text.length;
        debug[key + '_start'] = text.slice(0, 100);
      }
    } catch(e) {
      debug[key + '_error'] = e.message;
    }
  }

  res.status(200).json(debug);
}
