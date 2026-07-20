import { MUTATION_IMPACT_REQUIRED_CODE, type ImpactPlan } from "../../mutation-impact-contract";

export class MutationImpactRequiredError extends Error {
  readonly code = MUTATION_IMPACT_REQUIRED_CODE;
  readonly status = 409;

  constructor(
    message: string,
    readonly impact: ImpactPlan,
    readonly reason: "blocked" | "confirmation_required",
  ) {
    super(message);
    this.name = "MutationImpactRequiredError";
  }
}

export class MutationImpactConfirmationError extends Error {
  readonly status = 409;

  constructor(
    readonly code: "MUTATION_IMPACT_CONFIRMATION_INVALID" | "MUTATION_IMPACT_CONFIRMATION_STALE",
    message: string,
    readonly impact: ImpactPlan,
  ) {
    super(message);
    this.name = "MutationImpactConfirmationError";
  }
}

export class MutationImpactLimitError extends Error {
  readonly code = "MUTATION_IMPACT_LIMIT_EXCEEDED" as const;
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "MutationImpactLimitError";
  }
}

export class MutationImpactConfigurationError extends Error {
  readonly code = "MUTATION_IMPACT_CONFIGURATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "MutationImpactConfigurationError";
  }
}
