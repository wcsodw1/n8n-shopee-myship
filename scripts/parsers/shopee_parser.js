// n8n Code node — JavaScript — Run Once for ALL Items
// Output per row: Name, Order day, Order Limit, Shipping number, Shipping Type, Item, 單價, 扣除手續費

const inputItems = $input.all();
const out = [];

/* ------------ helpers ------------ */
function norm(s){ return String(s ?? '').replace(/\\n/g, '\n').replace(/\r/g, ''); }
function unhtml(s){
  return String(s ?? '')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"').replace(/&#39;/g,"'")
    .replace(/&#(\d+);/g, (_,d)=>String.fromCharCode(parseInt(d,10)))
    .replace(/&#x([0-9a-fA-F]+);/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
}
function htmlToPlain(html){
  return String(html ?? '')
    .replace(/<\s*script[^>]*>[\s\S]*?<\/\s*script\s*>/gi,'')
    .replace(/<\s*style[^>]*>[\s\S]*?<\/\s*style\s*>/gi,'')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function pick(re, src){ re.lastIndex = 0; const m = re.exec(src); return m ? (m[1] ?? '').trim() : null; }
function toNum(s){
  const n = Number(String(s ?? '').replace(/[^\d.-]/g,'').replace(/,/g,''));
  return Number.isFinite(n) ? n : null;
}
// Cleanup: drop any (...) / （...） content and stray trailing brackets
function cleanVariant(s){
  return s
    ? s
      .replace(/[\(（][\s\S]*?[\)）]/g,'')
      .replace(/[)\]）】〉》]+$/g,'')
      .trim()
    : s;
}
// pick the last dashed token, allowing CJK in the middle segment (e.g. W-針頭-Mid)
function pickVariant(s){
  if (!s) return null;
  const re = /[^\s<>()（\)（）\[\]【】,，。；;:]+(?:-[^\s<>()（\)（）\[\]【】,，。；;:]+)+/g;
  const all = String(s).match(re);
  return all ? all[all.length-1] : null;
}

// Subject getter (supports raw field or Gmail headers)
function getSubject(base) {
  if (base?.subject) return String(base.subject);
  if (base?.Subject) return String(base.Subject);
  const hdrs = base?.message?.payload?.headers;
  if (Array.isArray(hdrs)) {
    const h = hdrs.find(x => /^subject$/i.test(x?.name));
    if (h?.value) return String(h.value);
  }
  return null;
}

// 訂單日期 → "YYYY/M/D"
function parseOrderDay(html, fallbackISO){
  let m = /訂單日期[^<]*<\/td>\s*<td[^>]*>\s*(\d{4})-(\d{2})-(\d{2})/i.exec(html);
  if (m) return `${+m[1]}/${+m[2]}/${+m[3]}`;
  m = /訂單日期[:：]?\s*(\d{4})-(\d{1,2})-(\d{1,2})/i.exec(html);
  if (m) return `${+m[1]}/${+m[2]}/${+m[3]}`;
  m = /訂單日期[:：]?\s*(\d{4})年(\d{1,2})月(\d{1,2})日/i.exec(html);
  if (m) return `${+m[1]}/${+m[2]}/${+m[3]}`;
  if (fallbackISO) {
    const d = new Date(fallbackISO);
    if (!isNaN(d)) return `${d.getUTCFullYear()}/${d.getUTCMonth()+1}/${d.getUTCDate()}`;
  }
  return null;
}
function plus2(orderDay){
  if (!orderDay) return null;
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(orderDay);
  if (!m) return null;
  const d = new Date(+m[1], +m[2]-1, +m[3]);
  d.setDate(d.getDate()+2);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
}

function detectShippingType(base, html){
  const fromName = (base?.from?.value?.[0]?.name || '').trim();
  const isCarrierName = /(7[\-\s]?ELEVEN|全家|萊爾富|OK|黑貓宅急便|郵局|賣貨便)/i.test(fromName);
  if (fromName && isCarrierName) return fromName;

  const text = htmlToPlain(html).toUpperCase();
  const map = [
    { re: /7[\-\s]?ELEVEN.*賣貨便/, out: '7-ELEVEN賣貨便' },
    { re: /7[\-\s]?ELEVEN/, out: '7-ELEVEN' },
    { re: /全家|FAMILY\s*MART/, out: '全家' },
    { re: /萊爾富|HI[-\s]?LIFE|HILIFE/, out: '萊爾富' },
    { re: /OK(?:\s*超商)?|OKMART/, out: 'OK' },
    { re: /黑貓宅急便|TA-?Q-?BIN|黑貓/, out: '黑貓宅急便' },
    { re: /郵局/, out: '郵局' },
    { re: /賣貨便/, out: '賣貨便' },
  ];
  for (const {re, out} of map) if (re.test(text)) return out;
  return '';
}

// Buyer name: Subject/title → IG/Line feedback → “出貨給買家 …”
function extractBuyerName(base, html){
  const subject = getSubject(base);
  if (subject) {
    let m = /來自\s*([^\s#，。,;；]+)\s*的貨到付款訂單/i.exec(subject);
    if (m) return m[1];
  }
  let m2 = /<title[^>]*>[\s\S]*?來自\s*([^<\s#，。,;；]+)\s*的貨到付款訂單/i.exec(html);
  if (m2) return m2[1];

  const plain = htmlToPlain(html);
  let name =
    pick(/您的\s+(?:IG|Instagram|Instgram)[^:\n]{0,40}?(?:或)?\s*(?:LINE|Line)[^:\n]{0,20}?[:：]\s*([^\s，。,;；]+)/i, plain) ||
    pick(/買家回饋資訊[^:：]*[:：]\s*([^\s，。,;；]+)/i, plain);

  if (!name) {
    name =
      pick(/出貨給買家\s+([^\s]+)/i, plain) ||
      pick(/給買家\s+([^\s]+)/i, plain) ||
      pick(/買家\s*[:：]\s*([^\s]+)/i, plain);
  }
  return name || null;
}

/* ---------- markers: 《急件》 / 《補充包》 (also [[急件]] / [[補充包]]) ---------- */
function parseRushPack(src, alsoPlain=false){
  if (!src) return [];
  const out = [];
  const s = String(src);

  const re = /《\s*(急件|補充包)\s*》|\[\[\s*(急件|補充包)\s*\]\]/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const w = m[1] || m[2];
    if (w && !out.includes(w)) out.push(w);
  }

  if (alsoPlain) {
    const plain = htmlToPlain(s).replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (/急\s*件/.test(plain) && !out.includes('急件')) out.push('急件');
    if (/補\s*充\s*包/.test(plain) && !out.includes('補充包')) out.push('補充包');
  }
  return out;
}

/* ---------- totals fallback for 扣除手續費 ---------- */
function findMoneyAfterLabel(text, labels){
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pat = new RegExp(`(?:${labels.map(esc).join('|')})\\s*[:：]?\\s*(?:NT\\$|＄|\\$)?\\s*([\\d,]+)`, 'i');
  const m = pat.exec(text);
  return m ? toNum(m[1]) : null;
}
function parseFallbackFee(html){
  const plain = htmlToPlain(html);
  return (
    findMoneyAfterLabel(plain, ['商品總額']) ??
    findMoneyAfterLabel(plain, ['總金額','訂單總額'])
  );
}

/* ---------- ✅ 修正版：賣貨便表格解析 ---------- */
function parseMyshipRows(html) {
  const rows = [];
  const re = /<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>\s*(?:NT\$|＄|\$)?\s*([\d,]+)\s*<\/td>\s*<td[^>]*>\s*([1-9]\d*)\s*<\/td>\s*<td[^>]*>\s*(?:NT\$|＄|\$)?\s*([\d,]+)\s*<\/td>\s*<\/tr>/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    const itemCellHtml = m[1];
    const unit = toNum(m[2]);
    const qty  = toNum(m[3]);
    const sub  = toNum(m[4]);

    const plainName = htmlToPlain(itemCellHtml);
    let itemName;

    // 🧠 優先抓含克(g)/份的品名（避免誤抓全域標題）
    const weightMatch = /([^\s()（)）]*?(?:飼料|粉|包|餌|糧)[^\s)]*\d+\s*(?:g|G|克|份))/.exec(plainName);
    if (weightMatch) {
      itemName = weightMatch[1].trim();
    } else {
      const forced = parseRushPack(itemCellHtml, true);
      if (forced.length) {
        itemName = forced.join(' ');
      } else {
        itemName = pickVariant(itemCellHtml) || cleanVariant(plainName);
      }
    }

    // 🆕 remove “蟋蟀” prefix when followed by “飼料”
    if (itemName) itemName = itemName.replace(/^蟋蟀(?=飼料)/, '');

    rows.push({ itemName, unitPrice: unit, amount: qty, sumPrice: sub });
  }
  return rows;
}

/* ------------ main ------------ */
for (const it of inputItems) {
  const base = it.json ?? {};
  const html = unhtml(norm(base.html ?? base.text ?? base.rawText ?? base.body ?? ''));

  const Name       = extractBuyerName(base, html);
  const orderDay   = parseOrderDay(html, base.date);
  const orderLimit = plus2(orderDay);
  const shipNo     = ''; 
  const shipType   = detectShippingType(base, html);

  let fee = base['扣除手續費'];
  if (fee == null || fee === '') {
    const f = parseFallbackFee(html);
    if (f != null) fee = f;
    else fee = null;
  }

  const itemRe = /選項:\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>[\s\S]*?數量:\s*<\/td>\s*<td[^>]*>\s*([0-9]+)\s*<\/td>[\s\S]*?價格:\s*<\/td>\s*<td[^>]*>\s*(?:NT\$|＄|\$)\s*([\d,]+)\s*<\/td>/gi;

  let any = false, m;
  while ((m = itemRe.exec(html)) !== null) {
    const variantRaw = m[1];
    const qty        = toNum(m[2]) ?? 1;
    const unit       = toNum(m[3]);

    const from = Math.max(0, m.index - 600);
    const to   = Math.min(html.length, itemRe.lastIndex + 600);
    const local = html.slice(from, to);

    const forcedList = [
      ...parseRushPack(variantRaw, true),
      ...parseRushPack(local, false),
    ].filter((v, i, a) => a.indexOf(v) === i);

    const Item = forcedList.length ? forcedList.join(' ') : cleanVariant(variantRaw);

    for (let i = 0; i < Math.max(1, qty); i++) {
      out.push({
        json: {
          'Name': Name,
          'Order day': orderDay,
          'Order Limit': orderLimit,
          'Shipping number': shipNo,
          'Shipping Type': shipType,
          'Item': Item,
          '單價': unit,
          '扣除手續費': fee,
        }
      });
    }
    any = true;
  }

  const myshipRows = parseMyshipRows(html);
  if (myshipRows.length) {
    for (const r of myshipRows) {
      const qty = Math.max(1, Number(r.amount) || 1);
      for (let i = 0; i < qty; i++) {
        out.push({
          json: {
            'Name': Name,
            'Order day': orderDay,
            'Order Limit': orderLimit,
            'Shipping number': shipNo,
            'Shipping Type': shipType,
            'Item': r.itemName,
            '單價': r.unitPrice,
            '扣除手續費': fee,
          }
        });
      }
    }
    any = true;
  }

  if (!any) {
    out.push({
      json: {
        'Name': Name,
        'Order day': orderDay,
        'Order Limit': orderLimit,
        'Shipping number': shipNo,
        'Shipping Type': shipType,
        'Item': null,
        '單價': null,
        '扣除手續費': fee,
      }
    });
  }
}

return out;
