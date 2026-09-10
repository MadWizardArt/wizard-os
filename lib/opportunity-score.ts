export type VentureScores = { demand: number; margin: number; recurrence: number; automation: number; defensibility: number; startupCost: number; weeklyHours: number };

export function opportunityScore(venture: VentureScores) {
  const weighted = venture.demand * 0.2 + venture.margin * 0.2 + venture.recurrence * 0.2 + venture.automation * 0.2 + venture.defensibility * 0.1 + (6 - venture.startupCost) * 0.05 + (6 - venture.weeklyHours) * 0.05;
  return Math.round(((weighted - 1) / 4) * 100);
}
