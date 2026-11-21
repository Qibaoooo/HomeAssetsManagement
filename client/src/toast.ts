import { ref } from 'vue';

export interface Toast {
  text: string;
  color?: 'success' | 'warning' | 'error' | 'info';
}

/** App-wide snackbar; rendered once in App.vue. */
export const toast = ref<Toast | null>(null);

export function notify(text: string, color: Toast['color'] = 'success') {
  toast.value = { text, color };
}
