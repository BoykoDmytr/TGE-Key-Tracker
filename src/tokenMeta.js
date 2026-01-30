import { Contract, getAddress } from "ethers";

/**
 * Caching token metadata to avoid repeated eth_call.
 */
const cache = new Map(); // tokenAddress -> Promise<meta>

const ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
];

/**
 * Some tokens return bytes32 for symbol/name (old style). We'll attempt fallback.
 */
const ABI_BYTES32 = [
  "function symbol() view returns (bytes32)",
  "function name() view returns (bytes32)"
];

function bytes32ToString(b) {
  // b is hex string like 0x414243...
  if (!b || typeof b !== "string") return null;
  try {
    const hex = b.startsWith("0x") ? b.slice(2) : b;
    const buf = Buffer.from(hex, "hex");
    const str = buf.toString("utf8").replace(/\u0000/g, "").trim();
    return str || null;
  } catch {
    return null;
  }
}

export async function getTokenMetaCached(provider, tokenAddress) {
  const addr = getAddress(tokenAddress);
  if (cache.has(addr)) return cache.get(addr);

  const p = (async () => {
    const meta = { address: addr, symbol: null, name: null, decimals: null };

    // 1) Try normal string returns
    try {
      const c = new Contract(addr, ABI, provider);
      meta.symbol = await safeCall(() => c.symbol());
      meta.name = await safeCall(() => c.name());
      meta.decimals = await safeCall(() => c.decimals());
      return meta;
    } catch {
      // continue fallback
    }

    // 2) Try bytes32 fallback for symbol/name
    try {
      const c2 = new Contract(addr, ABI_BYTES32, provider);
      const symB = await safeCall(() => c2.symbol());
      const nameB = await safeCall(() => c2.name());
      meta.symbol = bytes32ToString(symB);
      meta.name = bytes32ToString(nameB);
    } catch {
      // ignore
    }

    // decimals might still be fetchable even if symbol/name isn't
    try {
      const c3 = new Contract(addr, ["function decimals() view returns (uint8)"], provider);
      meta.decimals = await safeCall(() => c3.decimals());
    } catch {
      // ignore
    }

    return meta;
  })();

  cache.set(addr, p);
  return p;
}

async function safeCall(fn) {
  try {
    const v = await fn();
    if (v == null) return null;
    return v;
  } catch {
    return null;
  }
}
