import * as WebBrowser from "expo-web-browser";

/** Opens `url` in the in-app browser and makes sure the session is dismissed
 *  when control returns to the app. Returns `true` if the browser opened. */
export async function openInAppBrowser(url: string): Promise<boolean> {
  try {
    await WebBrowser.openBrowserAsync(url);
    return true;
  } catch {
    return false;
  } finally {
    // Best-effort cleanup: if the browser is still presenting, close it.
    try {
      await WebBrowser.dismissBrowser();
    } catch {
      /* already dismissed */
    }
  }
}
