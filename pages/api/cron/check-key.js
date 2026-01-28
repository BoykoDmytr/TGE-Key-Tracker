import { kv } from "@vercel/kv";

function toLower(s) {
  return (s || "").toLowerCase();
}

function formatKyivDateFromUnixSeconds(sec) {
  const ms = Number(sec) * 1000;
  const d = new Date(ms);

  // Формат у часовій зоні Europe/Kiev
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kiev",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(d);
  } catch {
    // fallback якщо щось не так з timeZone
    return d.toISOString();
  }
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Telegram error ${resp.status}: ${err}`);
  }
}

export default async function handler(req, res) {
  try {
    // 1) Захист: щоб ніхто не спамив endpoint
    const secret = req.query.secret;
    if (!secret || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // 2) Налаштування
    const watchAddress = toLower(process.env.WATCH_ADDRESS);
    const bscKey = process.env.BSCSCAN_API_KEY;

    if (!watchAddress || !bscKey) {
      return res.status(400).json({
        ok: false,
        error: "Missing WATCH_ADDRESS or BSCSCAN_API_KEY"
      });
    }

    // 3) Тягнемо останні токен-трансфери на адресу
    const qs = new URLSearchParams({
        chainid: "56",                 // BSC
        module: "account",
        action: "tokentx",
        address: watchAddress,
        page: "1",
        offset: "50",
        sort: "desc",
        apikey: bscKey
    });

    const url = `https://api.etherscan.io/v2/api?${qs.toString()}`;
    const r = await fetch(url);
    const data = await r.json();

    if (data.status !== "1" && data.message !== "No transactions found") {
      return res.status(502).json({ ok: false, error: "BscScan error", data });
    }

    const list = Array.isArray(data.result) ? data.result : [];

    // 4) Фільтр: incoming + містить KEY у назві/символі
    const matched = list.filter((tx) => {
      const to = toLower(tx.to);
      if (to !== watchAddress) return false;

      const name = String(tx.tokenName || "");
      const symbol = String(tx.tokenSymbol || "");
      const hay = (name + " " + symbol).toUpperCase();

      return hay.includes("KEY");
    });

    let posted = 0;
    let skippedDuplicate = 0;

    // 5) Дедуп через KV: ключ = txHash:logIndex
    for (const tx of matched) {
      const txHash = tx.hash;
      const logIndex = String(tx.logIndex ?? "0");
      const uniqueKey = `seen:${txHash}:${logIndex}`;

      const already = await kv.get(uniqueKey);
      if (already) {
        skippedDuplicate++;
        continue;
      }

      // помічаємо як опрацьоване (TTL 30 днів, щоб KV не ріс вічно)
      await kv.set(uniqueKey, 1, { ex: 60 * 60 * 24 * 30 });

      const tokenName = tx.tokenName || tx.tokenSymbol || "Unknown KEY";
      const dateStr = formatKyivDateFromUnixSeconds(tx.timeStamp);

      // Текст як ти просив (без лінка на tx)
      const message = `New KEY detected! Name: ${tokenName} Date: ${dateStr} Link: @cryptohornettg`;

      await sendTelegram(message);
      posted++;
    }

    return res.status(200).json({
      ok: true,
      checked: list.length,
      matched: matched.length,
      posted,
      skippedDuplicate
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
