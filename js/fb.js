/* fb.js: the Firebase web SDK (compat build, from gstatic), loaded on demand
 * and once per page for the online rooms (net.js) and the optional Google
 * account (account.js). Nothing loads until one of them is used. */
"use strict";

(function () {
  const VER = "10.14.1";
  const BASE = "https://www.gstatic.com/firebasejs/" + VER + "/";
  const loading = {};
  function loadScript(src) {
    return loading[src] || (loading[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => { delete loading[src]; s.remove(); rej(new Error("Impossibile caricare " + src)); };
      document.head.appendChild(s);
    }));
  }

  // A named Firebase app with auth and database. App Check (reCAPTCHA
  // Enterprise, invisible) lets the project answer only to the real game on
  // its own domains, not to scripts and bots; the emulator goes without.
  async function app(config, name, emulator) {
    const check = !!(config.appCheckSiteKey && !emulator);
    await loadScript(BASE + "firebase-app-compat.js");
    await loadScript(BASE + "firebase-auth-compat.js");
    await loadScript(BASE + "firebase-database-compat.js");
    if (check) await loadScript(BASE + "firebase-app-check-compat.js");
    const fb = window.firebase;
    const a = fb.initializeApp(config, name);
    if (check) a.appCheck().activate(new fb.appCheck.ReCaptchaEnterpriseProvider(config.appCheckSiteKey), true);
    return { fb, app: a };
  }

  DF.Firebase = { VER, app };
})();
