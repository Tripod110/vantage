/* Vantage — hero and rank catalogs, cached on disk (see cachedAsset in
   store.js). These change on Valve's patch cadence, not per-visit, so they
   are fetched once a week at most and looked up locally after that. */

let _heroesById = null;
let _ranksByTier = null;

async function loadHeroCatalog() {
  if (_heroesById) return _heroesById;
  const heroes = await cachedAsset('heroes', getHeroes);
  _heroesById = new Map(heroes.map((h) => [h.id, h]));
  return _heroesById;
}

async function loadRankCatalog() {
  if (_ranksByTier) return _ranksByTier;
  const ranks = await cachedAsset('ranks', getRanks);
  _ranksByTier = new Map(ranks.map((r) => [r.tier, r]));
  return _ranksByTier;
}

/** Pre-warms both catalogs so lookups below are synchronous during a render. */
async function loadCatalogs() {
  await Promise.all([loadHeroCatalog(), loadRankCatalog()]);
}

function heroName(heroId) {
  return _heroesById?.get(heroId)?.name ?? `Hero ${heroId}`;
}

function heroIcon(heroId) {
  const h = _heroesById?.get(heroId);
  return h?.images?.icon_image_small ?? h?.images?.minimap_image ?? null;
}

/** "Acolyte 3" for a mmr-history `rank` value (division*10 + subrank). */
function rankLabel(rank) {
  if (!rank) return 'Unranked';
  const division = Math.floor(rank / 10);
  const subrank = rank % 10;
  const name = _ranksByTier?.get(division)?.name ?? `Tier ${division}`;
  return subrank ? `${name} ${subrank}` : name;
}

function rankBadgeFor(rank) {
  if (!rank) return null;
  return rankBadgeUrl(Math.floor(rank / 10), rank % 10 || 1);
}
