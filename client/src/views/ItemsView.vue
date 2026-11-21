<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import PxIcon from '../components/PxIcon.vue';
import PxSprite from '../components/PxSprite.vue';
import { useItems } from '../stores/items';
import { useSettings } from '../stores/settings';
import type { Item } from '../types';

defineOptions({ name: 'ItemsView' });

const store = useItems();
const settings = useSettings();

const search = ref('');
const category = ref<string | null>(null);
const location = ref<string | null>(null);

onMounted(() => store.load());
onActivated(() => store.load());

const norm = (s: string) => s.toLowerCase();
const haystack = (i: Item) =>
  norm([i.category, i.type, i.design, i.brand, i.location, i.size, i.remarks, i.tag].join(' '));

const visible = computed(() => {
  const q = norm(search.value.trim());
  return store.items.filter((i) => {
    if (!settings.showRetired && i.status === 'retired') return false;
    if (category.value && i.category !== category.value) return false;
    if (location.value && i.location !== location.value) return false;
    return !q || haystack(i).includes(q);
  });
});

const groups = computed(() => {
  const map = new Map<string, Item[]>();
  for (const i of visible.value) {
    const key = i.category || 'Uncategorised';
    (map.get(key) ?? map.set(key, []).get(key)!).push(i);
  }
  const sortKey = (i: Item) => `${i.type}\u0001${i.design}`;
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => ({ name, items: list.sort((a, b) => sortKey(a).localeCompare(sortKey(b))) }));
});

const title = (i: Item) => [i.type, i.design && i.design !== '-' ? i.design : ''].filter(Boolean).join(' · ') || i.category;
const subtitle = (i: Item) =>
  [i.brand, i.location, i.size, i.tag && i.tag !== '-' ? `#${i.tag}` : ''].filter(Boolean).join(' · ');
const totalActive = computed(() => store.active.length);

/** One standard placeholder for items without a photo. */
const PLACEHOLDER = 'emoji:cat-purple';
</script>

<template>
  <div class="page">
    <v-app-bar flat density="comfortable" class="px-appbar">
      <template #prepend>
        <PxIcon name="house" variant="white" :size="32" class="ml-2" />
      </template>
      <v-app-bar-title>Home Assets</v-app-bar-title>
      <template #append>
        <button type="button" class="mascot mr-1" aria-label="Reload" title="Reload" @click="store.load(true)">
          <PxSprite :name="store.loading ? 'bunny-happy' : 'bunny-idle'" :size="48" :fps="store.loading ? 8 : 4" />
        </button>
      </template>
    </v-app-bar>

    <div class="px-4 pt-3 pb-1 sticky">
      <v-text-field
        v-model="search"
        placeholder="Search type, design, brand, remarks…"
        prepend-inner-icon="mdi-magnify"
        clearable
        hide-details
        density="compact"
      />
      <v-chip-group v-model="category" class="mt-1" selected-class="px-chip--on" column>
        <v-chip v-for="c in store.meta.categories" :key="c" :value="c" filter size="small">{{ c }}</v-chip>
      </v-chip-group>
      <v-chip-group v-model="location" selected-class="px-chip--on">
        <v-chip v-for="l in store.meta.locations" :key="l" :value="l" filter size="small" variant="outlined">
          <v-icon start size="small">mdi-map-marker</v-icon>{{ l }}
        </v-chip>
      </v-chip-group>
    </div>

    <v-alert v-if="store.error" class="mx-4 my-2 px-alert px-alert--error" density="compact">
      {{ store.error }}
    </v-alert>

    <template v-if="groups.length">
      <section v-for="g in groups" :key="g.name" class="px-panel mx-4 mb-3">
        <v-list-subheader class="px-4 pt-2">
          {{ g.name }}
          <span class="text-medium-emphasis ml-1">({{ g.items.length }})</span>
        </v-list-subheader>
        <v-list lines="two" bg-color="transparent" class="px-list py-0">
          <v-list-item
            v-for="i in g.items"
            :key="i.id"
            :to="{ name: 'item-edit', params: { id: i.id } }"
            :class="{ 'text-disabled': i.status === 'retired' }"
          >
            <template #prepend>
              <div class="px-slot thumb mr-3">
                <img v-if="i.thumb_url" :src="i.thumb_url" alt="" />
                <PxIcon v-else :name="PLACEHOLDER" :size="40" />
              </div>
            </template>
            <v-list-item-title>{{ title(i) }}</v-list-item-title>
            <v-list-item-subtitle>{{ subtitle(i) || '—' }}</v-list-item-subtitle>
            <template #append>
              <div class="d-flex flex-column align-end ga-1">
                <v-chip v-if="i.quantity != null" size="small" class="px-chip--qty">×{{ i.quantity }}</v-chip>
                <v-chip v-if="i.status === 'retired'" size="x-small" class="px-chip--muted">retired</v-chip>
                <PxIcon v-else-if="i.dirty" name="exclaim" :size="16" title="not yet in the sheet" />
              </div>
            </template>
          </v-list-item>
        </v-list>
      </section>
    </template>

    <div v-else-if="!store.loading" class="px-panel mx-4 text-center text-medium-emphasis pa-6">
      <template v-if="store.items.length">
        <PxIcon name="emoji:bunny-question" :size="64" class="mb-2" />
        <div>Nothing matches your filters.</div>
      </template>
      <template v-else>
        <PxSprite name="bunny-sleep" :size="64" :fps="2" class="mb-2" />
        <div>No items yet. Tap <strong>Add</strong> to create the first one.</div>
      </template>
    </div>

    <v-progress-linear v-if="store.loading && !store.items.length" indeterminate />

    <div class="px-font text-caption text-medium-emphasis text-center pb-2">
      {{ visible.length }} shown · {{ totalActive }} active
    </div>

    <v-btn class="fab px-btn" :to="{ name: 'item-new' }" aria-label="Add item">
      <PxIcon name="plus" :size="32" />
    </v-btn>
  </div>
</template>

<style scoped>
.sticky {
  position: sticky;
  top: 56px;
  z-index: 3;
  background: var(--sp-cream);
}
.mascot {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  line-height: 0;
  margin-right: 8px;
}
.mascot:active {
  transform: translateY(2px);
}
.thumb {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
