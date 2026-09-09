/* SteamID64 <-> Deadlock account id conversion.
   Ported from Seance's steamId.ts (D:\Claude\Projects\Seance\src\shared\core\steamId.ts).
   A SteamID64 (~7.65e16) exceeds Number.MAX_SAFE_INTEGER, so the conversion uses BigInt;
   the resulting account id (~1e9) is well within safe-integer range. */

const ACCOUNT_ID_BASE = 76561197960265728n;

/** Accepts a SteamID64 or an already-32-bit account id and returns the account id,
    or null if the input isn't a positive integer. */
function toAccountId(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = BigInt(s);
  if (n <= 0n) return null;
  const acc = n >= ACCOUNT_ID_BASE ? n - ACCOUNT_ID_BASE : n;
  return Number(acc);
}

/** Converts a 32-bit account id back to its 17-digit SteamID64 string. */
function toSteamId64(accountId) {
  return (BigInt(accountId) + ACCOUNT_ID_BASE).toString();
}
