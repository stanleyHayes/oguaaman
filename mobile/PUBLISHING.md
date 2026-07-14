# Publishing Oguaa (EAS Build + Submit)

This guide is for the app owner who holds the Apple Developer and Google Play
accounts. It covers shipping the Oguaa mobile app to the App Store and Google
Play using Expo Application Services (EAS).

Build profiles live in `eas.json`; store metadata lives in `app.json`
(Expo SDK 56). Run every command from inside the `mobile/` directory.

## 0. Prerequisites

- An [Expo account](https://expo.dev/signup) (free).
- Apple: an active **Apple Developer Program** membership ($99/yr) and an app
  record created in **App Store Connect**.
- Google: a **Google Play Console** account ($25 one-time) and an app created
  there, plus a **service-account JSON key** (Play Console -> Setup -> API
  access) so `eas submit` can upload builds.

## 1. Install the CLI and sign in

```bash
npm install -g eas-cli
eas login
```

## 2. Initialize the EAS project (one time)

This links the local app to an EAS project on your account and writes
`extra.eas.projectId` into `app.json` automatically. It has NOT been committed
because the projectId belongs to your account, not the repo.

```bash
eas init
```

## 3. Confirm / change the app identifiers

The current placeholders are:

- iOS `bundleIdentifier`: `gh.oguaa.app`
- Android `package`: `gh.oguaa.app`

If you want different identifiers, edit them in `app.json` under
`expo.ios.bundleIdentifier` and `expo.android.package` BEFORE the first build.
They cannot be changed once an app is published to the stores.

## 4. Build

Preview builds are for internal testing (installable on devices / simulator).
Production builds are the store-ready artifacts.

```bash
# Internal/test builds
eas build -p ios --profile preview
eas build -p android --profile preview

# Store builds
eas build -p ios --profile production
eas build -p android --profile production
```

On the first iOS build, EAS will offer to generate and manage your Apple signing
credentials (distribution certificate + provisioning profile) — let it, unless
you manage credentials manually. For Android, EAS generates and stores a keystore
the first time; keep it (do not lose it — it signs all future updates).

## 5. Submit to the stores

```bash
eas submit -p ios --profile production
eas submit -p android --profile production
```

- iOS submit uploads to App Store Connect; you then finish the listing
  (screenshots, description, privacy) and submit for review there.
- Android submit needs the service-account JSON key. Either configure it in
  `eas.json` under `submit.production.android.serviceAccountKeyPath`, or let the
  CLI prompt you for it. Finish the store listing in Play Console and roll out.

## 6. OTA updates (optional, later)

`runtimeVersion.policy` is set to `appVersion`, so JS-only updates pushed with
`eas update` apply to builds that share the same app version. To enable, run
`eas update:configure` and `eas update --branch production`.

## Notes

- Brand colors already wired in: green-900 `#0C2C1F` (splash + adaptive icon
  background), gold `#C7A24A`, cream `#F6F1E7`.
- `eas.json` `cli.appVersionSource` is `remote`, so the build/version numbers are
  tracked by EAS; `production` uses `autoIncrement` to bump the build number each
  release.
