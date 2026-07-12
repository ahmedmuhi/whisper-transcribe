# Plan 026: Subscribe to microphone permission changes exactly once

> **Executor instructions**: Follow all steps and verifications. Stop on drift
> or a STOP condition and touch only scoped files.
>
> **Drift check (run first)**: `git diff --stat 559124e..HEAD -- js/permission-manager.js js/audio-handler.js tests/permission-manager.vitest.js tests/audio-handler-integration.vitest.js`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: Plan 021 (to avoid overlapping AudioHandler lifecycle edits)
- **Category**: perf
- **Planned at**: commit `559124e`, 2026-07-12

## Why this matters

Every recording request queries microphone permission and adds a fresh anonymous
`change` listener. A long-lived page accumulates callbacks and later permission
changes emit duplicate status/domain events. Cache one status object and stable
handler, replace it safely if the browser returns a new object, and clean it up
with the existing object lifecycle.

## Current state

`js/permission-manager.js:64-78` currently does this on every call:

```js
const result = await navigator.permissions.query({ name: 'microphone' });
this.permissionStatus = result.state;
result.addEventListener('change', () => {
    this.permissionStatus = result.state;
    this.handlePermissionChange(result.state);
});
```

`requestMicrophoneAccess()` calls it at `:113` for every recording. The one
`PermissionManager` created by `AudioHandler` lives for the page. Permissions API
absence/errors intentionally return `null` and must stay non-fatal.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused | `npx vitest run tests/permission-manager.vitest.js tests/audio-handler-integration.vitest.js` | all pass |
| Full/browser | `npm test && npm run test:coverage && npm run test:browser` | all pass |
| Quality | `npm run lint && npm run deps:check && npm run deps:check:prod && npm run size` | all pass |

## Scope

**In scope**: `js/permission-manager.js`, `js/audio-handler.js` only to invoke
permission cleanup from `destroy()`, `tests/permission-manager.vitest.js`,
`tests/audio-handler-integration.vitest.js`, and plan status.

**Out of scope**: permission UX/messages, browser detection, constraint profiles,
device enumeration, stream ownership changes, and global Vitest setup refactors.

## Git workflow

- Branch: `fix/026-permission-listener-lifecycle`
- Commit: `fix: deduplicate permission status listener`
- Do not push unless instructed.

## Steps

### Step 1: Add a repeated-query regression test

Create a PermissionStatus stand-in with tracked add/remove listeners. Call
`getPermissionStatus()` repeatedly with the same result, fire one change, and
assert one `handlePermissionChange` call and one event sequence. Add a second
case where query returns a new status object and the old listener is removed.

**Verify**: focused permission tests fail against anonymous accumulation.

### Step 2: Retain one stable status subscription

Store the current PermissionStatus object and a bound/named handler on the
manager. Reuse the object when possible; if a query returns a new object,
remove the handler from the previous object before attaching it once to the new
one. Update `permissionStatus` on every query even when already subscribed.

Support older mocks/browsers without `removeEventListener` defensively, but do
not silently add duplicates when removal is unavailable.

**Verify**: repeated/same/new-object cases pass, as do unsupported Permissions
API tests.

### Step 3: Add idempotent destruction

Add `PermissionManager.destroy()` to detach the listener and stop any stream it
still owns. Have `AudioHandler.destroy()` invoke it after unsubscribing from the
event bus. Calling destroy twice must not throw.

**Verify**: lifecycle tests prove listener removal, stream cleanup, and double
destroy safety.

### Step 4: Run all gates and scope checks

Run the command table plus `git diff --check`.

## Test plan

- Repeated permission checks attach one listener.
- A replacement PermissionStatus detaches the old listener.
- One change emits one domain/status sequence.
- Unsupported query/remove APIs degrade gracefully.
- Destroy is idempotent and stops any manager-owned stream.

## Done criteria

- [ ] At most one live permission-change listener exists per manager.
- [ ] Replacement and destruction detach when supported.
- [ ] Recording, constraint fallback, and browser smoke remain unchanged.
- [ ] All gates pass and scope is clean.

## STOP conditions

- The browser requires a fresh active listener on multiple status objects.
- Plan 021 changed stream ownership in a way this plan does not match.
- Fixing tests requires refactoring the global Vitest setup.
- A gate fails twice after a reasonable fix.

## Maintenance notes

Any future Permissions API query must go through this one subscription path.
Do not confuse permission listener ownership with MediaStream track ownership.
