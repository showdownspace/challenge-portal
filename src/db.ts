import { createCache } from "async-cache-dedupe";
import { consola } from "consola";
import pLimit from "p-limit";
import { grist } from "./grist";
const gristLimit = pLimit(3);

interface Tables {
  Portal_Users: {
    id: number;
    name: string;
    sub: string;
    enrolled: boolean;
    teamName: string | null;
    linkedTeam: number;
    admin: boolean;
  };
  Challenges: {
    codename: string;
    maxScore: number;
    gradingType: "auto" | "manual";
    enabled: boolean;
  };
}

const cache = createCache({ ttl: 5, stale: 3 })
  .define("getUserInfo", async (sub: string) => {
    const result = await gristLimit(() =>
      grist.fetchTable("Portal_Users", { sub: [sub] })
    );
    consola.debug("getUserInfo", sub);
    return result[0] as Tables["Portal_Users"] | undefined;
  })
  .define("getChallenges", async () => {
    const result = await gristLimit(() => grist.fetchTable("Challenges", {}));
    return result as Tables["Challenges"][];
  });

export async function getUserInfo(userId: string) {
  return cache.getUserInfo(userId);
}

export async function getChallenges() {
  return cache.getChallenges();
}

export async function registerUser(
  sub: string,
  options: {
    name: string;
  }
) {
  await grist.syncTable(
    "Portal_Users",
    [{ sub: sub, name: options.name }],
    ["sub"]
  );
  cache.clear("getUserInfo", sub);
}

export async function onboardUser(
  sub: string,
  options: {
    teamName: string;
  }
) {
  await grist.syncTable(
    "Portal_Users",
    [{ sub, teamName: options.teamName }],
    ["sub"]
  );
  cache.clear("getUserInfo", sub);
}
