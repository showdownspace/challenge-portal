import { createHmac } from "crypto";
import { t, type Static } from "elysia";
import { Random } from "random";
import {
  getAllSubmissions,
  getChallengers,
  getChallenges,
  type Tables,
} from "./db";

export const scoreboardApiKey =
  createHmac("sha256", Bun.env["JWT_SECRET"]!)
    .update("scoreboard-api-key")
    .digest("hex") +
  createHmac("sha256", Bun.env["JWT_SECRET"]!)
    .update("scoreboard-api-key2")
    .digest("hex") +
  createHmac("sha256", Bun.env["JWT_SECRET"]!)
    .update("scoreboard-api-key3")
    .digest("hex");

export const Scoreboard = t.Object({
  challenges: t.Array(
    t.Object({
      id: t.Number(),
      name: t.String(),
      maxScore: t.Number(),
    })
  ),
  teams: t.Array(
    t.Object({
      id: t.Number(),
      name: t.String(),
    })
  ),
  submissions: t.Array(
    t.Object({
      challengeId: t.Number(),
      teamId: t.Number(),
      status: t.Union([t.Literal("reviewing"), t.Literal("accepted")]),
      penalty: t.Number({
        description: "How many times the submission has been rejected",
      }),
      submittedAt: t.String({
        description: "ISO 8601 date string",
      }),
      score: t.Number({
        description: "How many points awarded for this submission",
      }),
    })
  ),
  progress: t.Array(
    t.Object({
      challengeId: t.Number(),
      teamId: t.Number(),
      progress: t.Number({
        description:
          "Percentage of challenge completion (0-100). Only relevant for auto-submitted challenges.",
      }),
    })
  ),
});

type Scoreboard = Static<typeof Scoreboard>;

export function generateExampleScoreboard(seed: string = "42") {
  const random = new Random(seed);

  const challengeCommon = {
    gradingType: "auto" as const,
    enabled: true,
    url: "",
    description: "",
  };
  const challenges: Tables["Challenges"][] = [
    { id: 1, codename: "1_nyan", maxScore: 20, ...challengeCommon },
    { id: 2, codename: "2_guitar", maxScore: 30, ...challengeCommon },
    { id: 3, codename: "3_qrcode", maxScore: 40, ...challengeCommon },
    { id: 4, codename: "4_puzzle", maxScore: 20, ...challengeCommon },
    { id: 5, codename: "5_crypto", maxScore: 30, ...challengeCommon },
    { id: 6, codename: "6_reverse", maxScore: 30, ...challengeCommon },
    { id: 7, codename: "7_web", maxScore: 30, ...challengeCommon },
    { id: 8, codename: "8_pwn", maxScore: 40, ...challengeCommon },
  ];
  const teamCommon = {
    admin: false,
    enrolled: true,
    name: "",
    sub: "",
    linkedTeam: 0,
  };
  const teams: Tables["Portal_Users"][] = [
    { id: 1, teamName: "Binary Bandits", ...teamCommon },
    { id: 2, teamName: "Pixel Pirates", ...teamCommon },
    { id: 3, teamName: "Code Crusaders", ...teamCommon },
    { id: 4, teamName: "Cyber Centurions", ...teamCommon },
    { id: 5, teamName: "Data Dynamos", ...teamCommon },
    { id: 6, teamName: "Quantum Quokkas", ...teamCommon },
    { id: 7, teamName: "Syntax Sleuths", ...teamCommon },
    { id: 8, teamName: "Logic Leopards", ...teamCommon },
    { id: 9, teamName: "Algo Avengers", ...teamCommon },
    { id: 10, teamName: "Byte Breakers", ...teamCommon },
    { id: 11, teamName: "Neural Ninjas", ...teamCommon },
    { id: 12, teamName: "Stack Stackers", ...teamCommon },
    { id: 13, teamName: "Cache Commanders", ...teamCommon },
    { id: 14, teamName: "Firewall Phoenixes", ...teamCommon },
  ];
  const submissions: Tables["Submissions"][] = [];
  const autoProgress: Tables["AutoProgress"][] = [];
  const timeStart = Date.parse("2024-11-20T19:10:00+07:00") / 1000;
  for (const team of teams) {
    const luk1 = 0.3 + random.float() * 0.7;
    const luk2 = 0.3 + random.float() * 0.7;
    for (const challenge of challenges) {
      const gradingType =
        challenge.id !== 3 && challenge.id !== 7 ? "auto" : "manual";
      const submitted = random.float() < luk1;
      const passed = submitted && random.float() < luk2;
      const attempted = submitted || random.float() < 0.3;
      if (gradingType === "auto" && attempted) {
        autoProgress.push({
          id: autoProgress.length + 1,
          challenge: challenge.id,
          team: team.id,
          progress: Math.round(random.float() * 100),
        });
      }
      if (submitted) {
        submissions.push({
          challenge: challenge.id,
          submittedBy: team.id,
          submittedAt: timeStart + random.float() * 3600 * 1.5,
          passed: passed,
          penalty:
            gradingType === "auto" ? 0 : Math.floor(random.float() ** 2 * 5),
          dismissed: false,
          autoSubmissionInfo: null,
          id: submissions.length + 1,
        });
      }
    }
  }
  return toScoreboard(challenges, teams, submissions, autoProgress);
}

export async function getCurrentScoreboard() {
  const challenges = (await getChallenges()).filter((c) => c.enabled);
  const teams = await getChallengers();
  const submissions = await getAllSubmissions();
  const autoProgress: any[] = [];
  return toScoreboard(challenges, teams, submissions, autoProgress);
}

function toScoreboard(
  challenges: Tables["Challenges"][],
  teams: Tables["Portal_Users"][],
  submissions: Tables["Submissions"][],
  autoProgress: Tables["AutoProgress"][]
): Scoreboard {
  const challengeMap = new Map(challenges.map((c) => [c.id, c.maxScore]));
  const takeScore = (challengeId: number) => {
    const score = challengeMap.get(challengeId)!;
    challengeMap.set(challengeId, score - 1);
    return score;
  };
  return {
    challenges: challenges.map((c) => ({
      id: c.id,
      name: c.codename,
      maxScore: c.maxScore,
    })),
    teams: teams.map((t) => ({
      id: t.id,
      name: t.teamName!,
    })),
    submissions: submissions
      .sort((a, b) => a.submittedAt - b.submittedAt)
      .flatMap((s) => {
        if (s.dismissed) return [];
        return [
          {
            challengeId: s.challenge,
            teamId: s.submittedBy,
            status: s.passed ? "accepted" : "reviewing",
            penalty: s.penalty,
            submittedAt: new Date(s.submittedAt * 1e3).toISOString(),
            score: (s.passed ? takeScore(s.challenge) : 0) - s.penalty * 5,
          },
        ];
      }),
    progress: autoProgress.map((p) => ({
      challengeId: p.challenge,
      teamId: p.team,
      progress: p.progress,
    })),
  };
}

// await Bun.write(
//   "tmp.local/scoreboard-schema.json",
//   JSON.stringify(Scoreboard, null, 2)
// );
// await Bun.write(
//   "tmp.local/scoreboard-example.json",
//   JSON.stringify(generateExampleScoreboard(42), null, 2)
// );
