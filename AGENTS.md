# JariZip contributor guide

Read README.md before changing product behavior.

## Product boundaries
- JariZip is a Korean local-first career workspace with a character-led landing page and a readable working app.
- Every bundled person, company, posting, document and application is fictional. Never add a real person's resume, application history, credentials or private data to fixtures, screenshots, issues or source control.
- Do not label demo listings as verified live jobs. A manually imported job starts unverified. Display manual checks with their date; never treat HTTP availability as evidence of active hiring.
- Current interview questions and skill comparisons are deterministic local rules, not LLM evaluations or hiring probabilities. Unconnected integrations must remain honestly labeled.
- No document content, voice recording, analytics or API keys may leave the browser without a separately designed explicit consent flow.

## Data integrity
- A confirmed submission references exact immutable document version IDs. Editing must create a new version and must not silently replace a submitted original.
- The job snapshot belongs to an application and stays unchanged when the source listing changes.
- Validate backup imports, preserve malformed stored data for recovery, and report storage failures accurately. Never claim saving succeeded before the IndexedDB transaction commits.
- Render imported content as text, not HTML. Accept only validated external HTTP(S) URLs and supported document/audio data formats.
- Keep browser data, generated builds, screenshots from test failures and local runtime processes out of source control.

## Interface and accessibility
- Public page: deep navy, electric cobalt, restrained cyan and original Jippi artwork. Working app: white, ink, clear rules and a restrained blue accent. No gradients, fake testimonials, match percentages or popularity metrics.
- Keep landing styles scoped to `.lz-` and working-app styles separate.
- Preserve mobile layouts, native keyboard-operable dialogs, visible focus and reduced-motion support. Recording must stop on navigation.
- Font assets should come from installed packages, not external font requests.

## Verification
Run `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` for relevant changes. Browser tests use isolated contexts and synthetic audio, never a user's browser profile or microphone. Inspect desktop and mobile screenshots after visual changes.
