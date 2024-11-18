import { Elysia, t } from "elysia";

import { cors } from "@elysiajs/cors";
import consola from "consola";
import type { JWTPayload } from "jose";
import {
  generateAuthgartenAuthorizeURL,
  validateAuthgartenToken,
} from "./authgarten";
import { createLogger } from "./createLogger";
import {
  approveSubmission,
  createSubmission,
  getChallengers,
  getChallenges,
  getPendingReviewSubmissions,
  getSubmissions,
  getUserInfo,
  onboardUser,
  registerUser,
  rejectSubmission,
  type Tables,
} from "./db";
import { layout } from "./layout";
import { saveToStorage } from "./objectStorage";
import { generateSessionToken, resolveSession } from "./session";
import {
  generateSubmissionToken,
  validateSubmissionToken,
} from "./submissions";
import { getDirectorUrl, getGuestUrl } from "./vdoNinja";
import { html, respondWithPage, type Html } from "./View";
const port = 9749;

const app = new Elysia()
  .use(createLogger())
  .onError(({ error, code }) => {
    consola.error(`[elysia]`, code, error);
  })
  .group("/api", (app) =>
    app.use(cors()).group(
      "/submissions",
      {
        headers: t.Object({
          "x-submission-token": t.String(),
        }),
      },
      (app) =>
        app
          .resolve(async ({ headers, error }) => {
            const token = headers["x-submission-token"];
            try {
              const result = await validateSubmissionToken(token);
              return { submissionTokenInfo: result };
            } catch (e) {
              return error(401);
            }
          })
          .get("/tokeninfo", ({ submissionTokenInfo }) => {
            return submissionTokenInfo;
          })
          .post(
            "/submit",
            async ({ submissionTokenInfo, body }) => {
              const file = await saveToStorage(
                JSON.stringify(body),
                "application/json",
                ".json"
              );
              const userInfo = await getUserInfo(submissionTokenInfo.sub);
              if (!userInfo) {
                throw new Error("User not found");
              }
              await createSubmission(
                userInfo,
                { id: submissionTokenInfo.challengeId },
                file
              );
              return { ok: true };
            },
            {
              body: t.Any(),
            }
          )
    )
  )
  .guard({
    cookie: t.Cookie({
      ss_session: t.Optional(t.String()),
      ss_csrf_token: t.Optional(t.String()),
    }),
  })
  .resolve(async ({ cookie, request }) => {
    const url = new URL(request.url);
    if (!cookie.ss_csrf_token.value) {
      cookie.ss_csrf_token.set({
        value: crypto.randomUUID(),
        httpOnly: true,
        path: "/",
      });
    }
    const csrfToken = cookie.ss_csrf_token.value;
    const clientId = url.origin;
    return {
      auth: {
        session: await resolveSession(cookie.ss_session.value),
        clientId,
        csrfToken,
        generateLoginUrl: () =>
          generateAuthgartenAuthorizeURL({
            clientId: clientId,
            redirectUri: url.origin + "/authgarten-callback",
            state: csrfToken,
          }),
        saveSession: async (sessionData: JWTPayload) => {
          cookie.ss_session.set({
            value: await generateSessionToken(sessionData),
            httpOnly: true,
            path: "/",
          });
        },
      },
    };
  })
  .resolve(async ({ auth }) => {
    const sub = auth.session.active?.["sub"];
    const userInfo = sub ? await getUserInfo(sub) : null;
    return { userInfo: userInfo };
  })
  .get(
    "/",
    ({ auth, userInfo }) =>
      respondWithPage(layout, async (page) => {
        page.title = "Home";

        if (auth.session.active) {
          if (userInfo?.enrolled) {
            return page.redirect("/dashboard");
          }
          page.write(html`
            <p>Welcome, <strong>${auth.session.active["name"]}</strong></p>
            <p>Are you a challenger or an observer?</p>
            <p>
              <a href="/onboarding" class="btn btn-outline-warning"
                >I am a registered challenger in this event</a
              >
              <a href="/dashboard" class="btn btn-outline-info"
                >I am an observer, playing along</a
              >
            </p>
          `);
        } else {
          page.write(html`<p>Not logged in</p>`);
          page.write(
            html`<p>
              <a href="${auth.generateLoginUrl()}" class="btn btn-primary"
                >Login</a
              >
            </p>`
          );
        }
      }),
    {}
  )
  .get(
    "/authgarten-callback",
    async ({ auth, query, redirect }) => {
      if (query.state !== auth.csrfToken) {
        return new Response("Invalid CSRF token", { status: 400 });
      }
      const result = await validateAuthgartenToken(
        query.id_token,
        auth.clientId
      );
      await auth.saveSession({
        sub: result.payload.sub,
        name: result.payload["name"],
      });
      await registerUser(result.payload.sub!, {
        name: result.payload["name"] as string,
      });
      return redirect("/");
    },
    {
      query: t.Object({
        id_token: t.String(),
        state: t.String(),
      }),
    }
  )
  .guard({}, (app) =>
    app
      .onBeforeHandle(({ userInfo }) => {
        if (!userInfo) {
          return new Response("Unauthorized", { status: 401 });
        }
      })
      .resolve(async ({ userInfo }) => {
        return { userInfo: userInfo! };
      })
      .get(
        "/onboarding",
        ({ userInfo }) =>
          respondWithPage(layout, async (page) => {
            page.title = "Challenger onboarding";
            page.write(
              html`
                <p>Welcome, <strong>${userInfo["name"]}!</strong></p>
                <form action="/onboarding" method="post">
                  <div class="mb-3">
                    <label for="location" class="form-label"
                      >What is your team name?</label
                    >
                    <input
                      type="text"
                      class="form-control"
                      name="teamName"
                      required
                    />
                  </div>
                  <button type="submit" class="btn btn-primary">Submit</button>
                </form>
              `
            );
          }),
        {}
      )
      .post(
        "/onboarding",
        async ({ userInfo, body, redirect }) => {
          await onboardUser(userInfo.sub, { teamName: body.teamName });
          return redirect("/onboarding-confirm");
        },
        {
          body: t.Object({
            teamName: t.String(),
          }),
        }
      )
      .get("/onboarding-confirm", ({ userInfo }) =>
        respondWithPage(layout, async (page) => {
          page.title = "Please wait for staff team to onboard";
          page.write(html`
            <p>Your team name is <strong>${userInfo.teamName}</strong></p>

            <p>Present the following information to the staff team:</p>
            <table class="table table-bordered" style="width: auto">
              <tbody>
                <tr>
                  <td>User name</td>
                  <td>${userInfo.name}</td>
                </tr>
                <tr>
                  <td>Your team name</td>
                  <td>${userInfo.teamName}</td>
                </tr>
                <tr>
                  <td>Your user ID</td>
                  <td>${userInfo.sub}</td>
                </tr>
              </tbody>
            </table>

            <!--
            <p>
              Our staff team will scan the QR code below to onboard you. Please
              wait.
            </p>
            <script src="https://cdn.jsdelivr.net/npm/wc-qrcode@0.1.6"></script>
            <p>
              <div style="display: inline-block;background:#fff;padding:16px">
                <qr-code text="${userInfo.sub}" size="10"></qr-code>
              </div>
            </p>
            -->
            <p>
              After confirmation from staff team, please click the button below
              to proceed to the dashboard.
            </p>
            <a href="/dashboard" class="btn btn-primary"
              >Proceed to dashboard</a
            >
          `);
        })
      )
      .get("/dashboard", ({ userInfo, request }) =>
        respondWithPage(layout, async (page) => {
          page.title = "Dashboard";
          const isAdmin = userInfo.admin;
          const isEnrolled = userInfo.enrolled;
          const name = isEnrolled
            ? userInfo.teamName || userInfo.name
            : userInfo.name;

          const getChallengeUrl = async (challenge: Tables["Challenges"]) => {
            const url = new URL(challenge.url!);
            if (challenge.gradingType === "auto") {
              url.searchParams.set(
                "submitTo",
                new URL("/api/submissions/submit", request.url).toString()
              );
              url.searchParams.set(
                "token",
                await generateSubmissionToken(userInfo, challenge)
              );
              url.searchParams.set(
                "reportTo",
                Bun.env["PROGRESS_REPORTER_URL"] || "ws://localhost:9750"
              );
            }
            return url.toString();
          };

          const mySubmissionsPromise = getSubmissions(userInfo);
          const renderSubmission = async (challenge: Tables["Challenges"]) => {
            const submission = (await mySubmissionsPromise).find(
              (x) => x.challenge === challenge.id
            );
            if (submission?.passed) {
              return html`<span class="badge bg-success">Passed</span>`;
            }
            if (submission && !submission.dismissed) {
              return html`<span class="badge bg-warning">Pending review</span>`;
            }
            if (challenge.gradingType === "auto") return "auto-submit";
            return html`<form
              action="/request-review"
              method="post"
              onsubmit="return confirm('Are you sure? There is a penalty for failed submissions.')"
            >
              <input
                type="hidden"
                name="challenge"
                value="${challenge.codename}"
              />
              <button type="submit" class="btn btn-info btn-sm">
                Request review
              </button>
            </form>`;
          };

          page.write(html`
            <p>Welcome, <strong>${name}</strong></p>
            ${isEnrolled
              ? html`
                  <p>
                    <a href="${getGuestUrl(name)}" class="btn btn-outline-info"
                      >Share my screen with VDO.ninja</a
                    >
                  </p>
                `
              : ""}
            <h2>Challenges</h2>
            ${!isEnrolled
              ? html`
                  <div class="alert alert-warning" role="alert">
                    You are a spectator. You can view the challenges and play
                    along, but you cannot submit solutions.
                  </div>
                `
              : ""}
            ${getChallenges().then((challenges) => {
              return html`
                <table class="table table-bordered">
                  <thead>
                    <tr>
                      <th scope="col">Challenge</th>
                      <th scope="col">Link</th>
                      ${isEnrolled ? html`<th scope="col">Submit</th>` : ""}
                    </tr>
                  </thead>
                  <tbody>
                    ${challenges
                      .filter((x) => isAdmin || x.enabled)
                      .map((challenge) => {
                        const cells: Html[] = [];
                        cells.push(html`<td>${challenge.codename}</td>`);
                        cells.push(html`<td>
                          ${challenge.url
                            ? html`<a
                                class="btn btn-primary btn-sm"
                                href="${getChallengeUrl(challenge)}"
                                >Go to challenge</a
                              >`
                            : ""}
                        </td>`);
                        if (isEnrolled) {
                          cells.push(html`<td>
                            ${renderSubmission(challenge)}
                          </td>`);
                        }
                        return html`
                          <tr>
                            ${cells}
                          </tr>
                        `;
                      })}
                  </tbody>
                </table>
              `;
            })}
          `);
        })
      )
      .post(
        "/request-review",
        async ({ userInfo, body, error }) => {
          const challengeCodename = body.challenge;
          const challenges = await getChallenges();
          const challenge = challenges.find(
            (x) => x.codename === challengeCodename
          );
          if (!challenge) {
            return error(404);
          }
          await createSubmission(userInfo, challenge);
          return respondWithPage(layout, async (page) => {
            page.title = "Review requested";
            page.write(html`
              <p>Review requested for ${challenge.codename}</p>
              <p>
                <a href="/dashboard" class="btn btn-primary"
                  >Back to dashboard</a
                >
              </p>
            `);
          });
        },
        {
          body: t.Object({
            challenge: t.String(),
          }),
        }
      )
      .group("/admin", (app) =>
        app
          .onBeforeHandle(({ userInfo }) => {
            if (!userInfo.admin) {
              return new Response("Forbidden", { status: 403 });
            }
          })
          .get("/", async () =>
            respondWithPage(layout, async (page) => {
              page.title = "Admin";
              page.write(html`
                <ul>
                  <li><a href="${getDirectorUrl()}">VDO Ninja Director</a></li>
                  <li><a href="/admin/review">Review</a></li>
                </ul>
              `);
            })
          )
          .get("/review", async () =>
            respondWithPage(layout, async (page) => {
              page.title = "Review";
              const challenges = await getChallenges();
              const challengers = await getChallengers();
              const challengeMap = new Map(challenges.map((x) => [x.id, x]));
              const challengerMap = new Map(challengers.map((x) => [x.id, x]));
              const submissions = await getPendingReviewSubmissions();
              page.write(html`
                <script
                  type="module"
                  src="https://cdn.jsdelivr.net/npm/@github/relative-time-element@4.4.3/dist/bundle.js"
                ></script>
                <table class="table table-bordered">
                  <thead>
                    <tr>
                      <th scope="col">RowID</th>
                      <th scope="col">Time</th>
                      <th scope="col">Challenge</th>
                      <th scope="col">Team</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${submissions.map((submission) => {
                      const time = new Date(
                        submission.submittedAt * 1e3
                      ).toISOString();
                      const hms = new Date(
                        submission.submittedAt * 1e3 + 7 * 3600e3
                      )
                        .toISOString()
                        .slice(11, 19);
                      return html`
                        <tr>
                          <td>#${submission.id}</td>
                          <td>
                            [${hms}]
                            <relative-time datetime="${time}"></relative-time>
                          </td>
                          <td>
                            ${challengeMap.get(submission.challenge)?.codename}
                          </td>
                          <td>
                            ${challengerMap.get(submission.submittedBy)
                              ?.teamName}
                          </td>
                          <td>
                            <div style="display: flex; gap: 0.5rem;">
                              <form
                                action="/admin/submissions/${submission.id}/review"
                                method="post"
                                onsubmit="return confirm('Are you sure?')"
                                style="display: contents"
                              >
                                <button
                                  type="submit"
                                  class="btn btn-success btn-sm"
                                  name="action"
                                  value="approve"
                                >
                                  Approve
                                </button>
                                <button
                                  type="submit"
                                  class="btn btn-danger btn-sm"
                                  name="action"
                                  value="reject"
                                >
                                  Reject
                                </button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      `;
                    })}
                  </tbody>
                </table>
              `);
            })
          )
          .post(
            "/submissions/:id/review",
            async ({ params, body, redirect, error }) => {
              if (body.action === "approve") {
                await approveSubmission(params.id);
              } else if (body.action === "reject") {
                await rejectSubmission(params.id);
              } else {
                return error("Bad Request");
              }
              return redirect("/admin/review");
            },
            {
              params: t.Object({
                id: t.Number(),
              }),
              body: t.Object({
                action: t.String(),
              }),
            }
          )
      )
  );
app.listen(
  {
    hostname: "127.0.0.1",
    port,
  },
  () => {
    console.log(`Server is running on http://localhost:${port}/`);
  }
);
