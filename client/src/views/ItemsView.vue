<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
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
</script>

<template>
  <div class="page">
    <v-app-bar flat color="primary" density="comfortable">
      <v-app-bar-title>Home Assets</v-app-bar-title>
      <template #append>
        <v-btn icon="mdi-refresh" :loading="store.loading" @click="store.load(true)" />
      </template>
    </v-app-bar>

    <div class="px-4 pt-3 pb-1 bg-surface sticky">
      <v-text-field
        v-model="search"
        placeholder="Search type, design, brand, remarks…"
        prepend-inner-icon="mdi-magnify"
        clearable
        hide-details
        density="compact"
      />
      <v-chip-group v-model="category" class="mt-1" selected-class="text-primary" column>
        <v-chip v-for="c in store.meta.categories" :key="c" :value="c" filter size="small">{{ c }}</v-chip>
      </v-chip-group>
      <v-chip-group v-model="location" selected-class="text-secondary">
        <v-chip v-for="l in store.meta.locations" :key="l" :value="l" filter size="small" variant="outlined">
          <v-icon start size="small">mdi-map-marker</v-icon>{{ l }}
        </v-chip>
      </v-chip-group>
    </div>

    <v-alert v-if="store.error" type="error" variant="tonal" class="mx-4 my-2" density="compact">
      {{ store.error }}
    </v-alert>

    <v-list v-if="groups.length" lines="two">
      <template v-for="g in groups" :key="g.name">
        <v-list-subheader class="text-uppercase font-weight-bold">
          {{ g.name }}
          <span class="text-medium-emphasis ml-1">({{ g.items.length }})</span>
        </v-list-subheader>
        <v-list-item
          v-for="i in g.items"
          :key="i.id"
          :to="{ name: 'item-edit', params: { id: i.id } }"
          :class="{ 'text-disabled': i.status === 'retired' }"
        >
          <template #prepend>
            <v-avatar rounded="lg" size="52" color="grey-lighten-3">
              <v-img v-if="i.thumb_url" :src="i.thumb_url" cover />
              <v-icon v-else color="grey">mdi-image-off-outline</v-icon>
            </v-avatar>
          </template>
          <v-list-item-title>{{ title(i) }}</v-list-item-title>
          <v-list-item-subtitle>{{ subtitle(i) || '—' }}</v-list-item-subtitle>
          <template #append>
            <div class="d-flex flex-column align-end ga-1">
              <v-chip v-if="i.quantity != null" size="small" variant="tonal" color="primary">×{{ i.quantity }}</v-chip>
              <v-chip v-if="i.status === 'retired'" size="x-small" variant="flat" color="grey">retired</v-chip>
              <v-icon v-else-if="i.dirty" size="small" color="warning" title="not yet in the sheet">mdi-cloud-upload-outline</v-icon>
            </div>
          </template>
        </v-list-item>
      </template>
    </v-list>

    <div v-else-if="!store.loading" class="text-center text-medium-emphasis pa-10">
      <v-icon size="48" class="mb-2">mdi-package-variant</v-icon>
      <div v-if="store.items.length">Nothing matches your filters.</div>
      <div v-else>No items yet. Tap <strong>Add</strong> to create the first one.</div>
    </div>

    <v-progress-linear v-if="store.loading && !store.items.length" indeterminate color="primary" />

    <div class="text-caption text-medium-emphasis text-center pb-2">
      {{ visible.length }} shown · {{ totalActive }} active
    </div>

    <v-btn class="fab" icon="mdi-plus" color="primary" size="large" elevation="6" :to="{ name: 'item-new' }" />
  </div>
</template>

<style scoped>
.sticky {
  position: sticky;
  top: 56px;
  z-index: 3;
}
</style>
