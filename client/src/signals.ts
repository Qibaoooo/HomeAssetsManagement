import { ref } from 'vue';

/** Incremented when the Items tab is tapped while already on the Items page: "take me to a fresh list". */
export const itemsReset = ref(0);
export const requestItemsReset = () => itemsReset.value++;
