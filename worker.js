const DEX_CHAIN = "robinhood";
const EXPECTED_CHAIN_ID = 4663;

const V2_SWAP_TOPIC =
  "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const V3_SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const V4_SWAP_TOPIC =
  "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const V4_INITIALIZE_TOPIC =
  "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
const V4_MODIFY_LIQUIDITY_TOPIC =
  "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";
const V2_PAIR_CREATED_TOPIC =
  "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";
const V3_POOL_CREATED_TOPIC =
  "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118";

const V2_BURN_TOPIC =
  "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496";
const V3_BURN_TOPIC =
  "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c";

const UNISWAP_V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const UNISWAP_V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";
const UNISWAP_QUOTER_V2 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";

// Canonical Uniswap v4 deployment on Robinhood Chain (chainId 4663).
const UNISWAP_V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const UNISWAP_V4_STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b";
const UNISWAP_V4_QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";
const UNISWAP_V4_DEPLOY_BLOCK = 9070;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ROBINHOOD_BLOCKSCOUT = "https://robinhoodchain.blockscout.com";

const QUOTE_EXACT_INPUT_SINGLE_SELECTOR = "0xc6a5026a";
const BALANCE_OF_SELECTOR = "0x70a08231";
const TOKEN0_SELECTOR = "0x0dfe1681";
const TOKEN1_SELECTOR = "0xd21220a7";
const FACTORY_SELECTOR = "0xc45a0155";
const GET_RESERVES_SELECTOR = "0x0902f1ac";
const V3_LIQUIDITY_SELECTOR = "0x1a686502";
const V3_FEE_SELECTOR = "0xddca3f43";
const V4_GET_LIQUIDITY_SELECTOR = "0xfa6793d5";
const V4_GET_SLOT0_SELECTOR = "0xc815641c";
const V4_QUOTE_EXACT_INPUT_SINGLE_SELECTOR = "0xaa9d21cb";

const liquidityMemory = new Map();
const v4PoolKeyMemory = new Map();

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

function isBytes32(value) {
  return /^0x[a-fA-F0-9]{64}$/.test(value || "");
}

function isPoolIdentifier(value) {
  return isAddress(value) || isBytes32(value);
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


function hexWord(hex, index = 0) {
  const raw = stripHexPrefix(hex);
  const start = index * 64;
  if (raw.length < start + 64) return null;
  return raw.slice(start, start + 64);
}

function decodeAddress(hex) {
  const word = hexWord(hex, 0);
  if (!word) return null;
  const address = "0x" + word.slice(24);
  return isAddress(address) ? address.toLowerCase() : null;
}

function wordAddress(address) {
  return stripHexPrefix(address).toLowerCase().padStart(64, "0");
}

function wordUint(value) {
  try {
    return BigInt(value).toString(16).padStart(64, "0");
  } catch {
    return null;
  }
}

function decodeBigIntWord(hex, index = 0) {
  const word = hexWord(hex, index);
  if (!word) return null;
  try {
    return BigInt("0x" + word);
  } catch {
    return null;
  }
}

function decodeSignedBigIntWord(hex, index = 0) {
  const word = hexWord(hex, index);
  if (!word) return null;
  try {
    let value = BigInt("0x" + word);
    if (value >= (1n << 255n)) value -= 1n << 256n;
    return value;
  } catch {
    return null;
  }
}

function signedWord(value) {
  try {
    let n = BigInt(value);
    if (n < 0n) n = (1n << 256n) + n;
    if (n < 0n || n >= (1n << 256n)) return null;
    return n.toString(16).padStart(64, "0");
  } catch {
    return null;
  }
}

function indexedAddress(topic) {
  const raw = stripHexPrefix(topic);
  if (raw.length !== 64) return null;
  const address = "0x" + raw.slice(24);
  return isAddress(address) ? address.toLowerCase() : null;
}

function unitsToNumber(rawValue, decimals) {
  try {
    const raw = BigInt(rawValue);
    const d = Number(decimals);
    if (!Number.isInteger(d) || d < 0 || d > 36) return null;

    const base = 10n ** BigInt(d);
    const whole = raw / base;
    const fracDigits = Math.min(d, 12);
    const frac = (raw % base)
      .toString()
      .padStart(d, "0")
      .slice(0, fracDigits);

    return Number(frac ? `${whole}.${frac}` : whole.toString());
  } catch {
    return null;
  }
}

function humanToUnits(value, decimals) {
  const n = Number(value);
  const d = Number(decimals);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(d) || d < 0 || d > 36) {
    return null;
  }

  if (n >= 1e21) return null;

  const precision = Math.min(d, 12);
  const fixed = n.toFixed(precision);
  const [whole, frac = ""] = fixed.split(".");

  try {
    const wholeUnits = BigInt(whole) * 10n ** BigInt(d);
    const fracUnits =
      d > 0
        ? BigInt((frac + "0".repeat(d)).slice(0, d) || "0")
        : 0n;
    return wholeUnits + fracUnits;
  } catch {
    return null;
  }
}

function bigIntDropPct(firstValue, lastValue) {
  try {
    const first = BigInt(firstValue);
    const last = BigInt(lastValue);
    if (first <= 0n || last >= first) return 0;
    const bps = Number(((first - last) * 10000n) / first);
    return bps / 100;
  } catch {
    return null;
  }
}

function pctDrop(first, last) {
  const a = Number(first);
  const b = Number(last);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b >= a) return 0;
  return ((a - b) / a) * 100;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function memoryObservation(poolAddress) {
  const key = String(poolAddress || "").toLowerCase();
  const item = liquidityMemory.get(key);
  if (!item) return null;
  if (Date.now() - item.at > 15 * 60 * 1000) {
    liquidityMemory.delete(key);
    return null;
  }
  return item;
}

function storeMemoryObservation(poolAddress, observation) {
  const key = String(poolAddress || "").toLowerCase();
  liquidityMemory.set(key, { ...observation, at: Date.now() });

  if (liquidityMemory.size > 250) {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [k, v] of liquidityMemory.entries()) {
      if (v.at < cutoff) liquidityMemory.delete(k);
    }
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


async function tokenDecimals(env, address) {
  const result = await ethCall(env, address, "0x313ce567").catch(() => null);
  return result ? hexToNumber(result) : null;
}

async function currencyDecimals(env, address) {
  if (String(address || "").toLowerCase() === ZERO_ADDRESS) return 18;
  return tokenDecimals(env, address);
}

async function tokenBalanceRaw(env, token, owner) {
  const data = BALANCE_OF_SELECTOR + wordAddress(owner);
  const result = await ethCall(env, token, data).catch(() => null);
  const value = result ? decodeBigIntWord(result, 0) : null;
  return value === null ? null : value.toString();
}

async function poolOnchainState(env, poolAddress) {
  const [token0Hex, token1Hex, factoryHex, reservesHex, liquidityHex, feeHex, code] =
    await Promise.all([
      ethCall(env, poolAddress, TOKEN0_SELECTOR).catch(() => null),
      ethCall(env, poolAddress, TOKEN1_SELECTOR).catch(() => null),
      ethCall(env, poolAddress, FACTORY_SELECTOR).catch(() => null),
      ethCall(env, poolAddress, GET_RESERVES_SELECTOR).catch(() => null),
      ethCall(env, poolAddress, V3_LIQUIDITY_SELECTOR).catch(() => null),
      ethCall(env, poolAddress, V3_FEE_SELECTOR).catch(() => null),
      rpc(env, "eth_getCode", [poolAddress, "latest"]).catch(() => null),
    ]);

  const token0 = token0Hex ? decodeAddress(token0Hex) : null;
  const token1 = token1Hex ? decodeAddress(token1Hex) : null;
  const factory = factoryHex ? decodeAddress(factoryHex) : null;

  let protocol = "UNKNOWN";
  let reserve0 = null;
  let reserve1 = null;
  let activeLiquidity = null;
  let fee = null;

  if (reservesHex && stripHexPrefix(reservesHex).length >= 192) {
    const r0 = decodeBigIntWord(reservesHex, 0);
    const r1 = decodeBigIntWord(reservesHex, 1);
    if (r0 !== null && r1 !== null) {
      protocol = "V2";
      reserve0 = r0.toString();
      reserve1 = r1.toString();
    }
  }

  if (protocol === "UNKNOWN" && liquidityHex && feeHex) {
    const l = decodeBigIntWord(liquidityHex, 0);
    const f = decodeBigIntWord(feeHex, 0);
    if (l !== null && f !== null) {
      protocol = "V3";
      activeLiquidity = l.toString();
      fee = Number(f);
    }
  }

  let token0Balance = null;
  let token1Balance = null;

  if (token0 && token1) {
    [token0Balance, token1Balance] = await Promise.all([
      tokenBalanceRaw(env, token0, poolAddress),
      tokenBalanceRaw(env, token1, poolAddress),
    ]);
  }

  const canonical =
    protocol === "V2"
      ? factory === UNISWAP_V2_FACTORY
      : protocol === "V3"
      ? factory === UNISWAP_V3_FACTORY
      : false;

  return {
    poolAddress: poolAddress.toLowerCase(),
    hasCode: Boolean(code && code !== "0x"),
    protocol,
    factory,
    canonicalUniswap: canonical,
    token0,
    token1,
    reserve0,
    reserve1,
    activeLiquidity,
    fee,
    token0Balance,
    token1Balance,
  };
}


function isV4Pair(pair) {
  return Array.isArray(pair?.labels) &&
    pair.labels.some((x) => String(x || "").toLowerCase() === "v4");
}

function v4PoolKeyCacheGet(poolId) {
  const key = String(poolId || "").toLowerCase();
  const item = v4PoolKeyMemory.get(key);
  if (!item) return null;
  if (Date.now() - item.at > 6 * 60 * 60 * 1000) {
    v4PoolKeyMemory.delete(key);
    return null;
  }
  return item.poolKey;
}

function v4PoolKeyCacheSet(poolId, poolKey) {
  const key = String(poolId || "").toLowerCase();
  v4PoolKeyMemory.set(key, { poolKey, at: Date.now() });
  if (v4PoolKeyMemory.size > 250) {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    for (const [k, v] of v4PoolKeyMemory.entries()) {
      if (v.at < cutoff) v4PoolKeyMemory.delete(k);
    }
  }
}

function decodeV4InitializeLog(log) {
  const poolId = String(log?.topics?.[1] || "").toLowerCase();
  const currency0 = indexedAddress(log?.topics?.[2]);
  const currency1 = indexedAddress(log?.topics?.[3]);
  if (!isBytes32(poolId) || !currency0 || !currency1) return null;

  const feeRaw = decodeBigIntWord(log?.data, 0);
  const tickSpacingRaw = decodeSignedBigIntWord(log?.data, 1);
  const hooksWord = hexWord(log?.data, 2);
  const hooks = hooksWord ? "0x" + hooksWord.slice(24) : null;
  if (feeRaw === null || tickSpacingRaw === null || !isAddress(hooks)) return null;

  return {
    poolId,
    currency0,
    currency1,
    fee: Number(feeRaw),
    tickSpacing: Number(tickSpacingRaw),
    hooks: hooks.toLowerCase(),
  };
}


function decodeV2PairCreatedLog(log) {
  const token0 = indexedAddress(log?.topics?.[1]);
  const token1 = indexedAddress(log?.topics?.[2]);
  const pairWord = hexWord(log?.data, 0);
  const pairAddress = pairWord ? "0x" + pairWord.slice(24) : null;
  if (!token0 || !token1 || !isAddress(pairAddress)) return null;
  return {
    poolAddress: pairAddress.toLowerCase(),
    protocol: "V2",
    token0,
    token1,
    fee: 3000,
    tickSpacing: null,
    hooks: null,
  };
}

function decodeV3PoolCreatedLog(log) {
  const token0 = indexedAddress(log?.topics?.[1]);
  const token1 = indexedAddress(log?.topics?.[2]);
  const feeTopic = String(log?.topics?.[3] || "");
  const fee = feeTopic ? hexToNumber(feeTopic) : null;
  const tickSpacingRaw = decodeSignedBigIntWord(log?.data, 0);
  const poolWord = hexWord(log?.data, 1);
  const poolAddress = poolWord ? "0x" + poolWord.slice(24) : null;
  if (!token0 || !token1 || !isAddress(poolAddress)) return null;
  return {
    poolAddress: poolAddress.toLowerCase(),
    protocol: "V3",
    token0,
    token1,
    fee: Number.isFinite(fee) ? fee : null,
    tickSpacing: tickSpacingRaw === null ? null : Number(tickSpacingRaw),
    hooks: null,
  };
}

async function blockscoutV4PoolKey(poolId, maxPages = 12) {
  let next = null;
  const id = String(poolId || "").toLowerCase();
  if (!isBytes32(id)) return null;

  for (let page = 0; page < maxPages; page += 1) {
    const qs = new URLSearchParams();
    if (next) {
      for (const [k, v] of Object.entries(next)) {
        if (v !== null && v !== undefined) qs.set(k, String(v));
      }
    }

    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const r = await fetch(
      `${ROBINHOOD_BLOCKSCOUT}/api/v2/addresses/${UNISWAP_V4_POOL_MANAGER}/logs${suffix}`,
      { headers: { accept: "application/json" } }
    ).catch(() => null);
    if (!r?.ok) return null;

    const body = await r.json().catch(() => null);
    const items = Array.isArray(body?.items) ? body.items : [];
    for (const log of items) {
      const topics = Array.isArray(log?.topics) ? log.topics : [];
      if (
        String(topics[0] || "").toLowerCase() === V4_INITIALIZE_TOPIC &&
        String(topics[1] || "").toLowerCase() === id
      ) {
        const poolKey = decodeV4InitializeLog({
          topics,
          data: log?.data,
          blockNumber: log?.block_number,
        });
        if (poolKey) return poolKey;
      }
    }

    next = body?.next_page_params || null;
    if (!next) break;
  }

  return null;
}

async function resolveV4PoolKey(env, poolId) {
  const id = String(poolId || "").toLowerCase();
  if (!isBytes32(id)) return null;

  const cached = v4PoolKeyCacheGet(id);
  if (cached) return cached;

  // First use Blockscout's paginated address-log index. This avoids large
  // eth_getLogs ranges that some RPC/free tiers reject.
  const indexedPoolKey = await blockscoutV4PoolKey(id, 12).catch(() => null);
  if (indexedPoolKey) {
    v4PoolKeyCacheSet(id, indexedPoolKey);
    return indexedPoolKey;
  }

  const latestHex = await rpc(env, "eth_blockNumber");
  const latest = hexToNumber(latestHex);

  // RPC fallback: scan the recent history in provider-friendly 10-block chunks.
  // New/gestating pools are the priority, so search newest blocks first.
  const recentFloor = Math.max(UNISWAP_V4_DEPLOY_BLOCK, latest - 5000);
  for (let end = latest; end >= recentFloor; end -= 10) {
    const start = Math.max(recentFloor, end - 9);
    const logs = await rpc(env, "eth_getLogs", [
      {
        address: UNISWAP_V4_POOL_MANAGER,
        fromBlock: toHex(start),
        toBlock: toHex(end),
        topics: [V4_INITIALIZE_TOPIC, id],
      },
    ]).catch(() => null);

    if (Array.isArray(logs) && logs.length) {
      const poolKey = decodeV4InitializeLog(logs[logs.length - 1]);
      if (poolKey) {
        v4PoolKeyCacheSet(id, poolKey);
        return poolKey;
      }
    }
  }

  // Legacy Blockscout RPC-compatible API as a final fallback.
  try {
    const qs = new URLSearchParams({
      module: "logs",
      action: "getLogs",
      fromBlock: String(UNISWAP_V4_DEPLOY_BLOCK),
      toBlock: "latest",
      address: UNISWAP_V4_POOL_MANAGER,
      topic0: V4_INITIALIZE_TOPIC,
      topic1: id,
      topic0_1_opr: "and",
    });
    const r = await fetch(`${ROBINHOOD_BLOCKSCOUT}/api?${qs.toString()}`, {
      headers: { accept: "application/json" },
    });
    if (r.ok) {
      const body = await r.json();
      const logs = Array.isArray(body?.result) ? body.result : [];
      if (logs.length) {
        const poolKey = decodeV4InitializeLog(logs[logs.length - 1]);
        if (poolKey) {
          v4PoolKeyCacheSet(id, poolKey);
          return poolKey;
        }
      }
    }
  } catch {}

  return null;
}

async function v4PoolOnchainState(env, poolId) {
  const id = String(poolId || "").toLowerCase();
  if (!isBytes32(id)) return null;

  const [liquidityHex, slot0Hex, managerCode, stateViewCode, poolKey] =
    await Promise.all([
      ethCall(env, UNISWAP_V4_STATE_VIEW, V4_GET_LIQUIDITY_SELECTOR + stripHexPrefix(id)).catch(() => null),
      ethCall(env, UNISWAP_V4_STATE_VIEW, V4_GET_SLOT0_SELECTOR + stripHexPrefix(id)).catch(() => null),
      rpc(env, "eth_getCode", [UNISWAP_V4_POOL_MANAGER, "latest"]).catch(() => null),
      rpc(env, "eth_getCode", [UNISWAP_V4_STATE_VIEW, "latest"]).catch(() => null),
      resolveV4PoolKey(env, id).catch(() => null),
    ]);

  const liquidity = liquidityHex ? decodeBigIntWord(liquidityHex, 0) : null;
  const sqrtPriceX96 = slot0Hex ? decodeBigIntWord(slot0Hex, 0) : null;
  const tick = slot0Hex ? decodeSignedBigIntWord(slot0Hex, 1) : null;
  const protocolFee = slot0Hex ? decodeBigIntWord(slot0Hex, 2) : null;
  const lpFee = slot0Hex ? decodeBigIntWord(slot0Hex, 3) : null;

  return {
    poolAddress: id,
    poolId: id,
    hasCode: Boolean(managerCode && managerCode !== "0x" && stateViewCode && stateViewCode !== "0x"),
    protocol: "V4",
    poolManager: UNISWAP_V4_POOL_MANAGER,
    stateView: UNISWAP_V4_STATE_VIEW,
    canonicalUniswap: true,
    token0: poolKey?.currency0 || null,
    token1: poolKey?.currency1 || null,
    reserve0: null,
    reserve1: null,
    activeLiquidity: liquidity === null ? null : liquidity.toString(),
    fee: poolKey?.fee ?? (lpFee === null ? null : Number(lpFee)),
    tickSpacing: poolKey?.tickSpacing ?? null,
    hooks: poolKey?.hooks ?? null,
    sqrtPriceX96: sqrtPriceX96 === null ? null : sqrtPriceX96.toString(),
    tick: tick === null ? null : Number(tick),
    protocolFee: protocolFee === null ? null : Number(protocolFee),
    token0Balance: null,
    token1Balance: null,
    poolKey: poolKey || null,
  };
}

async function recentV4LiquidityActivity(env, poolId, blocksBack = 40) {
  const latestHex = await rpc(env, "eth_blockNumber");
  const latest = hexToNumber(latestHex);
  const requested = Math.min(Math.max(Number(blocksBack) || 40, 10), 200);
  const first = Math.max(0, latest - requested + 1);

  const logs = await rpc(env, "eth_getLogs", [
    {
      address: UNISWAP_V4_POOL_MANAGER,
      fromBlock: toHex(first),
      toBlock: toHex(latest),
      topics: [V4_MODIFY_LIQUIDITY_TOPIC, String(poolId).toLowerCase()],
    },
  ]).catch(() => []);

  let removals = 0;
  let additions = 0;
  for (const log of Array.isArray(logs) ? logs : []) {
    const delta = decodeSignedBigIntWord(log?.data, 2);
    if (delta === null) continue;
    if (delta < 0n) removals += 1;
    if (delta > 0n) additions += 1;
  }

  return {
    blocksScanned: latest - first + 1,
    fromBlock: first,
    latestBlock: latest,
    totalModifyLiquidityEvents: Array.isArray(logs) ? logs.length : 0,
    additions,
    removals,
  };
}

async function recentPoolBurnActivity(env, poolAddress, blocksBack = 40) {
  const latestHex = await rpc(env, "eth_blockNumber");
  const latest = hexToNumber(latestHex);
  const requested = Math.min(Math.max(Number(blocksBack) || 40, 10), 100);
  const first = Math.max(0, latest - requested + 1);

  const ranges = [];
  for (let start = first; start <= latest; start += 10) {
    ranges.push([start, Math.min(start + 9, latest)]);
  }

  const batches = await Promise.all(
    ranges.map(async ([fromBlock, toBlock]) => {
      const logs = await rpc(env, "eth_getLogs", [
        {
          address: poolAddress,
          fromBlock: toHex(fromBlock),
          toBlock: toHex(toBlock),
          topics: [[V2_BURN_TOPIC, V3_BURN_TOPIC]],
        },
      ]).catch(() => []);
      return Array.isArray(logs) ? logs : [];
    })
  );

  const logs = batches.flat();
  let v2Burns = 0;
  let v3Burns = 0;

  for (const log of logs) {
    const topic0 = String(log?.topics?.[0] || "").toLowerCase();
    if (topic0 === V2_BURN_TOPIC) v2Burns += 1;
    if (topic0 === V3_BURN_TOPIC) v3Burns += 1;
  }

  return {
    blocksScanned: latest - first + 1,
    fromBlock: first,
    latestBlock: latest,
    totalBurnEvents: logs.length,
    v2Burns,
    v3Burns,
  };
}

function v2QuoteAmountOut(amountIn, reserveIn, reserveOut, feeBps = 30) {
  try {
    const input = BigInt(amountIn);
    const rIn = BigInt(reserveIn);
    const rOut = BigInt(reserveOut);
    if (input <= 0n || rIn <= 0n || rOut <= 0n) return null;

    const feeDenom = 10000n;
    const amountInWithFee = input * (feeDenom - BigInt(feeBps));
    return (amountInWithFee * rOut) / (rIn * feeDenom + amountInWithFee);
  } catch {
    return null;
  }
}

async function v3QuoterAmountOut(env, tokenIn, tokenOut, amountIn, fee) {
  const amountWord = wordUint(amountIn);
  const feeWord = wordUint(fee);
  if (!amountWord || !feeWord) return null;

  const data =
    QUOTE_EXACT_INPUT_SINGLE_SELECTOR +
    wordAddress(tokenIn) +
    wordAddress(tokenOut) +
    amountWord +
    feeWord +
    wordUint(0);

  const result = await ethCall(env, UNISWAP_QUOTER_V2, data).catch(() => null);
  const amountOut = result ? decodeBigIntWord(result, 0) : null;
  return amountOut === null ? null : amountOut;
}


async function v4QuoterAmountOut(env, poolKey, zeroForOne, amountIn) {
  if (!poolKey) return null;
  const amountWord = wordUint(amountIn);
  const feeWord = wordUint(poolKey.fee);
  const tickSpacingWord = signedWord(poolKey.tickSpacing);
  if (!amountWord || !feeWord || !tickSpacingWord) return null;
  if (!isAddress(poolKey.currency0) || !isAddress(poolKey.currency1) || !isAddress(poolKey.hooks)) {
    return null;
  }

  // ABI for quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))
  // The tuple is dynamic because hookData is bytes, so the outer argument is an offset.
  const tupleHead =
    wordAddress(poolKey.currency0) +
    wordAddress(poolKey.currency1) +
    feeWord +
    tickSpacingWord +
    wordAddress(poolKey.hooks) +
    wordUint(zeroForOne ? 1 : 0) +
    amountWord +
    wordUint(8 * 32);
  const emptyBytes = wordUint(0);
  const data =
    V4_QUOTE_EXACT_INPUT_SINGLE_SELECTOR +
    wordUint(32) +
    tupleHead +
    emptyBytes;

  const result = await ethCall(env, UNISWAP_V4_QUOTER, data).catch(() => null);
  const amountOut = result ? decodeBigIntWord(result, 0) : null;
  return amountOut === null ? null : amountOut;
}

async function quotePoolExit(env, targetAddress, pair, poolState, sizeUsd) {
  const baseAddress = String(pair?.baseToken?.address || "").toLowerCase();
  const quoteAddress = String(pair?.quoteToken?.address || "").toLowerCase();
  const target = String(targetAddress || "").toLowerCase();

  if (!isAddress(baseAddress) || !isAddress(quoteAddress)) {
    return { available: false, reason: "Pair token addresses unavailable" };
  }

  if (target !== baseAddress && target !== quoteAddress) {
    return { available: false, reason: "Target token is not part of selected pool" };
  }

  const priceUsdBase = Number(pair?.priceUsd || 0);
  const priceNative = Number(pair?.priceNative || 0);
  if (!(priceUsdBase > 0) || !(priceNative > 0)) {
    return { available: false, reason: "Pair price unavailable" };
  }

  const quoteUsd = priceUsdBase / priceNative;
  const targetUsd = target === baseAddress ? priceUsdBase : quoteUsd;
  if (!(targetUsd > 0)) {
    return { available: false, reason: "Could not derive target USD price" };
  }

  const tokenIn = target;
  const tokenOut = target === baseAddress ? quoteAddress : baseAddress;

  const [decimalsIn, decimalsOut] = await Promise.all([
    currencyDecimals(env, tokenIn),
    currencyDecimals(env, tokenOut),
  ]);

  if (!Number.isInteger(decimalsIn) || !Number.isInteger(decimalsOut)) {
    return { available: false, reason: "Token decimals unavailable" };
  }

  const runOne = async (usd) => {
    const amountInHuman = Number(usd) / targetUsd;
    const amountInRaw = humanToUnits(amountInHuman, decimalsIn);
    if (amountInRaw === null || amountInRaw <= 0n) return null;

    const expectedOutHuman =
      target === baseAddress
        ? amountInHuman * priceNative
        : amountInHuman / priceNative;

    let amountOutRaw = null;
    let method = null;
    let feeAssumptionBps = null;

    if (poolState.protocol === "V2" && poolState.canonicalUniswap) {
      const token0 = poolState.token0;
      if (!token0 || !poolState.reserve0 || !poolState.reserve1) return null;
      const tokenInIs0 = tokenIn === token0;
      const reserveIn = tokenInIs0 ? poolState.reserve0 : poolState.reserve1;
      const reserveOut = tokenInIs0 ? poolState.reserve1 : poolState.reserve0;
      feeAssumptionBps = 30;
      amountOutRaw = v2QuoteAmountOut(
        amountInRaw,
        reserveIn,
        reserveOut,
        feeAssumptionBps
      );
      method = "UNISWAP_V2_RESERVES";
    } else if (
      poolState.protocol === "V3" &&
      poolState.canonicalUniswap &&
      Number.isInteger(poolState.fee)
    ) {
      amountOutRaw = await v3QuoterAmountOut(
        env,
        tokenIn,
        tokenOut,
        amountInRaw,
        poolState.fee
      );
      method = "UNISWAP_V3_QUOTER_V2";
    } else if (
      poolState.protocol === "V4" &&
      poolState.canonicalUniswap &&
      poolState.poolKey
    ) {
      const currency0 = String(poolState.poolKey.currency0 || "").toLowerCase();
      const currency1 = String(poolState.poolKey.currency1 || "").toLowerCase();
      if (tokenIn !== currency0 && tokenIn !== currency1) return null;
      const zeroForOne = tokenIn === currency0;
      amountOutRaw = await v4QuoterAmountOut(
        env,
        poolState.poolKey,
        zeroForOne,
        amountInRaw
      );
      method = "UNISWAP_V4_QUOTER";
    } else {
      return null;
    }

    if (amountOutRaw === null) return null;

    const amountOutHuman = unitsToNumber(amountOutRaw, decimalsOut);
    if (!(amountOutHuman >= 0) || !(expectedOutHuman > 0)) return null;

    const impactPct = Math.max(
      0,
      ((expectedOutHuman - amountOutHuman) / expectedOutHuman) * 100
    );

    return {
      sizeUsd: Number(usd),
      amountInHuman,
      amountOutHuman,
      expectedOutHumanNoImpact: expectedOutHuman,
      estimatedPoolPriceImpactPct: impactPct,
      method,
      feeAssumptionBps,
    };
  };

  const [normal, stress] = await Promise.all([
    runOne(sizeUsd),
    runOne(Number(sizeUsd) * 2),
  ]);

  if (!normal) {
    return {
      available: false,
      reason:
        "No supported canonical V2/V3/V4 executable quote was available for this pool.",
    };
  }

  return {
    available: true,
    tokenIn,
    tokenOut,
    targetUsd,
    normal,
    stress,
    caveat:
      "This simulates pool execution only. It does not prove ERC-20 sellability and may not include token transfer taxes, blacklist logic, or router-specific effects.",
  };
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
          topics: [[V2_SWAP_TOPIC, V3_SWAP_TOPIC, V4_SWAP_TOPIC]],
        },
      ]);
      return Array.isArray(logs) ? logs : [];
    })
  );

  const allLogs = batches.flat();

  const pools = new Map();

  for (const log of allLogs) {
    const topic0 = String(log?.topics?.[0] || "").toLowerCase();
    const emitter = String(log.address || "").toLowerCase();

    let poolIdentifier = emitter;
    let protocol = "V2/V3";

    if (topic0 === V4_SWAP_TOPIC) {
      if (emitter !== UNISWAP_V4_POOL_MANAGER) continue;
      poolIdentifier = String(log?.topics?.[1] || "").toLowerCase();
      protocol = "V4";
      if (!isBytes32(poolIdentifier)) continue;
    } else if (!isAddress(poolIdentifier)) {
      continue;
    }

    const current = pools.get(poolIdentifier) || {
      poolAddress: poolIdentifier,
      protocol,
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

    pools.set(poolIdentifier, current);
  }

  return {
    latestBlock: latest,
    fromBlock: first,
    blocksScanned: latest - first + 1,
    matchedSwapLogs: allLogs.length,
    pools: [...pools.values()].sort((a, b) => b.swapLogs - a.swapLogs),
  };
}


async function recentPoolCreations(env, blocksBack = 100) {
  const latestHex = await rpc(env, "eth_blockNumber");
  const latest = hexToNumber(latestHex);
  const requested = Math.min(Math.max(Number(blocksBack) || 100, 10), 200);
  const first = Math.max(0, latest - requested + 1);

  const ranges = [];
  for (let start = first; start <= latest; start += 10) {
    ranges.push([start, Math.min(start + 9, latest)]);
  }

  const batches = await Promise.all(
    ranges.map(async ([fromBlock, toBlock]) => {
      const logs = await rpc(env, "eth_getLogs", [
        {
          fromBlock: toHex(fromBlock),
          toBlock: toHex(toBlock),
          topics: [[V2_PAIR_CREATED_TOPIC, V3_POOL_CREATED_TOPIC, V4_INITIALIZE_TOPIC]],
        },
      ]).catch(() => []);
      return Array.isArray(logs) ? logs : [];
    })
  );

  const created = [];
  for (const log of batches.flat()) {
    const topic0 = String(log?.topics?.[0] || "").toLowerCase();
    const emitter = String(log?.address || "").toLowerCase();
    const blockNumber = hexToNumber(log?.blockNumber);
    let decoded = null;

    if (topic0 === V2_PAIR_CREATED_TOPIC && emitter === UNISWAP_V2_FACTORY) {
      decoded = decodeV2PairCreatedLog(log);
    } else if (topic0 === V3_POOL_CREATED_TOPIC && emitter === UNISWAP_V3_FACTORY) {
      decoded = decodeV3PoolCreatedLog(log);
    } else if (topic0 === V4_INITIALIZE_TOPIC && emitter === UNISWAP_V4_POOL_MANAGER) {
      const v4 = decodeV4InitializeLog(log);
      if (v4) {
        decoded = {
          poolAddress: v4.poolId,
          protocol: "V4",
          token0: v4.currency0,
          token1: v4.currency1,
          fee: v4.fee,
          tickSpacing: v4.tickSpacing,
          hooks: v4.hooks,
        };
        v4PoolKeyCacheSet(v4.poolId, v4);
      }
    }

    if (!decoded || !Number.isFinite(blockNumber)) continue;
    created.push({
      ...decoded,
      createdBlock: blockNumber,
      ageBlocks: Math.max(0, latest - blockNumber),
      creationTxHash: log?.transactionHash || null,
    });
  }

  return {
    latestBlock: latest,
    fromBlock: first,
    blocksScanned: latest - first + 1,
    creations: created.sort((a, b) => b.createdBlock - a.createdBlock),
  };
}

async function dexPairForDiscovery(item) {
  const direct = await dexPairByPool(item.poolAddress).catch(() => null);
  if (direct) return direct;

  const tokenCandidates = [item.token0, item.token1]
    .map((x) => String(x || "").toLowerCase())
    .filter((x) => isAddress(x) && x !== ZERO_ADDRESS);

  const unique = [...new Set(tokenCandidates)].slice(0, 2);
  if (!unique.length) return null;

  const lists = await Promise.all(
    unique.map((token) => dexTokenPairs(token).catch(() => []))
  );
  for (const pair of lists.flat()) {
    if (
      String(pair?.pairAddress || "").toLowerCase() ===
      String(item.poolAddress || "").toLowerCase()
    ) {
      return pair;
    }
  }
  return null;
}

function discoveryTimingRank(candidate) {
  const sig = candidate?.pair?.signals || {};
  if (sig.timingHint === "EARLY_ACCELERATION") return 4;
  if (sig.timingHint === "ACTIVE") return 3;
  if (sig.timingHint === "NEUTRAL") return 2;
  if (sig.timingHint === "EXTENDED") return 0;
  return 1;
}

function candidateActivity(candidate) {
  const p = candidate?.pair || {};
  const tx5 = txCount(p?.txns?.m5);
  const vol5 = Number(p?.volume?.m5 || 0);
  const swaps = Number(candidate?.recentSwapLogs || 0);
  return { tx5, vol5, swaps };
}


async function guardSample(env, poolIdentifier) {
  const pair = await dexPairByPool(poolIdentifier).catch(() => null);
  if (!pair) return null;

  const v4 = isBytes32(poolIdentifier) || isV4Pair(pair);
  const onchain = v4
    ? await v4PoolOnchainState(env, poolIdentifier).catch(() => null)
    : await poolOnchainState(env, poolIdentifier).catch(() => null);

  return {
    at: new Date().toISOString(),
    liquidityUsd: Number(pair?.liquidity?.usd || 0),
    priceUsd: Number(pair?.priceUsd || 0),
    pair: simplifyPair(pair),
    onchain,
  };
}

function worstStepDrop(values) {
  let worst = 0;
  for (let i = 1; i < values.length; i += 1) {
    worst = Math.max(worst, pctDrop(values[i - 1], values[i]));
  }
  return worst;
}

async function liquidityGuard(env, address, url) {
  const sizeUsd = Math.max(Number(url.searchParams.get("sizeUsd") || 200), 1);
  const samplesCount = Math.min(
    Math.max(Number(url.searchParams.get("samples") || 3), 2),
    3
  );
  const delayMs = Math.min(
    Math.max(Number(url.searchParams.get("delayMs") || 2000), 750),
    4000
  );
  const burnBlocks = Math.min(
    Math.max(Number(url.searchParams.get("burnBlocks") || 40), 10),
    100
  );
  const requestedPool = String(url.searchParams.get("pool") || "").toLowerCase();

  if (requestedPool && !isPoolIdentifier(requestedPool)) {
    throw new Error("Invalid pool identifier");
  }

  const pairs = await dexTokenPairs(address);
  const best = bestPair(pairs);

  let selected = null;
  if (requestedPool) {
    selected =
      pairs.find(
        (p) =>
          String(p.pairAddress || "").toLowerCase() === requestedPool
      ) || (await dexPairByPool(requestedPool).catch(() => null));
  } else {
    selected = best;
  }

  if (!selected) {
    return {
      service: "MONSTER LIQUIDITY GUARD",
      status: "BLOCK",
      tradePermission: false,
      contract: address,
      reason: "No Robinhood Chain pool found for requested token/pool.",
      checkedAt: new Date().toISOString(),
    };
  }

  const poolAddress = String(selected.pairAddress || "").toLowerCase();
  const selectedIsV4 = isV4Pair(selected) || isBytes32(poolAddress);
  if (!isPoolIdentifier(poolAddress)) {
    return {
      service: "MONSTER LIQUIDITY GUARD",
      status: "BLOCK",
      tradePermission: false,
      contract: address,
      reason:
        "Selected market does not expose a supported EVM pool address or Uniswap v4 poolId.",
      checkedAt: new Date().toISOString(),
    };
  }

  if (selectedIsV4 && !isBytes32(poolAddress)) {
    return {
      service: "MONSTER LIQUIDITY GUARD",
      status: "WAIT",
      tradePermission: false,
      contract: address,
      requestedPool: requestedPool || null,
      selectedPool: poolAddress,
      reason: "V4 market was detected but DexScreener did not expose a bytes32 poolId.",
      checkedAt: new Date().toISOString(),
    };
  }

  const previousWarm = memoryObservation(poolAddress);

  const samples = [];
  for (let i = 0; i < samplesCount; i += 1) {
    const sample = await guardSample(env, poolAddress);
    if (sample) samples.push(sample);
    if (i < samplesCount - 1) await sleep(delayMs);
  }

  if (!samples.length) {
    throw new Error("Liquidity Guard could not sample selected pool");
  }

  const latest = samples[samples.length - 1];
  const first = samples[0];
  const onchainFirst = first.onchain || {};
  const onchainLatest = latest.onchain || {};

  const liquiditySeries = samples.map((s) => Number(s.liquidityUsd || 0));
  const firstToLastLiquidityDropPct = pctDrop(
    liquiditySeries[0],
    liquiditySeries[liquiditySeries.length - 1]
  );
  const worstStepLiquidityDropPct = worstStepDrop(liquiditySeries);

  const token0BalanceDropPct =
    onchainFirst.token0Balance && onchainLatest.token0Balance
      ? bigIntDropPct(onchainFirst.token0Balance, onchainLatest.token0Balance)
      : null;
  const token1BalanceDropPct =
    onchainFirst.token1Balance && onchainLatest.token1Balance
      ? bigIntDropPct(onchainFirst.token1Balance, onchainLatest.token1Balance)
      : null;

  const activeLiquidityDropPct =
    onchainFirst.activeLiquidity && onchainLatest.activeLiquidity
      ? bigIntDropPct(
          onchainFirst.activeLiquidity,
          onchainLatest.activeLiquidity
        )
      : null;

  const bothPoolBalancesDropped =
    token0BalanceDropPct !== null &&
    token1BalanceDropPct !== null &&
    token0BalanceDropPct >= 20 &&
    token1BalanceDropPct >= 20;

  const currentLiquidityUsd = Number(latest.liquidityUsd || 0);
  const sizeVsLiquidityPct =
    currentLiquidityUsd > 0 ? (sizeUsd / currentLiquidityUsd) * 100 : null;

  const warmDropPct =
    previousWarm?.liquidityUsd > 0
      ? pctDrop(previousWarm.liquidityUsd, currentLiquidityUsd)
      : null;

  const burns = selectedIsV4
    ? await recentV4LiquidityActivity(env, poolAddress, burnBlocks).catch(() => null)
    : await recentPoolBurnActivity(env, poolAddress, burnBlocks).catch(() => null);

  const quote = await quotePoolExit(
    env,
    address,
    latest.pair,
    onchainLatest,
    sizeUsd
  ).catch(() => ({
    available: false,
    reason: "Quote check failed",
  }));

  const bestPoolAddress = String(best?.pairAddress || "").toLowerCase();
  const bestLiquidityUsd = Number(best?.liquidity?.usd || 0);
  const possibleMigration =
    requestedPool &&
    bestPoolAddress &&
    bestPoolAddress !== poolAddress &&
    bestLiquidityUsd > currentLiquidityUsd * 1.5;

  const critical = [];
  const warnings = [];
  const positives = [];

  if (!(currentLiquidityUsd > 0)) {
    critical.push("Liquidity is zero or unavailable.");
  }

  if (sizeVsLiquidityPct !== null && sizeVsLiquidityPct > 1.5) {
    critical.push(
      `Trade size is ${sizeVsLiquidityPct.toFixed(
        2
      )}% of reported liquidity (>1.5%).`
    );
  } else if (sizeVsLiquidityPct !== null && sizeVsLiquidityPct > 0.5) {
    warnings.push(
      `Trade size is ${sizeVsLiquidityPct.toFixed(
        2
      )}% of reported liquidity; Monster target is <=0.50%.`
    );
  } else if (sizeVsLiquidityPct !== null) {
    positives.push(
      `Trade size is ${sizeVsLiquidityPct.toFixed(
        2
      )}% of reported liquidity (<=0.50%).`
    );
  }

  if (
    firstToLastLiquidityDropPct >= 25 ||
    worstStepLiquidityDropPct >= 25
  ) {
    critical.push(
      `DEX liquidity collapsed during guard sampling (${Math.max(
        firstToLastLiquidityDropPct,
        worstStepLiquidityDropPct
      ).toFixed(1)}% drop).`
    );
  } else if (
    firstToLastLiquidityDropPct >= 10 ||
    worstStepLiquidityDropPct >= 10
  ) {
    warnings.push(
      `DEX liquidity weakened during guard sampling (${Math.max(
        firstToLastLiquidityDropPct,
        worstStepLiquidityDropPct
      ).toFixed(1)}% drop).`
    );
  } else {
    positives.push("DEX liquidity stayed stable during the pre-trade sample.");
  }

  if (warmDropPct !== null && warmDropPct >= 25) {
    critical.push(
      `Liquidity is down ${warmDropPct.toFixed(
        1
      )}% versus the previous observation in this warm Worker instance.`
    );
  } else if (warmDropPct !== null && warmDropPct >= 10) {
    warnings.push(
      `Liquidity is down ${warmDropPct.toFixed(
        1
      )}% versus the previous warm-instance observation.`
    );
  }

  if (bothPoolBalancesDropped) {
    critical.push(
      `Both pool token balances fell sharply during sampling (${token0BalanceDropPct.toFixed(
        1
      )}% / ${token1BalanceDropPct.toFixed(1)}%).`
    );
  }

  if (activeLiquidityDropPct !== null && activeLiquidityDropPct >= 30) {
    critical.push(
      `V3 active in-range liquidity fell ${activeLiquidityDropPct.toFixed(
        1
      )}% during sampling.`
    );
  } else if (activeLiquidityDropPct !== null && activeLiquidityDropPct >= 15) {
    warnings.push(
      `V3 active in-range liquidity fell ${activeLiquidityDropPct.toFixed(
        1
      )}% during sampling.`
    );
  }

  if (onchainLatest.protocol === "V4" && burns?.removals > 0) {
    if (burns.removals >= 3) {
      warnings.push(
        `${burns.removals} V4 liquidity-removal ModifyLiquidity event(s) detected recently; verify active-liquidity stability.`
      );
    } else {
      positives.push(
        `Only ${burns.removals} V4 liquidity-removal event(s) detected in the recent block window.`
      );
    }
  } else if (burns?.totalBurnEvents > 0) {
    if (onchainLatest.protocol === "V2" && burns.v2Burns > 0) {
      warnings.push(
        `${burns.v2Burns} V2 liquidity-removal Burn event(s) detected in the recent block window.`
      );
    } else if (onchainLatest.protocol === "V3" && burns.v3Burns >= 3) {
      warnings.push(
        `${burns.v3Burns} V3 Burn event(s) detected recently; range repositioning is possible, so verify liquidity stability.`
      );
    }
  }

  if (possibleMigration) {
    critical.push(
      `Requested pool is no longer the dominant pool; another pool has materially more liquidity. Treat as possible migration until verified.`
    );
  }

  if (quote?.available) {
    const impact = Number(quote.normal?.estimatedPoolPriceImpactPct || 0);
    const stressImpact = Number(
      quote.stress?.estimatedPoolPriceImpactPct ?? impact
    );

    if (impact > 5 || stressImpact > 10) {
      critical.push(
        `Executable pool quote is too fragile (${impact.toFixed(
          2
        )}% impact at target size; ${stressImpact.toFixed(
          2
        )}% at 2x stress size).`
      );
    } else if (impact > 2 || stressImpact > 5) {
      warnings.push(
        `Pool quote shows meaningful impact (${impact.toFixed(
          2
        )}% at target size; ${stressImpact.toFixed(2)}% at 2x stress size).`
      );
    } else {
      positives.push(
        `Pool quote impact is controlled (${impact.toFixed(
          2
        )}% at target size; ${stressImpact.toFixed(2)}% at 2x stress size).`
      );
    }
  } else {
    warnings.push(
      `No canonical V2/V3/V4 executable quote was available: ${
        quote?.reason || "unknown reason"
      }.`
    );
  }

  let status = "PASS";
  let tradePermission = true;

  if (critical.length) {
    status = "BLOCK";
    tradePermission = false;
  } else if (warnings.length) {
    status = "WAIT";
    tradePermission = false;
  } else if (
    sizeVsLiquidityPct !== null &&
    sizeVsLiquidityPct <= 0.25 &&
    quote?.available &&
    Number(quote.normal?.estimatedPoolPriceImpactPct || 99) <= 1
  ) {
    status = "STRONG_PASS";
  }

  storeMemoryObservation(poolAddress, {
    liquidityUsd: currentLiquidityUsd,
    priceUsd: Number(latest.priceUsd || 0),
  });

  return {
    service: "MONSTER LIQUIDITY GUARD",
    version: "2.4.1",
    status,
    tradePermission,
    network: "Robinhood Chain",
    contract: address,
    requestedPool: requestedPool || null,
    selectedPool: poolAddress,
    bestPool: bestPoolAddress || null,
    possibleMigration,
    sizeUsd,
    samplePlan: {
      samplesRequested: samplesCount,
      samplesCompleted: samples.length,
      delayMs,
      totalSamplingWindowMs:
        samples.length > 1 ? delayMs * (samples.length - 1) : 0,
      note:
        "The fast sampling window is designed to catch second-scale liquidity instability immediately before a trade. It cannot guarantee future liquidity.",
    },
    liquidity: {
      currentUsd: currentLiquidityUsd,
      seriesUsd: liquiditySeries,
      firstToLastDropPct: firstToLastLiquidityDropPct,
      worstStepDropPct: worstStepLiquidityDropPct,
      sizeVsLiquidityPct,
      monsterTargetPct: 0.5,
      monsterStrongTargetPct: 0.25,
      warmInstancePreviousDropPct: warmDropPct,
    },
    onchainPool: {
      protocol: onchainLatest.protocol || "UNKNOWN",
      factory: onchainLatest.factory || null,
      poolManager: onchainLatest.poolManager || null,
      stateView: onchainLatest.stateView || null,
      canonicalUniswap: Boolean(onchainLatest.canonicalUniswap),
      token0: onchainLatest.token0 || null,
      token1: onchainLatest.token1 || null,
      fee: onchainLatest.fee ?? null,
      tickSpacing: onchainLatest.tickSpacing ?? null,
      hooks: onchainLatest.hooks || null,
      v4PoolKeyResolved: Boolean(onchainLatest.poolKey),
      token0BalanceDropPct,
      token1BalanceDropPct,
      activeLiquidityDropPct,
      recentBurnActivity: burns,
    },
    exitQuote: quote,
    critical,
    warnings,
    positives,
    pair: simplifyPair(latest.pair, null, sizeUsd),
    checkedAt: new Date().toISOString(),
    hardCaveats: [
      "A PASS is not a guarantee that LP cannot be removed after the check.",
      "The quote tests pool mechanics only and does not prove honeypot/tax/blacklist/admin safety. V4 quotes additionally depend on resolving the canonical PoolKey from its Initialize event.",
      "Warm-instance history is best-effort only and is not durable storage; the real blocking logic relies on current multi-sample/on-chain checks.",
    ],
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
  const earlyMinLiquidity = Math.max(
    Number(url.searchParams.get("earlyMinLiquidity") || minLiquidity),
    0
  );
  const earlyReserve = Math.min(
    Math.max(Number(url.searchParams.get("earlyReserve") || 4), 0),
    Math.min(limit, 8)
  );
  const sizeUsd = url.searchParams.has("sizeUsd")
    ? Number(url.searchParams.get("sizeUsd"))
    : null;

  const [activity, creationActivity] = await Promise.all([
    recentSwapPoolCounts(env, blocks),
    recentPoolCreations(env, blocks),
  ]);

  const swapMap = new Map(
    activity.pools.map((x) => [String(x.poolAddress || "").toLowerCase(), x])
  );
  const creationMap = new Map(
    creationActivity.creations.map((x) => [String(x.poolAddress || "").toLowerCase(), x])
  );

  // Lane 1: the busiest pools now. Lane 2: newly created/initialized pools,
  // even when their first swaps are not yet numerous enough for the top-30 list.
  const momentumShortlist = activity.pools.slice(0, Math.min(limit * 3, 30));
  const earlyShortlist = creationActivity.creations.slice(0, Math.min(limit * 2, 20));

  const union = new Map();
  for (const item of momentumShortlist) {
    const key = String(item.poolAddress || "").toLowerCase();
    union.set(key, {
      ...item,
      ...(creationMap.get(key) || {}),
      poolAddress: key,
      // Normalize the activity field so downstream ranking/reporting never
      // loses the swap count from recentSwapPoolCounts (which calls it swapLogs).
      recentSwapLogs: Number(item.swapLogs || 0),
      discoveryLane: creationMap.has(key) ? "EARLY_GESTATION" : "MOMENTUM",
      newPoolDetected: creationMap.has(key),
    });
  }
  for (const item of earlyShortlist) {
    const key = String(item.poolAddress || "").toLowerCase();
    const swaps = swapMap.get(key) || {};
    union.set(key, {
      ...item,
      ...swaps,
      poolAddress: key,
      protocol: item.protocol || swaps.protocol || null,
      recentSwapLogs: Number(swaps.swapLogs || 0),
      firstSeenBlock: swaps.firstSeenBlock ?? null,
      lastSeenBlock: swaps.lastSeenBlock ?? null,
      discoveryLane: "EARLY_GESTATION",
      newPoolDetected: true,
    });
  }

  const enriched = await Promise.all(
    [...union.values()].map(async (item) => {
      const pair = await dexPairForDiscovery(item);
      if (!pair) return null;

      const liquidity = Number(pair.liquidity?.usd || 0);
      const requiredLiquidity =
        item.discoveryLane === "EARLY_GESTATION" ? earlyMinLiquidity : minLiquidity;
      if (liquidity < requiredLiquidity) return null;

      const candidateContract = pair?.baseToken?.address || null;
      const simplified = simplifyPair(pair, Number(item.recentSwapLogs || 0), sizeUsd);
      const tx5 = txCount(simplified?.txns?.m5);
      const vol5 = Number(simplified?.volume?.m5 || 0);
      const hasFirstFlow =
        Number(item.recentSwapLogs || 0) > 0 || tx5 > 0 || vol5 > 0;

      return {
        poolAddress: item.poolAddress,
        candidateContract,
        recentSwapLogs: Number(item.recentSwapLogs || 0),
        discovery: {
          lane: item.discoveryLane,
          protocol: item.protocol || (isV4Pair(pair) ? "V4" : null),
          newPoolDetected: Boolean(item.newPoolDetected),
          createdBlock: item.createdBlock ?? null,
          ageBlocks: item.ageBlocks ?? null,
          creationTxHash: item.creationTxHash ?? null,
          firstSeenSwapBlock: item.firstSeenBlock ?? null,
          lastSeenSwapBlock: item.lastSeenBlock ?? null,
          firstFlowDetected: hasFirstFlow,
        },
        quickLiquidityGuard:
          candidateContract && isAddress(candidateContract)
            ? `/guard/${candidateContract}?pool=${item.poolAddress}&sizeUsd=${
                sizeUsd ?? 200
              }`
            : null,
        pair: simplified,
      };
    })
  );

  const all = enriched.filter(Boolean);

  const sorter = (a, b) => {
    const ta = discoveryTimingRank(a);
    const tb = discoveryTimingRank(b);
    if (tb !== ta) return tb - ta;

    const aSig = a.pair?.signals || {};
    const bSig = b.pair?.signals || {};
    const va = Number(aSig.volumeAcceleration5mVs1hPace || 0);
    const vb = Number(bSig.volumeAcceleration5mVs1hPace || 0);
    if (vb !== va) return vb - va;

    const aa = candidateActivity(a);
    const ba = candidateActivity(b);
    if (ba.tx5 !== aa.tx5) return ba.tx5 - aa.tx5;
    if (ba.vol5 !== aa.vol5) return ba.vol5 - aa.vol5;
    return ba.swaps - aa.swaps;
  };

  // Reserve a few result slots for fresh pools with real first flow. This is the
  // anti-BLAST-miss lane: it prevents a young pool from being crowded out by
  // already-busy older pools before its first expansion candle.
  const earlyActionable = all
    .filter((c) => {
      if (c.discovery?.lane !== "EARLY_GESTATION") return false;
      if (!c.discovery?.firstFlowDetected) return false;
      return c.pair?.signals?.timingHint !== "EXTENDED";
    })
    .sort((a, b) => {
      const ageA = Number(a.discovery?.ageBlocks ?? 1e12);
      const ageB = Number(b.discovery?.ageBlocks ?? 1e12);
      const flowA = candidateActivity(a);
      const flowB = candidateActivity(b);
      if (flowB.tx5 !== flowA.tx5) return flowB.tx5 - flowA.tx5;
      if (flowB.vol5 !== flowA.vol5) return flowB.vol5 - flowA.vol5;
      return ageA - ageB;
    });

  const momentumCandidates = all
    .filter((c) => !earlyActionable.includes(c))
    .sort(sorter);

  const selected = [];
  const seen = new Set();
  for (const c of earlyActionable.slice(0, earlyReserve)) {
    const key = String(c.poolAddress || "").toLowerCase();
    if (!seen.has(key)) {
      selected.push(c);
      seen.add(key);
    }
  }
  for (const c of momentumCandidates) {
    if (selected.length >= limit) break;
    const key = String(c.poolAddress || "").toLowerCase();
    if (!seen.has(key)) {
      selected.push(c);
      seen.add(key);
    }
  }
  if (selected.length < limit) {
    for (const c of earlyActionable) {
      if (selected.length >= limit) break;
      const key = String(c.poolAddress || "").toLowerCase();
      if (!seen.has(key)) {
        selected.push(c);
        seen.add(key);
      }
    }
  }

  const earlyWatch = all
    .filter((c) => c.discovery?.lane === "EARLY_GESTATION")
    .sort((a, b) => Number(a.discovery?.ageBlocks ?? 1e12) - Number(b.discovery?.ageBlocks ?? 1e12))
    .slice(0, 12);

  return {
    service: "MONSTER LIVE FEED",
    version: "2.4.1",
    status: "ONLINE",
    network: "Robinhood Chain",
    chainId: EXPECTED_CHAIN_ID,
    mode: "DUAL_LANE_MOMENTUM_AND_EARLY_GESTATION",
    latestBlock: activity.latestBlock,
    fromBlock: Math.min(activity.fromBlock, creationActivity.fromBlock),
    blocksScanned: blocks,
    matchedSwapLogs: activity.matchedSwapLogs,
    activePoolsDetected: activity.pools.length,
    newPoolsDetected: creationActivity.creations.length,
    earlyActionableDetected: earlyActionable.length,
    returnedCandidates: selected.length,
    parameters: {
      blocks,
      limit,
      minLiquidity,
      earlyMinLiquidity,
      earlyReserve,
      sizeUsd,
    },
    candidates: selected,
    earlyWatch,
    checkedAt: new Date().toISOString(),
    notes: [
      "Dual-lane discovery: MOMENTUM ranks active swap flow while EARLY_GESTATION watches newly created/initialized canonical Uniswap V2/V3/V4 pools before they become top-volume pools.",
      "A small number of result slots are reserved for fresh pools only when first real flow exists and the move is not already EXTENDED.",
      "DEX Screener is used to enrich Robinhood Chain pools with price/liquidity/volume/transaction windows; tx counts are not guaranteed unique wallets.",
      "Each candidate includes a /guard path. Liquidity Guard accepts V2/V3 pool addresses and Uniswap v4 bytes32 poolIds.",
      "V4 Initialize events are cached immediately, improving PoolKey resolution and executable exit quoting for newly detected pools.",
      "This is discovery, not trade approval. Liquidity Guard plus Monster Trading security/structure validation remain mandatory.",
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
          version: "2.4.1",
          status: chainId === EXPECTED_CHAIN_ID ? "ONLINE" : "WRONG_NETWORK",
          network: "Robinhood Chain",
          blockNumber: hexToNumber(blockHex),
          chainIdHex,
          chainId,
          expectedChainId: EXPECTED_CHAIN_ID,
          checkedAt: new Date().toISOString(),
          endpoints: {
            health: "/health",
            scan: "/scan?blocks=100&limit=12&minLiquidity=1000&earlyReserve=4&sizeUsd=200",
            guard:
              "/guard/0x...?pool=0x...&sizeUsd=200&samples=3&delayMs=2000 (pool may be V2/V3 address or V4 bytes32 poolId)",
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

      if (route === "guard") {
        const result = await liquidityGuard(env, address, url);
        return json(result, 200, 0);
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
