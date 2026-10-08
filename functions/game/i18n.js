/* i18n.js: five languages. Text lives in js/lang/<id>.js as DF.L.<id>;
 * mechanics stay language-neutral. DF.t("ui.play") looks up the current
 * language, then English, then Italian, then shows the key. */
"use strict";

(function () {
  DF.L = DF.L || {};
  DF.LANGS = [
    { id: "it", name: "Italiano", dec: "," },
    { id: "en", name: "English", dec: "." },
    { id: "fr", name: "Français", dec: "," },
    { id: "es", name: "Español", dec: "," },
    { id: "de", name: "Deutsch", dec: "," },
  ];
  const ids = DF.LANGS.map((l) => l.id);

  function detect() {
    const saved = DF.storage.get("ovb_lang", null);
    if (saved && ids.includes(saved)) return saved;
    const nav = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
    for (const n of nav) { const id = String(n || "").slice(0, 2).toLowerCase(); if (ids.includes(id)) return id; }
    return "en";
  }

  DF.lang = typeof window !== "undefined" ? detect() : "it";
  const listeners = [];

  function dig(obj, path) {
    let o = obj;
    for (const k of path) { if (o == null) return undefined; o = o[k]; }
    return o;
  }

  // t("ui.hello", {name: "Ada"}) -> "Ciao Ada"; arrays and objects are returned as they are
  DF.t = function (key, vars) {
    const path = key.split(".");
    let v = dig(DF.L[DF.lang], path);
    if (v === undefined) v = dig(DF.L.en, path);
    if (v === undefined) v = dig(DF.L.it, path);
    if (v === undefined) return key;
    if (typeof v === "string" && vars) v = v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return v;
  };
  // pick one of a list of lines, deterministic when a number is given
  DF.tPick = function (key, n) {
    const arr = DF.t(key);
    if (!Array.isArray(arr) || !arr.length) return "";
    const i = n == null ? Math.floor(Math.random() * arr.length) : Math.abs(n) % arr.length;
    return arr[i];
  };
  DF.setLang = function (id) {
    if (!ids.includes(id)) return;
    DF.lang = id;
    DF.storage.set("ovb_lang", id);
    if (typeof document !== "undefined") document.documentElement.lang = id;
    listeners.forEach((f) => f(id));
  };
  DF.onLang = (f) => listeners.push(f);
  DF.fmtDec = (v, digits = 1) => {
    const s = v.toFixed(digits);
    const l = DF.LANGS.find((x) => x.id === DF.lang);
    return l && l.dec === "," ? s.replace(".", ",") : s;
  };
  if (typeof document !== "undefined") document.documentElement.lang = DF.lang;
})();
