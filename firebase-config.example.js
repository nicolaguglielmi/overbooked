/* firebase-config.js: your Firebase project. Copy this file to
 * firebase-config.js (it stays out of git) and fill in your values: the steps
 * are in README.md, "Il tuo progetto Firebase".
 *
 * With DF_FIREBASE = null the game works anyway: online rooms run between
 * tabs of one browser, and stats, account, board and weekly cup are off.
 *
 * The values come from Firebase console > Project settings > Your apps (web).
 * Restrict the browser key to your domains and to the four APIs listed in the
 * README, and turn on App Check (reCAPTCHA Enterprise) before going live.
 * googleSignIn: show "Sign in with Google" (enable the provider first).
 * privacyContact: the page or profile shown on the privacy screen. */
window.DF_FIREBASE = null;

/* window.DF_FIREBASE = {
  apiKey: "YOUR_BROWSER_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.YOUR_REGION.firebasedatabase.app",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_WEB_APP_ID",
  appCheckSiteKey: "YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY",
  googleSignIn: false,
  privacyContact: "https://your-contact-page.example",
}; */
