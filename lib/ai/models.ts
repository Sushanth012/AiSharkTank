export type AiModelPricing = {
  cachedInputPerMillion: number;
  uncachedInputPerMillion: number;
  outputPerMillion: number;
};

export type AiRoute = "basic" | "premium_evaluator" | "premium_synthesis";

export const deepSeekPricing: Record<string, AiModelPricing> = {
  "deepseek-v4-flash": {
    cachedInputPerMillion: 0.0028,
    uncachedInputPerMillion: 0.14,
    outputPerMillion: 0.28
  },
  "deepseek-v4-pro": {
    cachedInputPerMillion: 0.003625,
    uncachedInputPerMillion: 0.435,
    outputPerMillion: 0.87
  }
};

export function modelForRoute(route: AiRoute) {
  return route === "basic"
    ? process.env.DEEPSEEK_BASIC_MODEL ?? "deepseek-v4-flash"
    : process.env.DEEPSEEK_PREMIUM_MODEL ?? "deepseek-v4-pro";
}

export function budgetForRoute(route: AiRoute) {
  const value =
    route === "basic"
      ? process.env.AI_BASIC_BUDGET_USD ?? "0.03"
      : process.env.AI_PREMIUM_BUDGET_USD ?? "0.15";
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid AI budget for ${route}.`);
  }
  return parsed;
}

export function estimateRunCost({
  model,
  inputTokens,
  cachedInputTokens = 0,
  outputTokens
}: {
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}) {
  const pricing = deepSeekPricing[model];
  if (!pricing) {
    throw new Error(`No token pricing is configured for ${model}.`);
  }

  const cached = Math.max(0, Math.min(inputTokens, cachedInputTokens));
  const uncached = Math.max(0, inputTokens - cached);
  return (
    (cached * pricing.cachedInputPerMillion +
      uncached * pricing.uncachedInputPerMillion +
      Math.max(0, outputTokens) * pricing.outputPerMillion) /
    1_000_000
  );
}

export function assertWithinBudget(costUsd: number, budgetUsd: number) {
  if (costUsd > budgetUsd) {
    throw new AiBudgetExceededError(costUsd, budgetUsd);
  }
}

export class AiBudgetExceededError extends Error {
  constructor(
    readonly estimatedCostUsd: number,
    readonly budgetUsd: number
  ) {
    super(`Estimated AI cost $${estimatedCostUsd.toFixed(4)} exceeds the $${budgetUsd.toFixed(4)} budget.`);
    this.name = "AiBudgetExceededError";
  }
}
