import { Elysia, t } from "elysia";

import type { JWTPayload } from "jose";
import {
  generateAuthgartenAuthorizeURL,
  validateAuthgartenToken,
} from "./authgarten";
import { createLogger } from "./createLogger";
import { getChallenges, getUserInfo, onboardUser, registerUser } from "./db";
import { layout } from "./layout";
import { generateSessionToken, resolveSession } from "./session";
import { html, respondWithPage } from "./View";
const port = 9749;

const app = new Elysia()
  .use(createLogger())
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

  .get(
    "/",
    ({ auth }) =>
      respondWithPage(layout, async (page) => {
        page.title = "Home";

        if (auth.session.active) {
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
      .resolve(async ({ auth }) => {
        const sub = auth.session.active?.["sub"];
        const userInfo = sub ? await getUserInfo(sub) : null;
        return { userInfo: userInfo! };
      })
      .onBeforeHandle(({ userInfo }) => {
        if (!userInfo) {
          return new Response("Unauthorized", { status: 401 });
        }
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
            <p>
              Our staff team will scan the QR code below to onboard you. Please
              wait.
            </p>
            <script src="https://cdn.jsdelivr.net/npm/wc-qrcode@0.1.6"></script>
            <div style="display: inline-block;background:#fff;padding:16px">
              <qr-code text="${userInfo.sub}" size="10"></qr-code>
            </div>
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
      .get("/dashboard", ({ userInfo }) =>
        respondWithPage(layout, async (page) => {
          page.title = "Dashboard";
          const isAdmin = userInfo.admin;
          const name = userInfo.teamName || userInfo.name;
          page.write(html`
            <p>Welcome, <strong>${name}</strong></p>
            <p>Challenges</p>
            ${getChallenges().then((challenges) => {
              return html`
                <table class="table table-bordered">
                  <thead>
                    <tr>
                      <th scope="col">Challenge</th>
                      <th scope="col">Link</th>
                      <th scope="col">Submit</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${challenges.map(
                      (challenge) => html`
                        <tr>
                          <td>${challenge.codename}</td>
                          <td>
                            <a class="btn btn-primary btn-sm" href="#"
                              >Go to challenge</a
                            >
                          </td>
                          <td>
                            ${challenge.gradingType === "auto"
                              ? "auto-submit"
                              : html`<form
                                  action="/request-review"
                                  method="post"
                                >
                                  <input
                                    type="hidden"
                                    name="challenge"
                                    value="${challenge.codename}"
                                  />
                                  <button
                                    type="submit"
                                    class="btn btn-info btn-sm"
                                  >
                                    Request review
                                  </button>
                                </form>`}
                          </td>
                        </tr>
                      `
                    )}
                  </tbody>
                </table>
              `;
            })}
          `);
        })
      )
      .group("/admin", (app) =>
        app
          .onBeforeHandle(({ userInfo }) => {
            if (!userInfo.admin) {
              return new Response("Forbidden", { status: 403 });
            }
          })
          .get("/onboard", async () => {
            return new Response("Staff dashboard");
          })
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
