import type { Client } from "./types";

// Every REWARD_MILESTONE completed visits earns the client one reward
// (e.g. a free wash). Change this one number to retune the whole program.
export const REWARD_MILESTONE = 10;

// How many rewards a client has earned in total, ever (not accounting for
// ones already redeemed).
export function getRewardsEarned(client: Pick<Client, "visitCount">): number {
  return Math.floor(client.visitCount / REWARD_MILESTONE);
}

// How many rewards are sitting unredeemed right now.
export function getRewardsAvailable(
  client: Pick<Client, "visitCount" | "rewardsRedeemed">
): number {
  return Math.max(0, getRewardsEarned(client) - (client.rewardsRedeemed || 0));
}

// Visits remaining until the client's next reward unlocks (0 if one is
// already available to redeem).
export function getVisitsUntilNextReward(
  client: Pick<Client, "visitCount" | "rewardsRedeemed">
): number {
  if (getRewardsAvailable(client) > 0) return 0;
  const nextMilestone = (getRewardsEarned(client) + 1) * REWARD_MILESTONE;
  return Math.max(0, nextMilestone - client.visitCount);
}
