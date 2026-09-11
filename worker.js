const DEX_CHAIN = "robinhood";
const EXPECTED_CHAIN_ID = 4663;

const V2_SWAP_TOPIC =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const V3_SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
  "access-control-allow-origin": "*",
};

function json(data, status = 200, cacheSeconds = 0) {
  const headers = new Headers(JSON_HEADERS);
  headers.set(
    "cache-control",
    cacheSeconds > 0
      ? `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`
      : "no-store"
  );
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value || "");
}

function hexToNumber(hex) {
  if (!hex || typeof hex !== "string") return null;
  return Number.parseInt(hex, 16);
}

function toHex(n) {
  return "0x" + Math.max(0, Number(n)).toString(16);
}

function stripHexPrefix(hex) {
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
  const raw = stripHexPrefix(hex);

  try {
    if (raw.length >= 128) {
      const offset = Number.parseInt(raw.slice(0, 64), 16) * 2;
      const len = Number.parseInt(raw.slice(offset, offset + 64), 16) * 2;
      const strHex = raw.slice(offset + 64, offset + 64 + len);
      const chunks = strHex.match(/.{1,2}/g) || [];
      const bytes = new Uint8Array(chunks.map((b) => Number.parseInt(b, 16)));
      return new TextDecoder().decode(bytes).replace(/\0/g, "").trim() || null;
    }
  } catch {}

  try {
    const chunks = raw.match(/.{1,2}/g) || [];
    const bytes = new Uint8Array(chunks.map((b) => Number.parseInt(b, 16)));
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

  if (!r.ok) {
    throw new Error(`Alchemy HTTP ${r.status}`);
  }

  const body = await r.json();

  if (body.error) {
    throw new Error(
      body.error?.message || `Alchemy RPC error ${body.error?.code ?? ""}`
    );
  }

  return body.result;
}

async function ethCall(env, to, data) {
  return rpc(env, "eth_call", [{ to, data }, "latest"]);
}

async function tokenMetadata(env, address) {
  const [nameHex, symbolHex, decimalsHex, supplyHex, code] = await Promise.all([
    ethCall(env, address, "0x06fdde03").catch(() => null),
    ethCall(env, address, "0x95d89b41").catch(() => null),
    ethCall(env, address, "0x313ce567").catch(() => null),
    ethCall(env, address, "0x18160ddd").catch(() => null),
    rpc(env, "eth_getCode", [address, "latest"]).catch(() => null),
  ]);

  const decimals = decimalsHex ? hexToNumber(decimalsHex) : null;
  const totalSupplyRaw = supplyHex ? decodeUint(supplyHex) : null;

  let totalSupply = null;
  if (
    totalSupplyRaw !== null &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= 36
  ) {
    try {
      const n = BigInt(totalSupplyRaw);
      const base = 10n ** BigInt(decimals);
      const whole = n / base;
      const frac = (n % base)
        .toString()
        .padStart(decimals, "0")
        .replace(/0+$/, "");
      totalSupply = frac ? `${whole}.${frac}` : whole.toString();
    } catch {}
  }

  return {
    address,
    isContract: Boolean(code && code !== "0x"),
    name: nameHex ? decodeString(nameHex) : null,
    symbol: symbolHex ? decodeString(symbolHex) : null,
    decimals,
    totalSupplyRaw,
    totalSupply,
  };
}

async function dexTokenPairs(address) {
  const r = await fetch(
    `https://api.dexscreener.com/token-pairs/v1/${DEX_CHAIN}/${address}`,
    { headers: { accept: "application/json" } }
  );

  if (!r.ok) throw new Error(`DEX Screener HTTP ${r.status}`);

  const body = await r.json();
  const pairs = Array.isArray(body) ? body : [];

  // STRICT: never fall back to another chain.
  return pairs.filter(
    (p) => String(p.chainId || "").toLowerCase() === DEX_CHAIN
  );
}

async function dexPairByPool(poolAddress) {
  const r = await fetch(
    `https://api.dexscreener.com/latest/dex/pairs/${DEX_CHAIN}/${poolAddress}`,
    { headers: { accept: "application/json" } }
  );

  if (!r.ok) throw new Error(`DEX Screener HTTP ${r.status}`);

  const body = await r.json();
  const pairs = Array.isArray(body?.pairs) ? body.pairs : [];

  return (
    pairs.find(
      (p) =>
        String(p.chainId || "").toLowerCase() === DEX_CHAIN &&
        String(p.pairAddress || "").toLowerCase() ===
          String(poolAddress).toLowerCase()
    ) || null
  );
}

function bestPair(pairs) {
  if (!pairs?.length) return null;

  return [...pairs].sort((a, b) => {
    const la = Number(a.liquidity?.usd || 0);
    const lb = Number(b.liquidity?.usd || 0);
    if (lb !== la) return lb - la;

    const va = Number(a.volume?.h24 || 0);
    const vb = Number(b.volume?.h24 || 0);
    return vb - va;
  })[0];
}

function txCount(bucket) {
  return Number(bucket?.buys || 0) + Number(bucket?.sells || 0);
}

function safeRatio(a, b) {
  const x = Number(a || 0);
  const y = Number(b || 0);
  if (y <= 0) return x > 0 ? null : 0;
  return x / y;
}

function marketSignals(p, recentSwapLogs = null, sizeUsd = null) {
  if (!p) return null;

  const v5 = Number(p.volume?.m5 || 0);
  const v1 = Number(p.volume?.h1 || 0);
  const t5 = txCount(p.txns?.m5);
  const t1 = txCount(p.txns?.h1);
  const buys5 = Number(p.txns?.m5?.buys || 0);
  const sells5 = Number(p.txns?.m5?.sells || 0);
  const liquidity = Number(p.liquidity?.usd || 0);
  const pc5 = Number(p.priceChange?.m5 || 0);
  const pc1 = Number(p.priceChange?.h1 || 0);

  const volumeAcceleration = safeRatio(v5 * 12, v1);
  const txAcceleration = safeRatio(t5 * 12, t1);
  const buyShare5m =
    buys5 + sells5 > 0 ? buys5 / (buys5 + sells5) : null;

  let timing = "NEUTRAL";
  if (pc5 >= 25 || pc1 >= 80) timing = "EXTENDED";
  else if (
    volumeAcceleration !== null &&
    volumeAcceleration >= 1.5 &&
    txAcceleration !== null &&
    txAcceleration >= 1.25 &&
    (buyShare5m === null || buyShare5m >= 0.52)
  ) {
    timing = pc5 <= 15 ? "EARLY_ACCELERATION" : "ACTIVE";
  }

  let liquidityGrade = "VERY_LOW";
  if (liquidity >= 100000) liquidityGrade = "HIGH";
  else if (liquidity >= 25000) liquidityGrade = "GOOD";
  else if (liquidity >= 10000) liquidityGrade = "MEDIUM";
  else if (liquidity >= 3000) liquidityGrade = "LOW";

  const size = sizeUsd !== null ? Math.max(0, Number(sizeUsd) || 0) : null;
  const sizeVsLiquidityPct =
    size !== null && liquidity > 0 ? (size / liquidity) * 100 : null;

  let exitRiskProxy = null;
  if (sizeVsLiquidityPct !== null) {
    if (sizeVsLiquidityPct <= 0.25) exitRiskProxy = "LOW";
    else if (sizeVsLiquidityPct <= 0.75) exitRiskProxy = "MODERATE";
    else if (sizeVsLiquidityPct <= 1.5) exitRiskProxy = "HIGH";
    else exitRiskProxy = "VERY_HIGH";
  }

  return {
    recentSwapLogs,
    volumeAcceleration5mVs1hPace: volumeAcceleration,
    txAcceleration5mVs1hPace: txAcceleration,
    buyShare5m,
    timingHint: timing,
    liquidityGrade,
    sizeUsd: size,
    sizeVsLiquidityPct,
    exitRiskProxy,
    warning:
      "sizeVsLiquidityPct is only a rough exit-risk proxy, NOT executable slippage. A route quote is still required before a trade.",
  };
}

function simplifyPair(p, recentSwapLogs = null, sizeUsd = null) {
  if (!p) return null;

  return {
    chainId: p.chainId ?? null,
    dexId: p.dexId ?? null,
    pairAddress: p.pairAddress ?? null,
    labels: p.labels ?? null,
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
    signals: marketSignals(p, recentSwapLogs, sizeUsd),
  };
}

async function recentSwapPoolCounts(env, blocksBack = 2400) {
  const latestHex = await rpc(env, "eth_blockNumber");
  const latest = hexToNumber(latestHex);

  const requested = Math.min(Math.max(Number(blocksBack) || 100, 10), 200);
  const first = Math.max(0, latest - requested + 1);

  const chunkSize = 10;
  const ranges = [];
  for (let start = first; start <= latest; start += chunkSize) {
    ranges.push([start, Math.min(start + chunkSize - 1, latest)]);
  }

  const batches = await Promise.all(
    ranges.map(async ([fromBlock, toBlock]) => {
      const logs = await rpc(env, "eth_getLogs", [
        {
          fromBlock: toHex(fromBlock),
          toBlock: toHex(toBlock),
          topics: [[V2_SWAP_TOPIC, V3_SWAP_TOPIC]],
        },
      ]);
      return Array.isArray(logs) ? logs : [];
    })
  );

  const allLogs = batches.flat();

  const pools = new Map();

  for (const log of allLogs) {
    const address = String(log.address || "").toLowerCase();
    if (!isAddress(address)) continue;

    const current = pools.get(address) || {
      poolAddress: address,
      swapLogs: 0,
      firstSeenBlock: null,
      lastSeenBlock: null,
    };

    const bn = hexToNumber(log.blockNumber);
    current.swapLogs += 1;
    if (current.firstSeenBlock === null || bn < current.firstSeenBlock) {
      current.firstSeenBlock = bn;
    }
    if (current.lastSeenBlock === null || bn > current.lastSeenBlock) {
      current.lastSeenBlock = bn;
    }

    pools.set(address, current);
  }

  return {
    latestBlock: latest,
    fromBlock: first,
    blocksScanned: latest - first + 1,
    matchedSwapLogs: allLogs.length,
    pools: [...pools.values()].sort((a, b) => b.swapLogs - a.swapLogs),
  };
}

async function scanMomentum(env, url) {
  const blocks = Math.min(
    Math.max(Number(url.searchParams.get("blocks") || 100), 10),
    200
  );
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || 12), 1),
    20
  );
  const minLiquidity = Math.max(
    Number(url.searchParams.get("minLiquidity") || 1000),
    0
  );
  const sizeUsd = url.searchParams.has("sizeUsd")
    ? Number(url.searchParams.get("sizeUsd"))
    : null;

  const activity = await recentSwapPoolCounts(env, blocks);

  // Take the busiest pools first, then enrich only a bounded set.
  const shortlist = activity.pools.slice(0, Math.min(limit * 3, 30));

  const enriched = await Promise.all(
    shortlist.map(async (item) => {
      const pair = await dexPairByPool(item.poolAddress).catch(() => null);
      if (!pair) return null;

      const liquidity = Number(pair.liquidity?.usd || 0);
      if (liquidity < minLiquidity) return null;

      return {
        poolAddress: item.poolAddress,
        recentSwapLogs: item.swapLogs,
        pair: simplifyPair(pair, item.swapLogs, sizeUsd),
      };
    })
  );

  const candidates = enriched
    .filter(Boolean)
    .sort((a, b) => {
      const aSig = a.pair?.signals || {};
      const bSig = b.pair?.signals || {};

      const aEarly =
        aSig.timingHint === "EARLY_ACCELERATION"
          ? 3
          : aSig.timingHint === "ACTIVE"
          ? 2
          : aSig.timingHint === "EXTENDED"
          ? 0
          : 1;
      const bEarly =
        bSig.timingHint === "EARLY_ACCELERATION"
          ? 3
          : bSig.timingHint === "ACTIVE"
          ? 2
          : bSig.timingHint === "EXTENDED"
          ? 0
          : 1;

      if (bEarly !== aEarly) return bEarly - aEarly;

      const va = Number(aSig.volumeAcceleration5mVs1hPace || 0);
      const vb = Number(bSig.volumeAcceleration5mVs1hPace || 0);
      if (vb !== va) return vb - va;

      return b.recentSwapLogs - a.recentSwapLogs;
    })
    .slice(0, limit);

  return {
    service: "MONSTER LIVE FEED",
    status: "ONLINE",
    network: "Robinhood Chain",
    chainId: EXPECTED_CHAIN_ID,
    mode: "RECENT_SWAP_SCAN",
    latestBlock: activity.latestBlock,
    fromBlock: activity.fromBlock,
    blocksScanned: activity.blocksScanned,
    matchedSwapLogs: activity.matchedSwapLogs,
    activePoolsDetected: activity.pools.length,
    returnedCandidates: candidates.length,
    parameters: {
      blocks,
      limit,
      minLiquidity,
      sizeUsd,
    },
    candidates,
    checkedAt: new Date().toISOString(),
    notes: [
      "Discovery is based on the most recent Robinhood Chain blocks and canonical V2/V3 Swap event signatures. On Alchemy Free, log queries are automatically split into 10-block batches.",
      "DEX Screener is used only to enrich discovered Robinhood pools with price/liquidity/volume/transaction windows.",
      "This is a momentum discovery feed, not a trade approval. Security, executable quote/slippage, contract risk, and structure still require Monster Trading validation.",
    ],
  };
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

        const chainId = hexToNumber(chainIdHex);

        return json({
          service: "MONSTER LIVE FEED",
          status: chainId === EXPECTED_CHAIN_ID ? "ONLINE" : "WRONG_NETWORK",
          network: "Robinhood Chain",
          blockNumber: hexToNumber(blockHex),
          chainIdHex,
          chainId,
          expectedChainId: EXPECTED_CHAIN_ID,
          checkedAt: new Date().toISOString(),
          endpoints: {
            health: "/health",
            scan: "/scan?blocks=100&limit=12&minLiquidity=1000&sizeUsd=200",
            token: "/token/0x...",
            market: "/market/0x...",
            snapshot: "/snapshot/0x...?sizeUsd=200",
          },
          note:
            "Read-only feed. No private keys, signing, swaps, or transaction execution.",
        });
      }

      if (url.pathname === "/scan") {
        const result = await scanMomentum(env, url);
        return json(result, 200, 10);
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
        const pairs = await dexTokenPairs(address);
        const best = bestPair(pairs);
        const sizeUsd = url.searchParams.has("sizeUsd")
          ? Number(url.searchParams.get("sizeUsd"))
          : null;

        return json({
          service: "MONSTER LIVE FEED",
          network: "Robinhood Chain",
          contract: address,
          bestPair: best ? simplifyPair(best, null, sizeUsd) : null,
          pairs: pairs.slice(0, 20).map((p) => simplifyPair(p, null, sizeUsd)),
          pairCount: pairs.length,
          checkedAt: new Date().toISOString(),
          caveat:
            "Only chainId=robinhood pairs are accepted. Liquidity USD is not the same as executable depth or guaranteed slippage.",
        });
      }

      if (route === "snapshot") {
        const sizeUsd = url.searchParams.has("sizeUsd")
          ? Number(url.searchParams.get("sizeUsd"))
          : null;

        const [meta, pairs, blockHex, chainIdHex] = await Promise.all([
          tokenMetadata(env, address),
          dexTokenPairs(address),
          rpc(env, "eth_blockNumber"),
          rpc(env, "eth_chainId"),
        ]);

        const best = bestPair(pairs);
        const chainId = hexToNumber(chainIdHex);

        return json({
          service: "MONSTER LIVE FEED",
          status: chainId === EXPECTED_CHAIN_ID ? "ONLINE" : "WRONG_NETWORK",
          network: "Robinhood Chain",
          chainId,
          blockNumber: hexToNumber(blockHex),
          token: meta,
          market: {
            bestPair: best ? simplifyPair(best, null, sizeUsd) : null,
            pairCount: pairs.length,
          },
          checkedAt: new Date().toISOString(),
          tradingNotes: {
            chainSafety:
              "Market data is strictly filtered to DexScreener chainId=robinhood; no cross-chain fallback is allowed.",
            buyersVsSellers:
              "DEX Screener transaction counts are useful flow signals but are not guaranteed unique wallets.",
            slippage:
              "sizeVsLiquidityPct is only a rough risk proxy. It is NOT a route-specific executable quote.",
            security:
              "This endpoint confirms contract bytecode/metadata and market context, but does not prove honeypot/tax/blacklist/admin safety. Monster Trading must run separate security checks before entry.",
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
