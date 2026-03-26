export const STORAGE_KEY = "icon-scaler-v1";

export function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; }
  catch { return {}; }
}
