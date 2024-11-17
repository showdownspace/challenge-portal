import type { Tables } from "./db";
import { JwtUtils } from "./jwtUtils";

const jwtUtils = new JwtUtils("submitter");

export async function generateSubmissionToken(
  userInfo: Tables["Portal_Users"],
  challenge: Tables["Challenges"]
) {
  return jwtUtils.sign({
    sub: userInfo.sub,
    teamName: userInfo.teamName,
    challengeId: challenge.id,
    challengeCodename: challenge.codename,
  });
}

export async function validateSubmissionToken(token: string) {
  const payload = await jwtUtils.verify(token);
  return {
    sub: payload.sub as string,
    teamName: payload["teamName"] as string,
    challengeId: payload["challengeId"] as number,
    challengeCodename: payload["challengeCodename"] as string,
  };
}
