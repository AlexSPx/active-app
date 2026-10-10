# ALE-62 manual verification

Use the existing development app; no native rebuild is required. The server and
emulator were unavailable for this change, so the checks below remain to be run.

## Prepare

1. Start your usual local backend, ngrok tunnel, and existing Android emulator.
2. Check the tunnel's current `public_url` at `http://127.0.0.1:4040/api/tunnels`.
   Set `EXPO_PUBLIC_API_BASE_URL` in `.env.development` to that URL.
3. From `active-app`, run `npx expo start --dev-client` and open the installed
   development app. Use a test account and disposable training data.
4. Open **Settings → Synchronization**. With no queued work, expect “You’re all
   caught up.”

## Normal offline recovery

1. Turn off the emulator's internet connection. Create a workout, add it to a
   routine, and complete a session using it.
2. Check Synchronization: the changes should remain queued; related changes may
   show “Waiting for a related change.” Local workouts, routines, and history
   should remain usable.
3. Force-close and reopen the app while offline. Confirm the data and queued
   changes remain.
4. Restore connectivity. Confirm the parent workout uploads before its related
   routine/session, the queue drains, and the server contains the expected data.

## Reauthentication

1. Queue disposable changes while offline. Make the test account's refresh
   credentials invalid/revoked, then reconnect. Expiring only the access token
   normally triggers an automatic refresh and is not sufficient for this check.
2. Expect **Sign in again to resume syncing**. No later queued changes should
   upload. Force-close/reopen: the pause and local data should persist.
3. Sign in again to the **same account**. Confirm the original changes upload and
   the queue drains. Switching accounts must not upload the previous account's
   work or display its queued changes.

## Permanent rejection and dependencies

This check needs a development-only backend/proxy that rejects one selected
workout-create request with HTTP 400 or 409. A disconnected server or HTTP 500
tests temporary retry behavior instead.

1. Offline, create workout A, a routine referencing A, and a session for A. Also
   create an unrelated workout B. Reconnect with only A's create rejected.
2. Expect A to need attention, with a readable error. Its related routine/session
   must stay queued and must not upload with A's temporary ID. B should upload.
3. Remove the rejection, tap **Retry** for A, and confirm A then its dependents
   upload. Restart before retrying once to check persistence.
4. Repeat with a rejected edit followed by another edit/delete of the same item:
   the later change must remain blocked until the earlier change succeeds.

## Explicit discard

1. Repeat the rejection setup. Tap **Discard**, then **Keep change**: nothing
   should change.
2. Tap **Discard → Discard change**: only that upload should leave the visible
   queue. Its local training data remains; related changes remain visible and
   blocked. Other unrelated changes are unaffected.
3. Restart and verify this behavior persists. Discarding a parent does not make
   its dependent uploads valid; discard those individually if you also want to
   stop them. There is no payload-editing or undo-discard UI in this issue.

## Automated checks

From `active-app`:

```sh
npm run test:sync
npx jest tests/settings/sync.test.js --runInBand
npm run test:once
npx tsc --noEmit
```

Automated coverage includes transitive dependencies, queues larger than 50
blocked jobs, auth restart/retry, exact payload/operation retention, explicit
discard isolation, and account-change/action races. Device layout, actual
WorkOS sign-in, and live backend rejection/recovery still need the checks above.
