const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "");
}

function hexToNumber(hex) {
  if (!hex || typeof hex !== "string") return null;
  return Number.parseInt(hex, 16);
}

function hexToBigIntString(hex) {
  try {
    return BigInt(hex).toString();
  } catch {
    return null;
  }
}

function stripHexPadding(hex) {
  return (hex || "").replace(/^0x/, "");
}

function decodeUint(hex) {
  try {
    return BigInt(hex).toString();
  } catch {
    return null;
  }
}

function decodeString(hex) {
  if (!hex || hex === "0x") return null;
  const raw = stripHexPadding(hex);

  // Standard ABI dynamic string
  try {
    if (raw.length >= 128) {
      const offset = Number.parseInt(raw.slice(0, 64), 16) * 2;
      const len = Number.parseInt(raw.slice(offset, offset + 64), 16) * 2;
      const strHex = raw.slice(offset + 64, offset + 64 + len);
      const bytes = new Uint8Array(strHex.match(/.{1,2}/g).map((b) => Number.parseInt(b, 16)));
      return new TextDecoder().decode(bytes).replace(/\0/g, "").trim() || null;
    }
  } catch {}

  // bytes32 fallback
  try {
    const bytes = new Uint8Array(raw.match(/.{1,2}/g).map((b) => Number.parseInt(b, 16)));
    return new TextDecoder().decode(bytes).replace(/\0/g, "").trim() || null;
  } catch {
    return null;
  }
}

async function rpc(env, method, params = []) {
  if (!env.ALCHEMY_RPC_URL) {
    throw new Error("Missing ALCHEMY_RPC_URL secret");
  }

  const r = await fetch(env.ALCHEMY_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });

  if (!r.ok) throw new Error(`Alchemy HTTP ${r.status}`);

  const body = await r.json();
  if (body.error) throw new Error(body.error.message || "Alchemy RPC error");
  return body.result;
}

async function ethCall(env, to, data) {
  return rpc(env, "eth_call", [{ to, data }, "latest"]);
}

async function tokenMetadata(env, address) {
  const [nameHex, symbolHex, decimalsHex, supplyHex] = await Promise.all([
    ethCall(env, address, "0x06fdde03").catch(() => null), // name()
    ethCall(env, address, "0x95d89b41").catch(() => null), // symbol()
    ethCall(env, address, "0x313ce567").catch(() => null), // decimals()
    ethCall(env, address, "0x18160ddd").catch(() => null), // totalSupply()
  ]);

  const decimals = decimalsHex ? hexToNumber(decimalsHex) : null;
  const totalSupplyRaw = supplyHex ? decodeUint(supplyHex) : null;

  let totalSupply = null;
  if (totalSupplyRaw !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36) {
    try {
      const n = BigInt(totalSupplyRaw);
      const base = 10n ** BigInt(decimals);
      const whole = n / base;
      const frac = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "");
      totalSupply = frac ? `${whole}.${frac}` : whole.toString();
    } catch {}
  }

  return {
    address,
    name: nameHex ? decodeString(nameHex) : null,
    symbol: symbolHex ? decodeString(symbolHex) : null,
    decimals,
    totalSupplyRaw,
    totalSupply,
  };
}

async function dexPairs(address) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
    headers: { "accept": "application/json" },
  });

  if (!r.ok) throw new Error(`DEX Screener HTTP ${r.status}`);
  const body = await r.json();

  const pairs = Array.isArray(body.pairs) ? body.pairs : [];
  const rhPairs = pairs.filter((p) =>
    String(p.chainId || "").toLowerCase().includes("robinhood")
  );

  // Prefer RH-specific pairs if DEX Screener labels them; otherwise return all
  // pairs so the caller can see the chainId and avoid false assumptions.
  return rhPairs.length ? rhPairs : pairs;
}

function simplifyPair(p) {
  return {
    chainId: p.chainId ?? null,
    dexId: p.dexId ?? null,
    pairAddress: p.pairAddress ?? null,
    url: p.url ?? null,
    baseToken: p.baseToken ?? null,
    quoteToken: p.quoteToken ?? null,
    priceNative: p.priceNative ?? null,
    priceUsd: p.priceUsd ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    fdv: p.fdv ?? null,
    marketCap: p.marketCap ?? null,
    volume: {
      m5: p.volume?.m5 ?? null,
      h1: p.volume?.h1 ?? null,
      h6: p.volume?.h6 ?? null,
      h24: p.volume?.h24 ?? null,
    },
    priceChange: {
      m5: p.priceChange?.m5 ?? null,
      h1: p.priceChange?.h1 ?? null,
      h6: p.priceChange?.h6 ?? null,
      h24: p.priceChange?.h24 ?? null,
    },
    txns: {
      m5: p.txns?.m5 ?? null,
      h1: p.txns?.h1 ?? null,
      h6: p.txns?.h6 ?? null,
      h24: p.txns?.h24 ?? null,
    },
    pairCreatedAt: p.pairCreatedAt ?? null,
  };
}

function bestPair(pairs) {
  if (!pairs.length) return null;
  return [...pairs].sort((a, b) => {
    const la = Number(a.liquidity?.usd || 0);
    const lb = Number(b.liquidity?.usd || 0);
    if (lb !== la) return lb - la;
    const va = Number(a.volume?.h24 || 0);
    const vb = Number(b.volume?.h24 || 0);
    return vb - va;
  })[0];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    if (request.method !== "GET") {
      return json({ error: "Method Not Allowed" }, 405);
    }

    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        const [blockHex, chainIdHex] = await Promise.all([
          rpc(env, "eth_blockNumber"),
          rpc(env, "eth_chainId"),
        ]);

        return json({
          service: "MONSTER LIVE FEED",
          status: "ONLINE",
          network: "Robinhood Chain",
          blockNumber: hexToNumber(blockHex),
          chainIdHex,
          chainId: hexToNumber(chainIdHex),
          checkedAt: new Date().toISOString(),
          endpoints: {
            health: "/health",
            token: "/token/0x...",
            market: "/market/0x...",
            snapshot: "/snapshot/0x...",
          },
          note: "Read-only feed. No private keys, signing, swaps, or transaction execution.",
        });
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 2) {
        return json({ error: "Not found" }, 404);
      }

      const [route, address] = parts;
      if (!isAddress(address)) {
        return json({ error: "Invalid EVM contract address" }, 400);
      }

      if (route === "token") {
        const meta = await tokenMetadata(env, address);
        return json({
          service: "MONSTER LIVE FEED",
          network: "Robinhood Chain",
          token: meta,
          checkedAt: new Date().toISOString(),
        });
      }

      if (route === "market") {
        const pairs = await dexPairs(address);
        const best = bestPair(pairs);

        return json({
          service: "MONSTER LIVE FEED",
          network: "Robinhood Chain",
          contract: address,
          bestPair: best ? simplifyPair(best) : null,
          pairs: pairs.slice(0, 20).map(simplifyPair),
          pairCount: pairs.length,
          checkedAt: new Date().toISOString(),
          caveat:
            "DEX Screener data is third-party market data. Verify chainId/pair before acting. Liquidity USD is not the same as executable depth or guaranteed slippage.",
        });
      }

      if (route === "snapshot") {
        const [meta, pairs, blockHex] = await Promise.all([
          tokenMetadata(env, address),
          dexPairs(address),
          rpc(env, "eth_blockNumber"),
        ]);

        const best = bestPair(pairs);

        return json({
          service: "MONSTER LIVE FEED",
          status: "ONLINE",
          network: "Robinhood Chain",
          blockNumber: hexToNumber(blockHex),
          token: meta,
          market: {
            bestPair: best ? simplifyPair(best) : null,
            pairCount: pairs.length,
          },
          checkedAt: new Date().toISOString(),
          tradingNotes: {
            buyersVsSellers:
              "Uses DEX Screener transaction counts when available; these are not guaranteed unique wallets.",
            slippage:
              "Not estimated by this endpoint. A route-specific executable quote is required before approving a trade.",
            security:
              "This endpoint does not prove honeypot/tax/blacklist/admin safety. Monster Trading must run separate safety checks before entry.",
          },
        });
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json(
        {
          service: "MONSTER LIVE FEED",
          status: "ERROR",
          message: error?.message || String(error),
          checkedAt: new Date().toISOString(),
        },
        500
      );
    }
  },
};
