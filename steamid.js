/* SteamID64 <-> Deadlock account id conversion.
   Ported from Seance's steamId.ts (D:\Claude\Projects\Seance\src\shared\core\steamId.ts).
   A SteamID64 (~7.65e16) exceeds Number.MAX_SAFE_INTEGER, so the conversion uses BigInt;
   the resulting account id (~1e9) is well within safe-integer range. */

const ACCOUNT_ID_BASE = 76561197960265728n;

/** Accepts an account ID, SteamID64, or numeric Steam profile URL.
    Reject unrelated URLs and values outside the unsigned 32-bit account range. */
function toAccountId(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!/^\d+$/.test(s)) {
    try {
      const url = new URL(/^(?:www\.)?steamcommunity\.com\//i.test(s) ? `https://${s}` : s);
      if (!['https:', 'http:'].includes(url.protocol) ||
          !['steamcommunity.com', 'www.steamcommunity.com'].includes(url.hostname) ||
          url.username || url.password || url.port) return null;
      const match = url.pathname.match(/^\/profiles\/(\d{17})\/?$/);
      if (!match) return null;
      s = match[1];
    } catch {
      return null;
    }
  }
  if (!/^\d+$/.test(s)) return null;
  const n = BigInt(s);
  if (n <= 0n) return null;
  const acc = n >= ACCOUNT_ID_BASE ? n - ACCOUNT_ID_BASE : n;
  if (acc <= 0n || acc > 4294967295n) return null;
  return Number(acc);
}

/** Converts a 32-bit account id back to its 17-digit SteamID64 string. */
function toSteamId64(accountId) {
  return (BigInt(accountId) + ACCOUNT_ID_BASE).toString();
}
