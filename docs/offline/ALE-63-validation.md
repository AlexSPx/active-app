# ALE-63 validation

Manual offline is a device preference. Restore it before application API work;
enabling it cancels active requests while retaining uncertain sync jobs. Returning
online checks API availability and the selected account before draining the queue,
reconciling a complete snapshot, and invalidating that owner's local queries.

## Automated checks

- API gates cover login, signup, protected requests, refresh, legal text and probes.
- Persisted preference reads fail closed; writes remain ordered across rapid toggles.
- Cancellation interrupts response bodies and rejects late responses without
  treating manual pause as a timeout or authentication failure.
- Interrupted jobs preserve their retry state and idempotency key.
- Network-state preflight and service recovery use bounded deadlines/backoff.
- Provider checks cover guest/invalid/switching profiles, initially unknown app
  state, reconnect/resume ordering, and backgrounding during a pending queue read.
- TypeScript, formatting, and the full Jest suite are the completion gates.

## Existing Android development build

No native rebuild, reinstall, dependency addition, or data reset was performed.

Verified on the running emulator:

1. Open Settings → Synchronization and enable **Work offline**.
2. The preference is saved as enabled, and the API inspector receives no new
   application requests.
3. Restart the installed development app and reopen the existing Metro server.
   The cached profile opens, the switch remains enabled, and the API inspector
   still receives no new application requests.
4. Disable **Work offline**; the saved preference returns to online.

Retested on 2026-10-12 from `codex/ale-63-offline-reconnection`, using the existing
Android development build and the current ngrok URL. Protected reads, legal text
and availability probes rejected locally with `MANUAL_OFFLINE`. The cached profile
and offline preference survived an app restart with no new API requests.

A queued delete against a newly generated, verified absent workout ID stayed
pending across a JavaScript reload, with zero retries and an operation identity.
Disabling offline mode validated the session, replayed the job (the expected 404
was acknowledged), removed it from the queue, and reconciled user, workouts,
records and routines with HTTP 200 responses. No training data was created or
removed. The app was left online with a valid session and an empty queue.

The earlier emulator API timeout did not recur. A stale "Syncing" row exposed a
missing acknowledgement notification, addressed by the focused queue-change fix.
Retesting with a read-only queued account lookup confirmed that the focused screen
automatically changes from "Queued" to "You’re all caught up" after acknowledgement.

iOS and web were not exercised on devices. Analytics, push/update policy and
server-side mutation deduplication belong to the separate offline issues; a
server-accepted mutation whose response is lost can still be replayed until ALE-66.
