export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Test: hent produktside for Mack Porter (ID 1855202)
  try {
    const r = await fetch('https://www.vinmonopolet.no/Land/Norge/Mack-Porter/p/1855202', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'no-NO,no;q=0.9',
      }
    });
    const text = await r.text();

    // Let etter pris i HTML
    const priceMatch = text.match(/"price":\s*"?([\d.,]+)"?/) ||
                       text.match(/class="[^"]*price[^"]*"[^>]*>([\d\s.,]+)/) ||
                       text.match(/"salesPrice":\s*([\d.,]+)/);

    res.status(200).json({
      status: r.status,
      price_found: priceMatch ? priceMatch[1] : null,
      html_snippet: text.slice(text.indexOf('price') - 50, text.indexOf('price') + 200),
    });
  } catch(e) {
    res.status(200).json({ error: e.message });
  }
}
