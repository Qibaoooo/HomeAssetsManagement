import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api';
import type { Item, Meta } from '../types';

const EMPTY_META: Meta = { categories: [], types: [], brands: [], locations: [], tags: [], sizes: [] };

export const useItems = defineStore('items', () => {
  const items = ref<Item[]>([]);
  const meta = ref<Meta>(EMPTY_META);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const loadedAt = ref<number>(0);

  async function load(force = false) {
    if (loading.value) return;
    if (!force && Date.now() - loadedAt.value < 5_000) return;
    loading.value = true;
    error.value = null;
    try {
      const [list, m] = await Promise.all([api.list('all'), api.meta()]);
      items.value = list;
      meta.value = m;
      loadedAt.value = Date.now();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function put(item: Item) {
    const i = items.value.findIndex((x) => x.id === item.id);
    if (i >= 0) items.value[i] = item;
    else items.value.push(item);
  }

  const byId = computed(() => new Map(items.value.map((i) => [i.id, i])));
  const active = computed(() => items.value.filter((i) => i.status === 'active'));

  return { items, meta, loading, error, load, put, byId, active };
});
