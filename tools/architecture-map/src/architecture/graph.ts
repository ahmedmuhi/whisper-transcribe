/**
 * The authored half of the map: neighbourhoods, what each building is for,
 * the call paths between them, and the flows a newcomer presses first.
 *
 * Counts, heights, shapes and footprints are not written here. They come from
 * measured.generated.ts (the scanner) through core/layout.ts (the derivation),
 * so the only thing a human maintains is the prose and the graph.
 *
 * Every edge below was traced to a line of code when it was drawn. If you
 * cannot point at the call, do not add the line.
 */
import type { ArchitectureData } from './components/ArchitectureMap'
import { deriveArchetype, deriveHeight, deriveSize, packLayout, type Measure } from './core/layout'
import type { ArchEdge, ArchFlow, ArchNode, Group } from './core/types'
import { MEASURED, UNCLAIMED } from './measured.generated'

export const GROUPS: readonly Group[] = [
  { id: 'entry', label: 'Entry & bootstrap' },
  { id: 'identity', label: 'Keyless sign-in' },
  { id: 'audio', label: 'Audio in' },
  { id: 'transcribe', label: 'Transcribing' },
  { id: 'prefs', label: 'Settings & transcript' },
  { id: 'present', label: 'Presentation' },
  { id: 'outside', label: 'Outside world' },
]

type Authored = Omit<ArchNode, 'archetype' | 'params' | 'footprint' | 'height' | 'count' | 'loc'>

const AUTHORED: readonly Authored[] = [
  // Entry & bootstrap
  {
    id: 'boot',
    code: 'BT',
    name: 'Bootstrap',
    role: 'the wiring floor',
    group: 'entry',
    whatItDoes:
      'Turns a blank page into a working app on DOMContentLoaded. It wipes two credential names ' +
      'left behind by pre-Entra releases, builds every long-lived object once, hands each one its ' +
      'dependencies, and awaits the sign-in check while the UI is already on screen.',
    howItsBuilt:
      'Construction order is the contract, not an accident: the legacy wipe runs before anything ' +
      'can read storage, and the [[AuthenticationService]] initialize() promise is held while ' +
      'Settings, the UI and the settings surface render, so the redirect result resolves against a ' +
      'page the User can already see. The Vite config gives MSAL its own chunk and aliases the ' +
      'whole service away in the two test modes, which is how the deterministic fake never reaches ' +
      'production.',
    files: ['js/main.js', 'js/legacy-credential-cleanup.js', 'index.html', 'vite.config.js'],
    stack: ['Vite', 'Rollup', 'ES modules', '@azure/msal-browser'],
  },
  {
    id: 'spine',
    code: 'SP',
    name: 'Constants & event bus',
    role: 'the shared vocabulary',
    group: 'entry',
    whatItDoes:
      'Holds every name the rest of the app agrees on, and the pub/sub channel it talks over. One ' +
      'file has the storage keys, DOM ids, user-facing messages, model ids, upload ceilings, timeouts ' +
      'and the legal recording-state transition table; the other is a singleton event bus plus the ' +
      'agreed list of event names.',
    howItsBuilt:
      'The [[STATE_TRANSITIONS]] table lives here as data rather than inside the state machine, so ' +
      'the legal moves are readable and testable without instantiating anything. Event history is ' +
      'off by default and clears when disabled, because payloads must never become a place a token ' +
      'could linger.',
    files: ['js/constants.js', 'js/event-bus.js'],
    stack: ['ES modules', 'publish-subscribe'],
  },

  // Keyless sign-in
  {
    id: 'authsvc',
    code: 'AS',
    name: 'Authentication service',
    role: 'the sole MSAL owner',
    group: 'identity',
    whatItDoes:
      'Gets the User signed in to their own Azure and keeps a live account on hand, so anything ' +
      'that needs an access token can ask for one. It handles the return leg of a full-page ' +
      'redirect, picks the active account, refreshes tokens silently with [[acquireTokenSilent]], ' +
      'and sends the User back out to Microsoft only when Entra genuinely needs them to interact.',
    howItsBuilt:
      'Every failure is squeezed through one categoriser into a small set of safe states (ready, ' +
      'signed out, interaction required, network, config, error) and published as an event carrying ' +
      'nothing but that word. Nothing else in the app ever sees an MSAL error object, a token, or an ' +
      'authentication response, which is what makes it safe to log and render the auth state anywhere.',
    files: ['js/authentication-service.js', 'js/authentication-config.js'],
    stack: ['@azure/msal-browser', 'PublicClientApplication', 'Microsoft Entra ID'],
  },
  {
    id: 'tokens',
    code: 'TK',
    name: 'Token provider',
    role: 'the token keyhole',
    group: 'identity',
    whatItDoes:
      'Hands out one access token for one declared scope, at the moment a request is about to go ' +
      'out. That is the entire surface: [[getToken]] and nothing else.',
    howItsBuilt:
      'A frozen object with a single method, deliberately smaller than the service behind it. The ' +
      'API client gets no way to ask about accounts, sign-in, or state, and the provider keeps no ' +
      'copy of what it returns.',
    files: ['js/token-provider.js'],
    stack: ['plain JavaScript'],
  },
  {
    id: 'authguard',
    code: 'NS',
    name: 'Navigation safety',
    role: 'the navigation interlock',
    group: 'identity',
    whatItDoes:
      'Stands between every button that would navigate away (Continue with Microsoft, Sign out) and ' +
      'the actual redirect. It asks the Audio Source coordinator whether audio would be lost, and ' +
      'refuses to navigate while a recording is live, a Selected Audio file is held, or an ' +
      '[[Unsent Recording]] has not been dealt with.',
    howItsBuilt:
      'Nothing is ever auto-discarded or auto-uploaded to make a redirect possible. The Unsent ' +
      'Recording path is two explicit steps, download first and then a separate continue, and a ' +
      'discard needs a confirmation callback the UI owns. No method throws: each returns a ' +
      '{ state } result so the caller renders an explanation instead of guessing.',
    files: ['js/auth-interaction-controller.js'],
    stack: ['plain JavaScript'],
  },
  {
    id: 'callback',
    code: 'RB',
    name: 'Redirect bridge',
    role: 'the sign-in landing page',
    group: 'identity',
    whatItDoes:
      'The tiny page Entra sends the browser back to after sign-in. It reads the authorization ' +
      'response out of the URL, passes it to the tab that started the sign-in, and shows one line ' +
      'of text.',
    howItsBuilt:
      'It imports exactly one function from the MSAL [[redirect-bridge]] and nothing else: no app ' +
      'bootstrap, no storage, no Azure call. Keeping it inert is the point. It is a second build ' +
      'entry in Vite purely so this page stays a dead end for anything but the handoff, and it ' +
      'never says why a sign-in failed.',
    files: ['auth/redirect.html'],
    stack: ['@azure/msal-browser/redirect-bridge'],
  },

  // Audio in
  {
    id: 'mic',
    code: 'MC',
    name: 'Microphone capture',
    role: 'the recording desk',
    group: 'audio',
    whatItDoes:
      'Runs a microphone recording from end to end: asks for the mic, starts a MediaRecorder, ticks ' +
      'the timer, then hands the finished audio to the transcription client. If that send fails it ' +
      'keeps the audio as an [[Unsent Recording]] so the User can retry or download it instead of ' +
      'losing it.',
    howItsBuilt:
      'Each attempt lives in its own session object with failureHandled and stopEventHandled flags ' +
      'rather than in instance fields, because MediaRecorder can fire stop and error for the same ' +
      'attempt, and a late event from an abandoned recording must not tear down a newer one. The ' +
      'state machine stays in INITIALIZING until recorder.start() actually returns, so a mic that ' +
      'fails to open never shows a recording UI.',
    files: ['js/audio-handler.js', 'js/permission-manager.js'],
    stack: ['MediaRecorder', 'getUserMedia', 'Permissions API'],
  },
  {
    id: 'fsm',
    code: 'SM',
    name: 'Recording state machine',
    role: 'the recording rulebook',
    group: 'audio',
    whatItDoes:
      'Holds the one true answer to "what is the recorder doing right now" and refuses any move ' +
      'that is not on the legal transitions table. Every state it enters announces itself on the ' +
      'event bus, which is how the button cluster and status line know what to show.',
    howItsBuilt:
      'State handlers only emit events and never touch the DOM, so the whole recording lifecycle is ' +
      'testable without a browser and the UI is a pure function of [[RECORDING_STATE_CHANGED]]. An ' +
      'illegal transition returns false and logs rather than throwing, so a stray click during ' +
      'teardown cannot crash the recorder.',
    files: ['js/recording-state-machine.js'],
    stack: [],
  },
  {
    id: 'picker',
    code: 'SA',
    name: 'Selected audio',
    role: 'the file drop owner',
    group: 'audio',
    whatItDoes:
      'Owns exactly one local audio file that the User picked or dragged in, checks its format, size ' +
      'and duration before anything leaves the machine, and sends it only when the User explicitly ' +
      'presses Transcribe. On success it drops the file and rejoins the same transcript path a ' +
      'microphone recording takes.',
    howItsBuilt:
      'The File itself is a private field and never appears in the snapshot the UI reads, so ' +
      '[[Selected Audio]] can be displayed without any surface holding a reference to User audio. A ' +
      'generation counter guards every await, so a file swapped out mid-validation or mid-request ' +
      'quietly abandons the older result instead of overwriting the newer one.',
    files: ['js/selected-audio-controller.js'],
    stack: ['File API', 'AbortController'],
  },
  {
    id: 'encode',
    code: 'EN',
    name: 'Audio conversion',
    role: 'the WAV bench',
    group: 'audio',
    whatItDoes:
      'Turns whatever the browser recorded, usually WebM/Opus, into 16 kHz mono 16-bit WAV, because ' +
      'the MAI model rejects WebM/Opus outright. Decode, resample, downmix, encode, hand back a Blob.',
    howItsBuilt:
      'The split is deliberate: decode and resample stay on the main thread because ' +
      'OfflineAudioContext does not exist in a Worker, while the int16 sample loop, the part that ' +
      'actually stalls a long recording, is posted to a module Worker with the buffer transferred. ' +
      'Worker and main thread share the same pure [[encodeWav]], so the synchronous fallback is ' +
      'byte-identical, and a Worker that fails once is disabled for the session rather than retried.',
    files: ['js/audio-converter.js', 'js/audio-converter.worker.js', 'js/wav-encoder.js'],
    stack: ['Web Audio API', 'OfflineAudioContext', 'Web Worker'],
  },
  {
    id: 'viz',
    code: 'WV',
    name: 'Waveform',
    role: 'the level meter',
    group: 'audio',
    whatItDoes:
      'Draws the scrolling amplitude waveform while recording, Voice Memos style: newest bar on the ' +
      'right, older bars sliding left and fading at the edge.',
    howItsBuilt:
      'Amplitude is sampled on a 100 ms timer into a rolling array while requestAnimationFrame only ' +
      'redraws that array, so the picture is a fixed history rather than whatever the last frame ' +
      'happened to catch. Bar colours are read once per session from [[--visualizer-bar]] and ' +
      'pre-quantised into 33 rgba strings, so the canvas follows the chosen palette with no per-bar ' +
      'string allocation in the draw loop.',
    files: ['js/visualization.js'],
    stack: ['Web Audio API', 'AnalyserNode', 'Canvas 2D'],
  },

  // Transcribing
  {
    id: 'client',
    code: 'AC',
    name: 'Azure API client',
    role: 'the request runner',
    group: 'transcribe',
    whatItDoes:
      'Takes an audio blob, checks the User has a usable Target URI, asks the current Transcription ' +
      'Model’s adapter to build the request body, then posts it to Azure with a bearer token and ' +
      'hands back plain text. It is the only module in the app that ever writes an Authorization header.',
    howItsBuilt:
      'The token is fetched as late as possible, right before the fetch, and lives only in a ' +
      'request-local options object that nothing outside the [[bounded retry loop]] can see. The ' +
      'retry rules are narrow on purpose: 429 plus 500, 502, 503 and 504 and per-attempt abort ' +
      'timeouts retry under backoff with a Retry-After cap and an overall deadline, while 401 and 403 ' +
      'never retry and never read the response body, because one means "go re-authenticate" and the ' +
      'other means "your Azure RBAC says no".',
    files: ['js/api-client.js'],
    stack: ['fetch', 'AbortController', 'FormData'],
  },
  {
    id: 'adapters',
    code: 'MA',
    name: 'Model adapters',
    role: 'the per-model request shape',
    group: 'transcribe',
    whatItDoes:
      'One small frozen object per Transcription Model that knows how to turn an audio blob into a ' +
      'request body and how to pull the text back out of whatever Azure sends. Whisper and GPT ' +
      'Transcribe post the source file as multipart form data; MAI-Transcribe first converts to ' +
      '16 kHz mono WAV and attaches a JSON definition part.',
    howItsBuilt:
      'Adapters are deliberately [[credential-blind]]: each declares its scope and the storage key ' +
      'for its Target URI, but no adapter ever sees a token or builds a header; only the API client ' +
      'does that. An adapter is also more than a request builder: it carries the settings row ids, ' +
      'badge ids, search keywords and uiOrder the pickers render from, so a new model is one frozen ' +
      'object rather than edits scattered across the UI.',
    files: [
      'js/model-adapters/index.js',
      'js/model-adapters/whisper.js',
      'js/model-adapters/gpt-transcribe.js',
      'js/model-adapters/mai-transcribe.js',
      'js/model-adapters/response-parsers.js',
    ],
    stack: ['FormData'],
  },

  // Settings & transcript
  {
    id: 'settings',
    code: 'ST',
    name: 'Settings',
    role: 'the preference store',
    group: 'prefs',
    whatItDoes:
      'Holds every preference that is not a secret: which [[Transcription Model]] runs next, each ' +
      'model’s [[Target URI]], the microphone, noise cancellation, verbatim style, and the theme ' +
      'mode and palette. Every control applies the moment you touch it, and it answers the one ' +
      'question the rest of the app keeps asking at request time, getModelConfig().',
    howItsBuilt:
      'There is no Save button anywhere, and that is deliberate: a change writes straight to ' +
      'localStorage and emits, so a stored Target URI can never drift from the visible field. The ' +
      'corollary is that an invalid or emptied URI deletes its key rather than sitting live behind an ' +
      'error badge, and the model list and Connection rows are generated from the adapter registry ' +
      'so a new model needs no edit to index.html.',
    files: ['js/settings.js'],
    stack: ['localStorage', 'DOM'],
  },
  {
    id: 'surface',
    code: 'SS',
    name: 'Settings surface',
    role: 'the settings chrome',
    group: 'prefs',
    whatItDoes:
      'Everything you see when you reach for settings: the gear popover in the header, the native ' +
      'dialog settings modal with its category sidebar and search box, the initials badge for the ' +
      'signed-in account, and the logout dialog that appears when signing out would strand audio.',
    howItsBuilt:
      'Presentation is split from persistence on purpose. This class never writes a preference; it ' +
      'decides what is visible, where focus goes, and what #logout-dialog offers when an ' +
      '[[Unsent Recording]] is at stake. Account identity is reduced to at most two initials and ' +
      'painted straight into the DOM, never retained, and wiped the instant authentication leaves READY.',
    files: ['js/settings-surface.js'],
    stack: ['native <dialog>', 'Intl.Segmenter'],
  },
  {
    id: 'store',
    code: 'TS',
    name: 'Transcript store',
    role: 'the transcript slot',
    group: 'prefs',
    whatItDoes:
      'Keeps exactly one transcript, the last meaningful one, so a reload or a crash does not lose ' +
      'the most valuable thing the app produces. Four methods on [[TranscriptStore]]: save, load, ' +
      'clear, has.',
    howItsBuilt:
      'Deliberately tiny and single-slot rather than a history. Every localStorage touch sits behind ' +
      'four synchronous methods and an injectable Storage object, so tests run it against a fake and ' +
      'the slot can move without UI code reaching for a storage key. Loading never consumes the ' +
      'slot, and saving empty text clears it, because an empty box is not worth recovering.',
    files: ['js/transcript-store.js'],
    stack: ['localStorage', 'JSON'],
  },

  // Presentation
  {
    id: 'ui',
    code: 'UI',
    name: 'UI controller',
    role: 'the screen’s single renderer',
    group: 'present',
    whatItDoes:
      'Draws the whole main screen and turns clicks into intents. It listens on the event bus for ' +
      'what the rest of the app is doing, then decides what the recording cluster shows, whether the ' +
      'Selected Audio workspace or the transcript box is on screen, what the status caption reads, ' +
      'and which sign-in prompt the User sees. The recording buttons never act directly: they emit ' +
      'an intent and wait to be told what happened. Selected Audio and recovery buttons call their ' +
      'controller straight through, because there is exactly one owner to call.',
    howItsBuilt:
      'The recording controls are rendered from one input, the state machine’s state, so there is ' +
      'exactly one place that decides what the cluster looks like. The cluster is a [[Dynamic Island]] ' +
      'that resizes with a FLIP measure-mutate-measure pass through the Web Animations API, and it ' +
      'animates the container only, never the buttons, so a hit target never moves under a finger. ' +
      'Every animation is gated on prefers-reduced-motion and falls through to the correct final layout.',
    files: ['js/ui.js', 'js/status-helper.js'],
    stack: ['DOM', 'Web Animations API', 'native <dialog>', 'Clipboard API'],
  },
  {
    id: 'diag',
    code: 'LG',
    name: 'Logging & errors',
    role: 'the console discipline',
    group: 'present',
    whatItDoes:
      'Gives the app one way to log and one way to report a failure. The logger stamps every line ' +
      'with a timestamp and a module name and stays quiet in production; the error handler takes an ' +
      'error plus context, logs it once, and announces it on the bus so the UI can put a message on ' +
      'the status line.',
    howItsBuilt:
      'Log verbosity is decided from the environment at construction and there is deliberately no ' +
      'URL override, so a query parameter on a deployed build can never turn verbose logging back ' +
      'on. It is the single path from a thrown error to the status line, which is why ' +
      '[[ERROR_OCCURRED]] payloads stay a code, a message and safe context; expected, non-throwing ' +
      'conditions take the separate UI_STATUS_UPDATE route with their own copy.',
    files: ['js/logger.js', 'js/error-handler.js'],
    stack: ['console API'],
  },
  {
    id: 'styles',
    code: 'CS',
    name: 'Stylesheet',
    role: 'the look, in one file',
    group: 'present',
    whatItDoes:
      'Carries the entire visual design: colour tokens for four palettes in light and dark, the ' +
      'header and cards, the reshaping control island, the transcript area, the settings popover and ' +
      'modal, the discard dialog, and the responsive layout.',
    howItsBuilt:
      'Colour is all custom properties, so JS switches a class or a data attribute and never writes ' +
      'a hex value; status colour in particular comes from .status--error and .status--success rather ' +
      'than inline styles. Every palette records its measured [[WCAG-AA]] contrast ratio in a comment, ' +
      'and where the design handoff failed the gate the token was darkened in-hue with the reason ' +
      'written down. A single prefers-reduced-motion block collapses every CSS animation to an ' +
      'instant, correct end state, matching the JS gate.',
    files: ['css/styles.css'],
    stack: ['CSS custom properties', 'CSS keyframes'],
  },

  // Outside world
  {
    id: 'entra',
    code: 'ID',
    name: 'Microsoft Entra ID',
    role: 'the identity provider',
    group: 'outside',
    whatItDoes:
      'Microsoft’s identity service. It authenticates the User in their own directory and issues ' +
      'the access token that authorises calls to the Azure speech endpoint. The app never sees a ' +
      'password and never holds a key.',
    howItsBuilt:
      'Talked to only as a public single-tenant client over full-page redirects: the authority URL ' +
      'is built from a validated directory id, and the only resource scope ever requested is the ' +
      '[[Cognitive Services]] default scope (startup SSO asks for none at all). Silent renewal is ' +
      'tried first and a redirect is the fallback, never the other way round.',
    files: [],
    stack: ['Microsoft Entra ID', 'OAuth 2.0 authorization code with PKCE'],
  },
  {
    id: 'azure',
    code: 'AZ',
    name: 'Azure Speech endpoint',
    role: 'the transcription service',
    group: 'outside',
    whatItDoes:
      'The User’s own Azure speech deployment, addressed by the Target URI they configured. It ' +
      'receives multipart audio over HTTPS with a bearer token and answers with either plain text or ' +
      'JSON carrying text or combinedPhrases.',
    howItsBuilt:
      'Nothing about the endpoint is baked into the app: this is [[Bring-your-own Azure]], so the ' +
      'address comes from the User’s own settings and authorization comes from their Entra token, ' +
      'never from a key. The app treats the service as capable of saying 401, 403, 429 and 5xx, and ' +
      'reacts differently to each.',
    files: [],
    stack: ['Azure Speech Services', 'Azure OpenAI audio/transcriptions'],
  },
  {
    id: 'storage',
    code: 'LS',
    name: 'Browser storage',
    role: 'the origin’s drawer',
    group: 'outside',
    whatItDoes:
      'The origin’s localStorage. MSAL keeps its account and token cache here, which is why ' +
      'opening the app in a second tab of the same origin usually starts already signed in. The ' +
      'app’s own keys sit beside it: model, Target URIs, microphone, theme, and the one transcript slot.',
    howItsBuilt:
      'The MSAL cache is MSAL’s alone and opaque to the app, which never reads, copies, or logs ' +
      'it. Temporary OAuth artifacts are deliberately left tab-scoped by not configuring a ' +
      '[[temporaryCacheLocation]], so only the durable shared account survives across tabs.',
    files: [],
    stack: ['Web Storage API'],
  },
]

/**
 * Edges. Ids read from -> to. Where a pair carries both a normal path and a
 * fallback path, the fallback gets its own dashed edge with a -retry suffix.
 */
export const EDGES: readonly ArchEdge[] = [
  // bootstrap wiring
  { id: 'boot-storage', from: 'boot', to: 'storage', kind: 'data', label: 'legacy credential removal', flowIds: [] },
  { id: 'boot-authsvc', from: 'boot', to: 'authsvc', kind: 'call', label: 'initialize()', flowIds: ['signin'] },
  { id: 'boot-ui', from: 'boot', to: 'ui', kind: 'support', label: 'construct and init', flowIds: [] },
  { id: 'boot-surface', from: 'boot', to: 'surface', kind: 'support', label: 'construct and init', flowIds: [] },
  { id: 'boot-settings', from: 'boot', to: 'settings', kind: 'support', label: 'construct, hand over the surface', flowIds: [] },
  { id: 'boot-mic', from: 'boot', to: 'mic', kind: 'support', label: 'client, settings, readiness', flowIds: [] },
  { id: 'boot-picker', from: 'boot', to: 'picker', kind: 'support', label: 'Selected Audio dependencies', flowIds: [] },
  { id: 'boot-authguard', from: 'boot', to: 'authguard', kind: 'support', label: 'navigation-safety wiring', flowIds: [] },
  { id: 'boot-callback', from: 'boot', to: 'callback', kind: 'support', label: 'second build entry', flowIds: [] },
  { id: 'fsm-spine', from: 'fsm', to: 'spine', kind: 'support', label: 'STATE_TRANSITIONS table', flowIds: [] },

  // sign-in and navigation safety
  { id: 'ui-authguard', from: 'ui', to: 'authguard', kind: 'call', label: 'Continue with Microsoft', flowIds: ['signin', 'retry'] },
  { id: 'authguard-authsvc', from: 'authguard', to: 'authsvc', kind: 'call', label: 'redirect request', flowIds: ['signin', 'signout'] },
  { id: 'authsvc-entra', from: 'authsvc', to: 'entra', kind: 'call', label: 'loginRedirect / logoutRedirect', flowIds: ['signin', 'signout'] },
  { id: 'entra-callback', from: 'entra', to: 'callback', kind: 'data', label: 'authorization response', flowIds: ['signin'] },
  { id: 'callback-authsvc', from: 'callback', to: 'authsvc', kind: 'call', label: 'broadcastResponseToMainFrame', flowIds: ['signin'] },
  { id: 'authsvc-storage', from: 'authsvc', to: 'storage', kind: 'data', label: 'MSAL account cache', flowIds: ['signin'] },
  { id: 'authsvc-ui', from: 'authsvc', to: 'ui', kind: 'call', label: 'AUTHENTICATION_STATE_CHANGED', flowIds: ['signin'] },
  { id: 'authsvc-surface', from: 'authsvc', to: 'surface', kind: 'call', label: 'AUTHENTICATION_STATE_CHANGED', flowIds: [] },
  { id: 'tokens-authsvc', from: 'tokens', to: 'authsvc', kind: 'call', label: 'getAccessToken(scope)', flowIds: ['record'] },
  { id: 'mic-authsvc', from: 'mic', to: 'authsvc', kind: 'call', label: 'ensureTokenReady', flowIds: [] },
  { id: 'picker-authsvc', from: 'picker', to: 'authsvc', kind: 'call', label: 'readiness check', flowIds: ['fileIn'] },
  { id: 'surface-authguard', from: 'surface', to: 'authguard', kind: 'call', label: 'Sign out, Download, Continue', flowIds: ['signout'] },
  { id: 'authguard-picker', from: 'authguard', to: 'picker', kind: 'call', label: 'audio safety query', flowIds: ['signout'] },
  { id: 'picker-mic', from: 'picker', to: 'mic', kind: 'support', label: 'recording safety delegation', flowIds: ['signout'] },
  { id: 'authguard-surface', from: 'authguard', to: 'surface', kind: 'data', label: '{ state } result', flowIds: ['signout'] },

  // recording
  { id: 'ui-mic', from: 'ui', to: 'mic', kind: 'call', label: 'MIC_BUTTON_CLICKED', flowIds: ['record'] },
  { id: 'mic-fsm', from: 'mic', to: 'fsm', kind: 'call', label: 'transitionTo(state)', flowIds: ['record', 'retry'] },
  { id: 'fsm-ui', from: 'fsm', to: 'ui', kind: 'call', label: 'RECORDING_STATE_CHANGED', flowIds: ['record'] },
  { id: 'mic-viz', from: 'mic', to: 'viz', kind: 'data', label: 'VISUALIZATION_START stream', flowIds: [] },
  { id: 'viz-styles', from: 'viz', to: 'styles', kind: 'data', label: '--visualizer-bar token', flowIds: [] },
  { id: 'mic-client', from: 'mic', to: 'client', kind: 'call', label: 'recorded audio Blob', flowIds: ['record'] },
  { id: 'mic-ui', from: 'mic', to: 'ui', kind: 'call', label: 'UI_TRANSCRIPTION_READY', flowIds: ['record'] },

  // selected audio
  { id: 'ui-picker', from: 'ui', to: 'picker', kind: 'call', label: 'chosen File, explicit Transcribe', flowIds: ['fileIn'] },
  { id: 'picker-adapters', from: 'picker', to: 'adapters', kind: 'data', label: 'per-model upload ceiling', flowIds: ['fileIn'] },
  { id: 'picker-ui', from: 'picker', to: 'ui', kind: 'call', label: 'SELECTED_AUDIO_STATE_CHANGED', flowIds: ['fileIn'] },
  { id: 'picker-client', from: 'picker', to: 'client', kind: 'call', label: 'Selected Audio File', flowIds: ['fileIn'] },

  // transcribing
  { id: 'client-settings', from: 'client', to: 'settings', kind: 'data', label: 'getModelConfig()', flowIds: ['settings'] },
  { id: 'client-adapters', from: 'client', to: 'adapters', kind: 'call', label: 'buildRequest, parseResponse', flowIds: ['record', 'settings'] },
  { id: 'adapters-encode', from: 'adapters', to: 'encode', kind: 'call', label: 'WebM Blob to 16 kHz WAV', flowIds: ['record'] },
  { id: 'client-tokens', from: 'client', to: 'tokens', kind: 'call', label: 'getToken(scope)', flowIds: ['record'] },
  { id: 'client-azure', from: 'client', to: 'azure', kind: 'call', label: 'multipart audio and bearer token', flowIds: ['record', 'fileIn', 'retry'] },
  { id: 'azure-client', from: 'azure', to: 'client', kind: 'data', label: 'HTTP status and body', flowIds: ['retry'] },
  { id: 'client-azure-retry', from: 'client', to: 'azure', kind: 'retry', label: 'backed-off re-attempt', flowIds: ['retry'] },
  { id: 'client-ui-retry', from: 'client', to: 'ui', kind: 'retry', label: 'API_REQUEST_ERROR', flowIds: ['retry'] },
  { id: 'client-diag', from: 'client', to: 'diag', kind: 'call', label: 'sanitized error context', flowIds: [] },
  { id: 'mic-diag', from: 'mic', to: 'diag', kind: 'call', label: 'error plus module context', flowIds: [] },
  { id: 'fsm-diag', from: 'fsm', to: 'diag', kind: 'retry', label: 'illegal transition', flowIds: [] },
  { id: 'diag-ui', from: 'diag', to: 'ui', kind: 'call', label: 'ERROR_OCCURRED', flowIds: [] },

  // transcript and settings
  { id: 'ui-store', from: 'ui', to: 'store', kind: 'data', label: 'transcript autosave', flowIds: ['record', 'fileIn'] },
  { id: 'store-storage', from: 'store', to: 'storage', kind: 'data', label: 'transcript_record slot', flowIds: ['record'] },
  { id: 'surface-settings', from: 'surface', to: 'settings', kind: 'call', label: 'preference change', flowIds: ['settings'] },
  { id: 'settings-storage', from: 'settings', to: 'storage', kind: 'data', label: 'model, Target URI, theme keys', flowIds: ['settings'] },
  { id: 'settings-ui', from: 'settings', to: 'ui', kind: 'call', label: 'SETTINGS_MODEL_CHANGED', flowIds: ['settings'] },
  { id: 'settings-surface', from: 'settings', to: 'surface', kind: 'call', label: 'row visibility refresh', flowIds: ['settings'] },
  { id: 'settings-picker', from: 'settings', to: 'picker', kind: 'call', label: 'SETTINGS_MODEL_CHANGED', flowIds: ['settings'] },
  { id: 'settings-adapters', from: 'settings', to: 'adapters', kind: 'data', label: 'Connection rows per model', flowIds: [] },
  { id: 'ui-styles', from: 'ui', to: 'styles', kind: 'data', label: 'dark-theme class, island state', flowIds: [] },
]

export const FLOWS: readonly ArchFlow[] = [
  {
    id: 'signin',
    name: 'Sign in',
    payload: 'MSAL account',
    summary:
      'Takes a new User from an anonymous page load through a full-page Entra redirect and back into ' +
      'the ready state, with MSAL’s shared localStorage cache holding the account.',
    route: ['boot-authsvc', 'ui-authguard', 'authguard-authsvc', 'authsvc-entra', 'entra-callback', 'callback-authsvc', 'authsvc-storage', 'authsvc-ui'],
  },
  {
    id: 'record',
    name: 'Record and transcribe',
    payload: 'audio Blob',
    summary:
      'Presses the mic, drives the recording state machine, converts the captured audio, sends it to ' +
      'Azure with a freshly acquired bearer token, and lands the transcript in the box and the ' +
      'single-slot store.',
    route: ['ui-mic', 'mic-fsm', 'fsm-ui', 'mic-client', 'client-adapters', 'adapters-encode', 'client-tokens', 'tokens-authsvc', 'client-azure', 'mic-ui', 'ui-store', 'store-storage'],
  },
  {
    id: 'fileIn',
    name: 'Transcribe a picked file',
    payload: 'local audio File',
    summary:
      'Picks one local audio file, validates it locally against the current model’s ceiling, and ' +
      'only on an explicit Transcribe converges onto the same API client and transcript path as a recording.',
    route: ['ui-picker', 'picker-adapters', 'picker-ui', 'picker-authsvc', 'picker-client', 'client-azure', 'picker-ui', 'ui-store'],
  },
  {
    id: 'retry',
    name: 'Ride out a rate limit',
    payload: 'HTTP status',
    summary:
      'A 429 or transient 5xx is absorbed by a bounded backoff loop inside one transcribe() call, ' +
      'while a 401 skips retries entirely and turns into an interactive token-recovery prompt.',
    route: ['client-azure', 'azure-client', 'client-azure-retry', 'azure-client', 'client-ui-retry', 'mic-fsm', 'ui-authguard'],
  },
  {
    id: 'signout',
    name: 'Sign out with unsent audio',
    payload: 'Unsent Recording Blob',
    summary:
      'Blocks a Sign out that would strand a failed recording, offers download-then-continue or an ' +
      'explicit discard, and only then hands the page to MSAL’s logout redirect.',
    route: ['surface-authguard', 'authguard-picker', 'picker-mic', 'authguard-surface', 'surface-authguard', 'authguard-authsvc', 'authsvc-entra'],
  },
  {
    id: 'settings',
    name: 'Switch the model',
    payload: 'model id',
    summary:
      'Changing the Transcription Model persists instantly with no Save step, and every surface plus ' +
      'the next Azure request picks up the new model and its Target URI.',
    route: ['surface-settings', 'settings-storage', 'settings-ui', 'settings-surface', 'settings-picker', 'client-settings', 'client-adapters'],
  },
]

export const INTRO = {
  title: 'Whisper Transcribe',
  lede: 'A browser-only speech transcription app that brings its own Azure.',
  whatItDoes:
    'Records from the microphone or takes a local audio file, sends it to a speech model in the ' +
    'User’s own Azure subscription, and keeps the last transcript safe in the browser. There is ' +
    'no backend, no server, and no API key anywhere: the User signs in with Microsoft Entra ID and ' +
    'every request carries a short-lived bearer token instead.',
  howItsBuilt:
    'Vanilla JavaScript with one production dependency, @azure/msal-browser. Ownership is strict ' +
    'by design: one module owns MSAL, one owns the microphone lifecycle, one owns a picked file, ' +
    'one owns the transcript slot, and only the API client ever writes an Authorization header. ' +
    'The rest talk over a small event bus, so every building on this map is also a seam you can ' +
    'test on its own.',
}

/** Outside-world services have no code here; they are drawn as plates on the floor. */
const NO_CODE: Measure = { count: 0, loc: 0 }

function build(): readonly ArchNode[] {
  const shaped = AUTHORED.map((a) => {
    const measure = MEASURED[a.id] ?? NO_CODE
    const { archetype, params } = deriveArchetype(measure)
    return { a, measure, archetype, params, height: deriveHeight(measure) }
  })
  const footprints = packLayout(
    shaped.map((s) => ({ item: s.a.id, group: s.a.group, size: deriveSize(s.archetype, s.params, s.measure) })),
    GROUPS.map((g) => g.id),
  )
  return shaped.map((s) => ({
    ...s.a,
    archetype: s.archetype,
    params: s.params,
    height: s.height,
    footprint: footprints.get(s.a.id)!,
    count: s.measure.count || undefined,
    loc: s.measure.loc || undefined,
  }))
}

export const NODES: readonly ArchNode[] = build()

export const ARCHITECTURE: ArchitectureData = {
  groups: GROUPS,
  nodes: NODES,
  edges: EDGES,
  flows: FLOWS,
  intro: INTRO,
  unmapped: UNCLAIMED,
  repo: 'ahmedmuhi/whisper-transcribe',
}
