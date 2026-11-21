<script setup lang="ts">
import { computed } from 'vue';

/**
 * Sprout Lands pixel image, rendered crisp.
 * - 16px UI icons: house, plus, minus, gear, check, cross, ban, star, question, exclaim,
 *   dollar, cart, trophy, crown, podium, chat, skull, controller (variants dark/light/pale/white).
 * - `emoji:<name>` for the ~28px emoji (cat-*, bunny-*, chicken, cow, sprout, ...).
 */
const props = withDefaults(
  defineProps<{
    name: string;
    variant?: 'dark' | 'light' | 'pale' | 'white';
    size?: number;
  }>(),
  { variant: 'dark', size: 32 },
);

const icons = import.meta.glob('../assets/sprout/icons/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const emoji = import.meta.glob('../assets/sprout/emoji/*.png', { eager: true, import: 'default' }) as Record<string, string>;

const src = computed(() =>
  props.name.startsWith('emoji:')
    ? emoji[`../assets/sprout/emoji/${props.name.slice(6)}.png`]
    : icons[`../assets/sprout/icons/${props.variant}-${props.name}.png`],
);
</script>

<template>
  <img v-if="src" :src="src" class="px px-icon" :width="size" :height="size" :alt="name" draggable="false" />
</template>

<style scoped>
.px-icon {
  display: inline-block;
  vertical-align: middle;
  flex: none;
  object-fit: contain;
}
</style>
