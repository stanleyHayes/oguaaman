# Mobile background push (the "ring like a call") — setup

The **foreground** ring already works on the current binary: a critical safety
directive triggers a full-screen takeover (`MobileRingingAlert`) with a looping
vibration (`Vibration.vibrate(pattern, true)` — built-in RN, no native module).

**Background / locked-screen** delivery (a true incoming-call ring when the app
is closed) needs native push, which requires an EAS dev/production build and
external credentials — it can't be added from a JS-only change. The **backend is
already done**: it stores Expo tokens (`POST /api/push/subscribe`, `platform:
"expo"`) and sends Expo push on severe alerts (critical → `sound: {critical:…}`,
`priority: high`, channel `alerts`). You only need to register the device token
and (for iOS) request Apple's critical-alert entitlement.

## 1. Install the native modules

```bash
cd mobile
npx expo install expo-notifications expo-audio
```

`expo-audio` is optional — only if you want an audible ringtone loop in the
foreground on top of the vibration (see step 5).

## 2. app.json

Add the notifications plugin, an Android high-importance channel, and the iOS
background mode. iOS **critical alerts** additionally require an entitlement that
Apple must approve for your app (request it at
https://developer.apple.com/contact/request/notifications-critical-alerts).

```jsonc
"ios": {
  "bundleIdentifier": "gh.oguaa.app",
  "supportsTablet": true,
  "infoPlist": { "UIBackgroundModes": ["remote-notification"] },
  "entitlements": { "com.apple.developer.usernotifications.critical-alerts": true }
},
"plugins": [
  // …existing…
  ["expo-notifications", {
    "icon": "./assets/images/notification-icon.png",
    "color": "#0C2C1F"
  }]
]
```

## 3. Register the device token → backend

Create `mobile/src/lib/push.ts`:

```ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api";

export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return; // no push on simulators

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "Safety alerts",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 700, 500, 700],
      bypassDnd: true, // ring through Do Not Disturb (critical alerts)
    });
  }

  const settings = await Notifications.getPermissionsAsync();
  let granted = settings.granted;
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowCriticalAlerts: true, allowSound: true, allowAlert: true },
    });
    granted = req.granted;
  }
  if (!granted) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.pushSubscribe({ platform: "expo", expoToken: token }).catch(() => {});
}
```

`api.pushSubscribe` already exists on web; mirror it in `mobile/src/lib/api.ts`:

```ts
pushSubscribe: (body: { platform: string; expoToken?: string }) =>
  post<{ ok: boolean }>("/api/push/subscribe", body),
```

## 4. Handle taps + foreground receipt

In `mobile/src/app/_layout.tsx`, after sign-in (or on mount when authed):

```ts
import * as Notifications from "expo-notifications";
import { registerForPush } from "@/lib/push";
import { push } from "@/lib/router";
import { ROUTES } from "@/lib/routes";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

// inside the root component:
useEffect(() => {
  registerForPush();
  const tap = Notifications.addNotificationResponseReceivedListener((res) => {
    const url = res.notification.request.content.data?.url as string | undefined;
    if (url) push(url as never);
  });
  return () => tap.remove();
}, []);
```

The backend already sends `data.url`, `data.severity`, `data.ring`, so a
critical push (`ring: true`) can trigger the same `MobileRingingAlert` when the
app is foregrounded (listen with `addNotificationReceivedListener` and, if
`data.ring`, set the ringing directive).

## 5. Optional: audible ringtone loop (foreground)

Add a short `ring.mp3` under `assets/`, then with `expo-audio`:

```ts
import { useAudioPlayer } from "expo-audio";
const player = useAudioPlayer(require("../../assets/ring.mp3"));
player.loop = true;
player.play();  // when a critical alert rings; player.pause() on dismiss
```

## 6. Build

Push needs a native build (not Expo Go for iOS critical alerts):

```bash
eas build --profile development --platform ios   # or android
```

Set the Expo `projectId` (`eas init`) and, on the server, leave `VAPID_*` for
web; Expo push needs no server key.
