<script setup lang="ts">
import { computed } from 'vue';

/**
 * Animated 32x32 bunny from a horizontal film strip (client/src/assets/sprout/sprites).
 * Names: bunny-idle, bunny-happy, bunny-love, bunny-cool, bunny-angry, bunny-surprised, bunny-sleep, bunny-dizzy.
 */
const props = withDefaults(defineProps<{ name: string; size?: number; fps?: number }>(), { size: 64, fps: 4 });

const strips = import.meta.glob('../assets/sprout/sprites/*.png', { eager: true, import: 'default' }) as Record<string, string>;
const src = computed(() => strips[`../assets/sprout/sprites/${props.name}.png`]);

// Frame count is derived from the image once it loads.
const frames = computed(() => FRAMES[props.name] ?? 1);
const FRAMES: Record<string, number> = {
  'bunny-idle': 12,
  'bunny-happy': 4,
  'bunny-love': 4,
  'bunny-cool': 2,
  'bunny-angry': 4,
  'bunny-surprised': 2,
  'bunny-sleep': 2,
  'bunny-dizzy': 1,
};

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  backgroundImage: `url(${src.value})`,
  backgroundSize: `${props.size * frames.value}px ${props.size}px`,
  animationName: frames.value > 1 ? 'px-strip' : 'none',
  animationDuration: `${frames.value / props.fps}s`,
  animationTimingFunction: `steps(${frames.value})`,
  '--px-strip-end': `-${props.size * frames.value}px`,
}));
</script>

<template>
  <span class="px px-sprite" :style="style" role="img" :aria-label="name" />
</template>

<style>
.px-sprite {
  display: inline-block;
  flex: none;
  background-repeat: no-repeat;
  animation-iteration-count: infinite;
}
@keyframes px-strip {
  from {
    background-position-x: 0;
  }
  to {
    background-position-x: var(--px-strip-end);
  }
}
</style>
