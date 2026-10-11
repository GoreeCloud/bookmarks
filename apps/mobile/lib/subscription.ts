import type { Config } from "@linkwarden/router/config";
import type { GetUserByIdResponse } from "@linkwarden/types/global";

const DEFAULT_TRIAL_PERIOD_DAYS = 14;

const getTrialPeriodDays = (
  config?: Pick<Config, "TRIAL_PERIOD_DAYS"> | null
) => Number(config?.TRIAL_PERIOD_DAYS) || DEFAULT_TRIAL_PERIOD_DAYS;

const getSubscriptionDaysLeft = (
  createdAt?: string | Date | null,
  trialPeriodDays = DEFAULT_TRIAL_PERIOD_DAYS
) => {
  if (!createdAt) return 0;

  const createdAtTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtTime)) return 0;

  const trialEndTime = createdAtTime + (1 + Number(trialPeriodDays)) * 86400000;

  return Math.floor((trialEndTime - Date.now()) / 86400000);
};

const hasInactiveSubscription = (
  user?: Partial<GetUserByIdResponse> | null,
  config?: Config | null
) => {
  return Boolean(
    user?.id &&
      config?.STRIPE_ENABLED &&
      !user?.subscription?.active &&
      !user?.parentSubscription?.active
  );
};

const shouldRouteToSubscribe = (
  user?: Partial<GetUserByIdResponse> | null,
  config?: Config | null
) => {
  const trialPeriodDays = getTrialPeriodDays(config);
  const daysLeft = getSubscriptionDaysLeft(user?.createdAt, trialPeriodDays);

  return Boolean(
    hasInactiveSubscription(user, config) &&
      (config?.REQUIRE_CC || daysLeft <= 0)
  );
};

export {
  DEFAULT_TRIAL_PERIOD_DAYS,
  getTrialPeriodDays,
  getSubscriptionDaysLeft,
  hasInactiveSubscription,
  shouldRouteToSubscribe,
};
