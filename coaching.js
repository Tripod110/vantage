/* Versioned coaching state. Historical commitments are snapshots; form grades are derived. */
const COACHING_VERSION = 1;
const REFLECTION_TAGS = ['laning', 'positioning', 'fights', 'farm', 'objectives', 'tilted'];

function migrateCoaching(goals = {}, sessions = []) {
  const known = [goals.active, ...(goals.learned ?? [])].filter(Boolean);
  return { version: COACHING_VERSION, active: goals.active ?? null, learned: goals.learned ?? [], reflections: {},
    legacyGrades: goals.grades ?? {},
    sessions: sessions.map((s, i) => {
      const candidates = known.filter((g) => g.id === s.goalId && g.setAt <= s.startedAt);
      return { ...s, id: `legacy:${s.startedAt}:${i}`, goal: candidates.length === 1 ? { ...candidates[0] } : null, legacy: true };
    }) };
}

function endCoachingSession(coaching, nowMs) {
  const open = coaching.sessions.at(-1);
  if (open && open.endedAt == null) open.endedAt = nowMs;
}

function startCoachingSession(coaching, nowMs) {
  if (!coaching.active || coaching.sessions.at(-1)?.endedAt === null) return;
  coaching.sessions.push({ id: `session:${nowMs}`, startedAt: nowMs, endedAt: null, goalId: coaching.active.id, goal: { ...coaching.active } });
}

function replaceCoachingGoal(coaching, goal, nowMs) {
  endCoachingSession(coaching, nowMs);
  coaching.active = goal ? { ...goal, setAt: nowMs } : null;
  if (goal) startCoachingSession(coaching, nowMs);
}

function matchGoalResult(item, coaching) {
  const at = item.entry.start_time * 1000;
  const session = coaching.sessions.findLast((s) => at >= s.startedAt && (s.endedAt == null || at < s.endedAt));
  const legacy = coaching.legacyGrades[item.entry.match_id];
  if (legacy) return { status: 'legacy', goal: session?.goal ?? { label: legacy.goalLabel }, value: null, hit: legacy.actualHit ?? null };
  if (session?.goal) {
    const goal = session.goal;
    return { status: 'committed', goal, value: GOAL_METRIC_GET[goal.metric]?.(item.profile) ?? null, hit: evaluateGoal(goal, item.profile), sessionId: session.id };
  }
  return { status: session ? 'unavailable' : 'none', goal: null, value: null, hit: null };
}

function committedProgress(goal, items, coaching) {
  const results = [...items].sort((a, b) => b.entry.start_time - a.entry.start_time).slice(0, 10)
    .map((it) => ({ matchId: it.entry.match_id, result: matchGoalResult(it, coaching) }))
    .filter(({ result }) => result.goal?.id === goal.id && result.hit !== null)
    .map(({ matchId, result }) => ({ matchId, hit: result.hit }));
  const hits = results.filter((r) => r.hit).length;
  return { measured: results.length, hits, recentMeasured: results.length, recentHits: hits, learned: results.length === 10 && hits >= 8, results };
}

function reconcileCoaching(coaching, items, nowMs, pruneReflections = true) {
  const goal = coaching.active;
  if (goal && committedProgress(goal, items, coaching).learned) {
    coaching.learned.push({ ...goal, learnedAt: nowMs });
    coaching.active = null;
    endCoachingSession(coaching, nowMs);
  }
  const ids = new Set(items.map((it) => String(it.entry.match_id)));
  if (pruneReflections) for (const id of Object.keys(coaching.reflections)) if (!ids.has(id)) delete coaching.reflections[id];
  // Keep the bounded session log plus any older session still covering a retained match.
  coaching.sessions = coaching.sessions.filter((s, i, all) => i >= all.length - 60 || items.some((it) => {
    const at = it.entry.start_time * 1000;
    return at >= s.startedAt && (s.endedAt == null || at < s.endedAt);
  }));
}

function reflectionFor(coaching, matchId) {
  const saved = coaching.reflections[matchId] ?? coaching.legacyGrades[matchId];
  return { note: saved?.note ?? '', tags: saved?.tags ?? [] };
}
