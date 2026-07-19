# Whisper Transcribe

Whisper Transcribe turns microphone recordings or local audio files into text
using Azure resources the User is already authorized to access. It is a
browser-only, vanilla JavaScript application with a Dynamic Island-style control
surface, Microsoft sign-in, and no application backend.

## Highlights

- **Microsoft sign-in** — a single-tenant Microsoft Entra SPA uses full-page
  redirects and an MSAL-managed session cache.
- **Two Transcription Models** — Azure Whisper and MAI-Transcribe 1.5, each with
  its own manually configured Target URI.
- **Two Audio Sources** — record with the microphone or choose local audio with
  **Upload audio**. Selected Audio is reviewed locally and is sent only after an
  explicit **Transcribe** action.
- **Safe recovery** — an Unsent Recording survives authentication or
  authorization failure in memory until the User downloads, discards, or
  successfully retries it. Redirects and logout never silently discard audio.
- **Transcript continuity** — transcriptions append with dividers, autosave to
  the browser, and support Grab, Restore, and Clear.
- **Unified User menu** — an initials-only launcher contains the Transcription
  Model, microphone, appearance, Target URI, Azure help, and logout paths.
- **Accessible interaction** — fixed hit targets, visible focus, WCAG-AA status
  colours, proportional confirmation, and complete reduced-motion behavior.

## How it works

Whisper Transcribe follows the Bring-your-own Azure model: each User authorizes
an Azure transcription resource available to them, while that resource's owner
retains access, quota, and billing responsibility. A Target URI identifies the
destination for a Transcription Model; it does not authorize access.

On startup the control surface shows **Checking sign-in…**. A signed-out User
chooses **Continue with Microsoft** and returns through the dedicated redirect
bridge. Recording and Upload audio become available only when authentication is
ready and the selected model has a valid HTTPS Target URI.

For microphone capture:

1. Choose **Start recording**, then pause, resume, finish, or discard as needed.
2. Choose **Done** to stop. The captured audio becomes an Unsent Recording while
   it is submitted.
3. On success, text appends to the transcript and the memory-only recording is
   released.

For a local file:

1. Choose **Upload audio** and select MP3, MP4, MPEG/MPGA, M4A, WAV, or WebM.
2. Review the Selected Audio name, format, size, and model-specific validation.
   Nothing has been sent to Azure at this point.
3. Choose **Transcribe**. Success converges on the same transcript path as a
   microphone recording; Remove, Choose another, and Retry stay explicit.

Only one Audio Source can be active at a time.

## Privacy and storage

- Audio Sources travel directly from the browser to the User's configured Azure
  Target URI. This application has no server that receives or stores them.
- Selected Audio and Unsent Recording blobs are memory-only. They are not put in
  localStorage, sessionStorage, event history, or logs. Closing the tab releases
  them, so recover an Unsent Recording before leaving.
- MSAL alone owns its opaque authentication cache in `localStorage` so a new
  same-origin tab can reuse the existing account without another **Continue
  with Microsoft** action when the Microsoft session permits it. Application
  modules never read that cache or persist, emit, or log access tokens; genuine
  interaction-required conditions still use the full-page sign-in flow.
- Transcript content, model choice, manual Target URIs, microphone preference,
  and theme are non-secret browser-local settings stored in `localStorage`.
- Startup performs a targeted, remove-only cleanup of the two historical
  credential entries. There is no API-key input or fallback path.

Azure processing remains governed by the User's Azure resource configuration
and applicable service terms.

## Prerequisites

- Node.js `>=22.12.0` and npm. CI uses Node.js 24.
- Current Microsoft Edge, Google Chrome, or Safari on macOS. These are the
  acceptance browsers; Firefox is not currently acceptance-qualified.
- A single-tenant Microsoft Entra SPA registration for the application.
- An individual Azure resource for each model the User will use, with its exact
  HTTPS Target URI known privately.
- External Azure RBAC assignments at the individual resources:
  - `Cognitive Services OpenAI User` for the Whisper resource.
  - `Cognitive Services Speech User` for the MAI-Transcribe 1.5 resource.

Whisper Transcribe diagnoses missing access but never creates or changes RBAC.
The complete human-gated setup and release procedure is in the
[keyless operator runbook](docs/keyless-operator-runbook.md).

## Microsoft Entra configuration

Register a **Single-page application** for accounts in one organizational
directory. Configure only the Microsoft Cognitive Services delegated permission
needed to act as the signed-in User. Do not add a client secret, certificate, or
unrelated Microsoft Graph permission.

The redirect URIs must match exactly:

```text
http://127.0.0.1:4173/auth/redirect.html
https://ahmedmuhi.github.io/whisper-transcribe/auth/redirect.html
```

Copy `.env.example` to a local environment file and supply the registration's
public identifiers privately:

```bash
VITE_ENTRA_CLIENT_ID=<public-spa-client-identifier>
VITE_ENTRA_TENANT_ID=<public-directory-identifier>
```

These values are public SPA build configuration, not credentials. Never put a
client secret, Azure credential, or Target URI in the Vite environment. For a
Pages deployment, configure the same two names as GitHub repository variables
used by `.github/workflows/pages.yml`.

After sign-in, open the initials-only **User menu**:

1. Under **Model**, select Azure Whisper or MAI-Transcribe 1.5.
2. Under **Settings**, enter both manual HTTPS Target URIs and save changes.
3. Use **Help & Azure setup** when the app reports HTTP 403. Access must be
   assigned outside the application.

## Development

Install the exact lockfile graph:

```bash
npm ci
```

Start the Vite development server at `http://127.0.0.1:4173`:

```bash
npm start
```

Build and preview the static production artifact:

```bash
npm run build
npm run preview
```

`npm run build` writes `dist/`. Preview serves that artifact at
`http://127.0.0.1:4176`; it is not a production server.

The deterministic verification commands are:

```bash
npm run lint
npm run test:coverage
npm run deps:check
npm run deps:check:prod
npm audit --audit-level=high
npm run size
npm run test:browser
```

Useful focused commands are `npm test`, `npm run test:watch`,
`npm run lint:fix`, and `npm run test:browser:headed`. The deterministic browser
suite uses Chromium and a built test artifact. `npm run test:browser:live` is a
separate, protected, opt-in two-model OIDC contract; never run it as an ordinary
local or CI gate.

Coverage thresholds are statements 85%, branches 80%, functions 70%, and lines
85%. Husky runs lint before commit and coverage plus the production dependency
check before push.

## Architecture

- Vite `8.1.5` builds a multi-page static artifact from `index.html` and
  `auth/redirect.html`; production stays browser-only and uses no UI framework.
- Exactly pinned `@azure/msal-browser` `5.17.1` is the sole production
  dependency. Vite and the test tools are build-time dependencies.
- `AuthenticationService` is the only MSAL owner. A narrow token provider
  supplies request-local tokens to `AzureAPIClient`, which alone constructs the
  bearer header. Model adapters remain credential-blind.
- `RecordingStateMachine` owns microphone lifecycle state.
  `SelectedAudioController` separately owns one memory-only Selected Audio
  file. `AudioHandler` and the controller compose the one-Audio-Source safety
  boundary.
- The singleton event bus carries presentation-safe state and lifecycle events;
  token and audio data never cross it.
- `TranscriptStore` owns the one browser-local transcript record.

HTTP 401 triggers explicit Microsoft recovery while retaining the current
Unsent Recording or Selected Audio. HTTP 403 points to external RBAC guidance.
HTTP 429 and selected 5xx responses use bounded retries; authentication and
authorization failures do not retry.

See [ADR-0001](docs/adr/0001-adopt-vite-and-msal-browser.md) for the packaging
decision and [CONTEXT.md](CONTEXT.md) for canonical domain language.

## Deployment

GitHub Pages deployment is artifact-based, not branch publication.
`.github/workflows/pages.yml` installs from the lockfile, builds in Pages mode,
uploads only `dist/`, and deploys through the protected `github-pages`
environment. Configure the repository's Pages source as **GitHub Actions** and
qualify one immutable candidate SHA before deployment; do not serve repository
source directly.

The protected live OIDC workflow is evidence-only and is intentionally separate
from the SPA identity. Its external identity, federation, RBAC, live-service,
and later resource-enforcement stages are future human-gated operations in the
operator runbook. CI never has permission to change Azure resources, RBAC,
keys, or local-authentication policy.

## Roadmap

Future work may improve transcript analysis and browser qualification without
changing the Bring-your-own Azure ownership model. Multi-tenant sign-in,
resource discovery, hosted transcription, shared Azure resources, and an
application backend are not part of the current architecture.

## License

[MIT](LICENSE) © 2026 Ahmed Muhi
