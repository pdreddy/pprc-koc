export const DEFAULT_ELIGIBILITY_RULES = {
  maxSinglesDays: 2,
  maxTotalMatchDays: 6,
  maxPartnerDays: 3
};

export function normalizeEligibilityRules(rules = {}) {
  const next = { ...DEFAULT_ELIGIBILITY_RULES };
  Object.keys(next).forEach(key => {
    const value = Number(rules?.[key]);
    if (Number.isFinite(value) && value > 0) next[key] = Math.floor(value);
  });
  return next;
}
