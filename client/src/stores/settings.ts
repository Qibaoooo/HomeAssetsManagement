import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const KEY = 'home-assets.settings';

interface Persisted {
  displayName: string;
  showRetired: boolean;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { displayName: '', showRetired: false, ...(JSON.parse(raw) as Partial<Persisted>) };
  } catch {
    /* ignore */
  }
  return { displayName: '', showRetired: false };
}

/** Per-device preferences. The display name is stamped on every edit this phone makes. */
export const useSettings = defineStore('settings', () => {
  const initial = load();
  const displayName = ref(initial.displayName);
  const showRetired = ref(initial.showRetired);

  watch([displayName, showRetired], () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ displayName: displayName.value, showRetired: showRetired.value }));
    } catch {
      /* ignore */
    }
  });

  return { displayName, showRetired };
});
