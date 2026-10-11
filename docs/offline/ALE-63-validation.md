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

Live online reconciliation was not verified: an availability request from the
emulator timed out at the configured 10-second deadline, while the same configured
ngrok legal endpoint returned HTTP 200 from the host. Deterministic tests cover
foreground service recovery and the authentication → drain → reconciliation order.

iOS and web were not exercised on devices. Analytics, push/update policy and
server-side mutation deduplication belong to the separate offline issues; a
server-accepted mutation whose response is lost can still be replayed until ALE-66.
