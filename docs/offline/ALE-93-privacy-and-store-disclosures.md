# ALE-93 privacy policy and store disclosure draft

**Status: Draft prepared; not ready for store submission or public publication.** The copy describes the native iOS/Android offline launch and explicitly accounts for EAS Update. Replace the publisher/contact/effective-date placeholders, verify native release erase behavior, and confirm the store-console answers against the release build before publication.

## Outcome

Added an app-facing Markdown privacy and terms draft, a deployable static policy page, and proposed Apple App Privacy and Google Play Data safety declarations. The static page can be served at `/privacy-policy.html` by the existing static export/container path. No public production hostname or deployment binding is present in this checkout, so the final URL remains `https://<production-host>/privacy-policy.html`.

## Source findings

- Native policy in `config/launchPolicy.ts` disables accounts, backend requests, and synchronization, while allowing OTA updates. `isNativeOfflineLaunch()` means all non-web platforms. `services/apiService.ts` checks the backend policy before every API request; its fetch path goes through that check. `lib/sync/SyncEngine.ts` leaves sync local-only and does not enqueue or process remote jobs in this launch mode.
- Local profile data includes a name/username, optional height and weight, timezone and local settings, workouts/templates, workout records and exercise set values, routines and schedules, running-session state, and progression-widget configuration. SQLite stores workouts, records, routines, and `user_profile`; AsyncStorage stores profile-scoped settings, running-session state, widgets, and the device-level network preference.
- The native profile startup uses the local `local:device` profile. Registration on native writes through the local user repository. The native account-settings presentation omits sign-out and account-deletion actions. Existing account, login, sync, exercise-search, and legal-content API methods remain in the source, but are blocked by the shared native launch policy; the web branch is not covered by this native policy draft.
- `app.config.js` sets an EAS Update URL and an app-version runtime policy. Expo SDK 55 release defaults can check for updates at launch. ALE-92 records that `expo-updates` is present, `expo-insights` and PostHog are absent, and remote push-token registration was removed. Local rest-timer notifications remain. The ALE-92 record explicitly says that release-build traffic capture and OTA download/install behavior were not verified.
- `app/legal/privacy-policy.tsx` currently gets policy copy through `LegalRepository` and the backend API. That API call is blocked by the native launch policy. The new bundled copy is meant for the parent task to wire into `LegalRepository`; the route and repository are unchanged here.
- No local-profile erase control was present in the source inspected for this draft. `UserRepository.deleteCurrentUser()` still calls the remote account-delete API, and the native settings presentation hides that action. The local erase wording below is therefore marked planned and must be finalized after ALE-93 implementation.
- The project exports web static files into `dist/` and the Dockerfile copies `dist` into Nginx's document root. Nginx serves static paths, but `server_name localhost` is the only host setting found. No custom domain, public static hosting binding, or production URL was discoverable.

## Store disclosure draft

These are proposed answers for the **native release build only**, with the current EAS Update configuration. They are not submitted in either console.

### Apple App Privacy (App Store Connect)

| Field                                                    | Draft answer                                         | Reason / open check                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy Policy URL                                       | `https://<production-host>/privacy-policy.html`      | Replace with a live, public HTTPS URL after production host binding. Apple requires a policy URL for every app.                                                                                                                         |
| Data collected                                           | **Yes**, conservatively: **Identifiers → Device ID** | EAS Update uses a randomized update token, and Apple includes third-party partner collection in the app privacy disclosure. Confirm Expo's exact token treatment and the current Apple questionnaire before filing.                     |
| Purpose                                                  | **App Functionality**                                | The token/metadata supports compatible update delivery. Add Analytics only if the publisher uses EAS adoption or failure metrics to evaluate users' app behavior. No app-level analytics SDK is present in the inspected native source. |
| Linked to the user                                       | **Yes (conservative)**                               | The randomized token is device/install-specific; Apple defines device ID broadly and asks whether data is linked via account, device, or other details. Revisit if Expo confirms the token is not linkable to an individual device.     |
| Used to track the user                                   | **No**                                               | The inspected native build has no targeted advertising, data broker, IDFA use, or cross-company tracking flow.                                                                                                                          |
| Profile name, fitness/workout records, body measurements | **Do not mark collected for this native build**      | They are processed in local app storage and are not sent off-device by the native backend/sync code under the launch policy. Reassess for any SDK or release behavior changes.                                                          |

### Google Play Data safety

| Field                      | Draft answer                                                            | Reason / open check                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User data collected        | **Yes**, provisionally: **Device or other IDs**                         | EAS's randomized update token appears to fit Google's device/other identifier type. Google requires SDK/service-provider transmissions to be considered. Confirm exact categorization in the current form.                                                                                 |
| Purpose                    | **App functionality**                                                   | Used to serve compatible EAS updates. Do not mark Analytics unless the publisher uses update-adoption metrics for analytics.                                                                                                                                                               |
| Required or optional       | **Required for the EAS update check**                                   | No in-app opt-out for OTA is exposed in this build. Confirm whether the current Play form asks whether the data type is optional across the whole app experience.                                                                                                                          |
| Shared                     | **No, if Expo is acting solely as the publisher's service provider**    | Google excludes service-provider transfers from its “shared” answer. Confirm contract/service use and whether the publisher uses Expo's update metrics for a separate purpose.                                                                                                             |
| Encryption in transit      | **Yes for EAS Update requests**                                         | The configured update endpoint is HTTPS. Review other network integrations in the final binary before answering globally.                                                                                                                                                                  |
| Account creation           | **No for the current native local profile**                             | Google's policy says accounts created and operated offline do not count as app accounts. Verify no older or alternate Play-distributed artifact enables online account creation.                                                                                                           |
| Deletion request mechanism | **Do not claim until the in-app local erase is implemented and tested** | Settings now includes a confirmed device erase action; automated cleanup tests pass, with native release verification pending. Once implemented, confirm whether its scope justifies the deletion mechanism badge while Expo update-service metadata remains subject to Expo's processing. |

Google Play Data safety answers describe all relevant versions currently distributed for the package. If an older or alternate artifact with online accounts is still distributed, the form and account-deletion disclosures need to cover that version too. App Store Connect asks for the practices of the app version currently available; still verify any submitted/released build and attached third-party SDKs.

## Publication blockers and risks

1. Replace `[enter ...]` publisher, monitored privacy/support email, and effective-date placeholders in the static page and bundled copy.
2. Confirm ALE-93's erase flow and its exact data scope before changing planned deletion copy to a present-tense commitment. Check SQLite database(s), AsyncStorage profile-scoped keys, legacy-import keys, and any scheduled local notifications. Do not claim it deletes historical remote server data or operating-system backups.
3. Confirm whether Play previously distributed an account-enabled artifact and whether any such version remains available. Google's account-deletion rules and package-wide Data safety form can make a web data-deletion path necessary if account creation exists in any covered app experience.
4. Validate the Expo EAS Update service-provider arrangement, update-token data classification, access to adoption metrics, and retention details. Expo's policy says it may collect OS and randomized update tokens; app config and Expo docs show the update URL/platform/runtime/channel request metadata. Do not state zero network traffic or no telemetry in all conditions.
5. Bind the static path to a production public HTTPS host and ensure the page loads without error. The current Nginx config is a generic local container configuration, not a public domain.
6. Native legal routes now use bundled policy and terms through `LegalRepository`, with offline query execution enabled. Web retains its existing API contract.
7. Review web signup/auth/sync as a separate data flow before using this same policy for the browser build. This notice is scoped to native offline launch.

## Sources and evidence

### Repository evidence

- `config/launchPolicy.ts:3-23` — native accounts/backend/sync disabled, OTA allowed.
- `features/launch/launchFacade.ts:364-383` and `services/apiService.ts:265-269, 994-1008` — central API gate, including policy/terms reads.
- `lib/sync/SyncEngine.ts:341-368, 549-584, 623-669` — local-only queue mode returns before processing/enqueueing remote sync work.
- `lib/db/migrations.ts:122-164, 277-310` — local SQLite workout, record, routine and profile tables.
- `app/Provider.tsx:624-680`, `lib/profileStorage.ts:8-45`, `features/settings/stores/settingsStore.ts` — local profile initialization and profile-scoped storage.
- `features/launch/launchFacade.ts:188-228` — native account screen hides account actions and shows device-profile editing.
- `services/notificationService.ts` and `components/NotificationPermissions.tsx` — local rest timer notification setup; permission handling; no remote push registration in current file.
- `app.config.js:91-103`, `eas.json`, and `docs/offline/ALE-92-validation.md` — EAS project/update URL/runtime policy and update checks; ALE-92 records module resolution and unverified release network checks.
- `app/legal/privacy-policy.tsx`, `features/legal/hooks/useLegalContent.ts`, `lib/repositories/LegalRepository.ts` — native privacy screen currently depends on an API-loaded policy.
- `public/`, `app.config.js:36-45`, `Dockerfile`, and `nginx.conf` — static web output/container path exists; Nginx is configured only with `server_name localhost`.

### Current primary documentation

- Apple [App Privacy Details](https://developer.apple.com/go/?id=info-1) — data types, third-party partner data, linked-to-user criteria, and tracking definitions.
- Apple [App Store Connect App Privacy reference](https://developer.apple.com/help/app-store-connect/reference/app-privacy/) — privacy policy URL requirement and data types.
- Apple [User privacy and data use](https://developer.apple.com/app-store/user-privacy-and-data-use/) — third-party code responsibility and tracking definition.
- Google Play [Data safety form guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en) — collection includes SDK transmissions, local-only processing is out of scope, service-provider sharing exception, encryption, and deletion questions.
- Google Play [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) — account deletion requirements and offline-account exception.
- Expo [EAS Update introduction](https://docs.expo.dev/eas-update/introduction/) and [get started](https://docs.expo.dev/eas-update/getting-started/) — update service operation, release checks, and update delivery.
- Expo [Expo Updates protocol](https://docs.expo.dev/technical-specs/expo-updates-1/) and [debugging EAS Update](https://docs.expo.dev/eas-update/debug/) — update request platform/runtime/channel metadata.
- Expo [Privacy Policy](https://expo.dev/privacy) — says EAS Update may collect device operating system and randomized tokens used to determine whether an end-user downloaded an update.

## Checks performed

- Read-only source/config review and repository status check on `codex/offline-launch-next-20261015`.
- Browsed the current Apple, Google Play, and Expo primary documentation linked above.
- No tests, builds, store-console changes, host deployments, or external submissions were run or made.

## Smallest next step

After ALE-93 confirms the erase behavior, update only the deletion paragraphs and verify the in-app copy against the implementation; then insert the publisher/contact details and bind `/privacy-policy.html` to the production HTTPS host.

## Implementation handoff

ALE-93 implements a confirmed all-owner device erase, including a persistent recovery marker, awaited SQLite teardown, profile persistence suspension, notification scheduling drain, credentials, caches and scoped preferences. The marker survives failures and is completed before profile hydration on restart. Native startup also removes obsolete remote credentials; future credential writes use device-only Keychain accessibility.

Publisher/contact/production URL placeholders are retained at the user's request. The public policy has not been deployed. Native backup exclusions are generated at prebuild: Android disables backup and excludes app data from cloud/device-transfer domains; iOS marks Documents and Library excluded at launch. These rules cannot remove historical backups, and iOS backup/restore needs device verification.
