import { createCache } from "async-cache-dedupe";
import { consola } from "consola";
import pLimit from "p-limit";
import { grist } from "./grist";
const gristLimit = pLimit(3);

export interface Tables {
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
    id: number;
    codename: string;
    description: string;
    url: string | null;
    maxScore: number;
    gradingType: "auto" | "manual";
    enabled: boolean;
  };
  Submissions: {
    id: number;
    submittedBy: number;
    challenge: number;
    submittedAt: number;
    passed: boolean;
    penalty: number;
    dismissed: boolean;
    autoSubmissionInfo: string | null;
  };
  AutoProgress: {
    id: number;
    team: number;
    challenge: number;
    progress: number;
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
  .define("getChallengers", async () => {
    const result = await gristLimit(() =>
      grist.fetchTable("Portal_Users", { enrolled: [true] })
    );
    consola.debug("getChallengers");
    return result as Tables["Portal_Users"][];
  })
  .define("getChallenges", async () => {
    const result = await gristLimit(() => grist.fetchTable("Challenges", {}));
    return result as Tables["Challenges"][];
  })
  .define("fetchSubmissionsByUserId", async (userId: number) => {
    const result = await gristLimit(() =>
      grist.fetchTable("Submissions", { submittedBy: [userId] })
    );
    consola.debug("fetchSubmissionsByUserId", userId);
    return result as Tables["Submissions"][];
  });

export async function getUserInfo(userId: string) {
  return cache.getUserInfo(userId);
}

export async function getChallenges() {
  return cache.getChallenges();
}

export async function getChallengers() {
  return cache.getChallengers();
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

export async function createSubmission(
  userInfo: Pick<Tables["Portal_Users"], "id">,
  challenge: Pick<Tables["Challenges"], "id">,
  autoSubmissionInfo?: string
) {
  const found = (await grist.fetchTable("Submissions", {
    submittedBy: [userInfo.id],
    challenge: [challenge.id],
  })) as Tables["Submissions"][];
  if (found[0]?.passed) {
    throw new Error("Already passed");
  }
  if (found[0] && !found[0].dismissed) {
    throw new Error("Already in review");
  }
  await grist.syncTable(
    "Submissions",
    [
      {
        submittedBy: userInfo.id,
        challenge: challenge.id,
        submittedAt: Date.now() / 1e3,
        dismissed: false,
        ...(autoSubmissionInfo ? { autoSubmissionInfo } : {}),
      },
    ],
    ["submittedBy", "challenge"]
  );
  cache.clear("fetchSubmissionsByUserId", userInfo.id);
}

export async function getSubmissions(
  userInfo: Pick<Tables["Portal_Users"], "id">
) {
  return cache.fetchSubmissionsByUserId(userInfo.id);
}

export async function getPendingReviewSubmissions() {
  const submissions = (await grist.fetchTable("Submissions", {
    dismissed: [false],
    passed: [false],
  })) as Tables["Submissions"][];
  submissions.sort((a, b) => {
    return a.submittedAt - b.submittedAt;
  });
  return submissions;
}

export async function getAllSubmissions() {
  return (await grist.fetchTable("Submissions", {})) as Tables["Submissions"][];
}

export async function approveSubmission(submissionId: number) {
  await grist.updateRecords("Submissions", [
    { id: submissionId, passed: true },
  ]);
  cache.clear("fetchSubmissionsByUserId", submissionId);
}

export async function rejectSubmission(submissionId: number) {
  const [submission] = (await grist.fetchTable("Submissions", {
    id: [submissionId],
  })) as Tables["Submissions"][];
  await grist.updateRecords("Submissions", [
    {
      id: submissionId,
      dismissed: true,
      penalty: (submission.penalty || 0) + 1,
    },
  ]);
  cache.clear("fetchSubmissionsByUserId", submissionId);
}
