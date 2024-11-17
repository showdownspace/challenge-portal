import { type Html, html, type PageLayout } from "./View";

export const layout: PageLayout = {
  template: ({ title, head, body }) => html`
    <!DOCTYPE html>
    <html lang="en" data-bs-theme="dark">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <link
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
          rel="stylesheet"
          integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
          crossorigin="anonymous"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Fragment+Mono:ital@0;1&family=Sarabun:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800&family=Work+Sans:ital,wght@0,100..900;1,100..900&display=swap"
          rel="stylesheet"
        />
        <style>
          :root {
            --bs-font-sans-serif: "Work Sans", Sarabun, sans-serif;
            --bs-body-bg: #272d2d;
          }
        </style>
        ${head}
      </head>
      <body>
        <div class="container py-4">
          <h1>${title}</h1>
          ${body}
        </div>
        <script src="https://code.iconify.design/iconify-icon/1.0.2/iconify-icon.min.js"></script>
        <script
          src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.2/dist/htmx.min.js"
          integrity="sha256-4XRtl1nsDUPFwoRFIzOjELtf1yheusSy3Jv0TXK1qIc="
          crossorigin="anonymous"
        ></script>
        <script
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
          integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz"
          crossorigin="anonymous"
        ></script>
      </body>
    </html>
  `,

  renderError: (error: Error) => codeBlock(error.stack || error.message),

  renderLogs: (logs: string[]) => html`
    <div class="mt-5 mb-2 text-muted">
      ${icon("codicon:output")} <strong>Logs</strong>
    </div>
    <div class="fs-6">${logs.map((l) => codeBlock(l))}</div>
  `,
};

export function icon(name: string) {
  return html`<iconify-icon icon="${name}" inline></iconify-icon>`;
}

function codeBlock(children: Html) {
  return html`<textarea
    class="p-3 form-control mb-0 font-monospace"
    style="letter-spacing: 0;"
    rows="16"
    readonly
  >
${children}</textarea
  >`;
}
