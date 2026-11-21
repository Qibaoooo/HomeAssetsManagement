<script setup lang="ts">
import { computed } from 'vue';

/**
 * 16px Sprout Lands icon, rendered crisp at any multiple of 16.
 * Names: house, plus, minus, gear, check, cross, ban, star, question, exclaim,
 *        dollar, cart, trophy, crown, podium, chat, skull, controller.
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
const src = computed(() => icons[`../assets/sprout/icons/${props.variant}-${props.name}.png`]);
</script>

<template>
  <img v-if="src" :src="src" class="px px-icon" :width="size" :height="size" :alt="name" draggable="false" />
</template>

<style scoped>
.px-icon {
  display: inline-block;
  vertical-align: middle;
  flex: none;
}
</style>
