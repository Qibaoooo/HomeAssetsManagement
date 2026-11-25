<script setup lang="ts">
/**
 * Settings > Locations: the fixed location tree items pick from.
 * Renaming or moving a location moves every item under it, in the app and the sheet.
 * "Not in the list" shows locations typed by hand in the sheet, to add or map them.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import { useItems } from '../stores/items';
import { useSettings } from '../stores/settings';
import { notify } from '../toast';
import type { LocationNode, LocationUsage } from '../types';

const SEP = ' > ';
const MAX_DEPTH = 4;
const store = useItems();
const settings = useSettings();
const by = () => settings.displayName || 'unknown';

const usage = ref<LocationUsage>({ nodes: [], unlisted: [] });
const loaded = ref(false);
async function load() {
  try {
    usage.value = await api.locations();
  } catch {
    /* shown empty */
  } finally {
    loaded.value = true;
  }
}
onMounted(load);

const parentOf = (p: string) => (p.includes(SEP) ? p.slice(0, p.lastIndexOf(SEP)) : '');
const leaf = (p: string) => p.split(SEP).pop() ?? p;
const join = (parent: string, name: string) => (parent ? `${parent}${SEP}${name.trim()}` : name.trim());
const under = (p: string, root: string) => p === root || p.startsWith(root + SEP);
const siblingsOf = (n: LocationNode) => usage.value.nodes.filter((x) => parentOf(x.path) === parentOf(n.path));
const isFirst = (n: LocationNode) => siblingsOf(n)[0]?.path === n.path;
const isLast = (n: LocationNode) => siblingsOf(n).at(-1)?.path === n.path;
const height = (n: LocationNode) =>
  Math.max(...usage.value.nodes.filter((x) => under(x.path, n.path)).map((x) => x.depth - n.depth)) + 1;

// ---- one dialog for every action ------------------------------------------------------
type Mode = 'add' | 'rename' | 'move' | 'delete' | 'map';
const mode = ref<Mode | null>(null);
const node = ref<LocationNode | null>(null); // the location acted on
const parent = ref(''); // for add
const unlistedValue = ref(''); // for map
const name = ref('');
const target = ref<string>('');
const busy = ref(false);

function open(m: Mode, n: LocationNode | null, extra?: string) {
  mode.value = m;
  node.value = n;
  name.value = m === 'rename' && n ? n.name : '';
  parent.value = m === 'add' ? (extra ?? '') : '';
  unlistedValue.value = m === 'map' ? (extra ?? '') : '';
  target.value = m === 'move' && n ? parentOf(n.path) : '';
  if (m === 'map') target.value = usage.value.nodes[0]?.path ?? '';
}
const close = () => (mode.value = null);

const title = computed(() => {
  switch (mode.value) {
    case 'add':
      return parent.value ? `Add inside “${leaf(parent.value)}”` : 'Add a location';
    case 'rename':
      return `Rename “${node.value?.name}”`;
    case 'move':
      return `Move “${node.value?.name}”`;
    case 'delete':
      return `Delete “${node.value?.name}”`;
    case 'map':
      return `Move items from “${unlistedValue.value}”`;
    default:
      return '';
  }
});

/** Where a location can move to: top level or any location outside its own subtree, within the depth limit. */
const moveTargets = computed(() => {
  const n = node.value;
  if (!n) return [];
  const h = height(n);
  return [
    { title: 'Top level', value: '' },
    ...usage.value.nodes
      .filter((x) => !under(x.path, n.path) && x.depth + 1 + h <= MAX_DEPTH)
      .map((x) => ({ title: x.path, value: x.path })),
  ];
});
/** Where items can go when their location is deleted. */
const reassignTargets = computed(() => {
  const n = node.value;
  return [
    { title: 'No location', value: '' },
    ...usage.value.nodes.filter((x) => !n || !under(x.path, n.path)).map((x) => ({ title: x.path, value: x.path })),
  ];
});
const mapTargets = computed(() => usage.value.nodes.map((x) => ({ title: x.path, value: x.path })));

const canSubmit = computed(() => {
  switch (mode.value) {
    case 'add':
      return !!name.value.trim() && !name.value.includes('>');
    case 'rename':
      return !!name.value.trim() && !name.value.includes('>') && name.value.trim() !== node.value?.name;
    case 'move':
      return !!node.value && target.value !== parentOf(node.value.path);
    case 'delete':
      return true;
    case 'map':
      return !!target.value;
    default:
      return false;
  }
});

async function submit() {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  try {
    let msg = '';
    let synced = true;
    const n = node.value;
    if (mode.value === 'add') {
      const r = await api.addLocation(join(parent.value, name.value));
      msg = `Added “${leaf(r.path)}”`;
      synced = r.synced;
    } else if (mode.value === 'rename' && n) {
      const r = await api.renameLocation(n.path, join(parentOf(n.path), name.value), by());
      msg = `Renamed. ${r.changed} item${r.changed === 1 ? '' : 's'} updated`;
      synced = r.synced;
    } else if (mode.value === 'move' && n) {
      const r = await api.renameLocation(n.path, join(target.value, n.name), by());
      msg = `Moved. ${r.changed} item${r.changed === 1 ? '' : 's'} updated`;
      synced = r.synced;
    } else if (mode.value === 'delete' && n) {
      const r = await api.deleteLocation(n.path, n.subtreeTotal ? target.value : null, by());
      msg = r.changed ? `Deleted. ${r.changed} item${r.changed === 1 ? '' : 's'} moved` : 'Deleted';
      synced = r.synced;
    } else if (mode.value === 'map') {
      const r = await api.renameLocation(unlistedValue.value, target.value, by());
      msg = `${r.changed} item${r.changed === 1 ? '' : 's'} moved to “${target.value}”`;
      synced = r.synced;
    }
    notify(msg + (synced ? '' : '. Sheet sync pending.'), synced ? 'success' : 'warning');
    close();
    await Promise.all([load(), store.load(true)]);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Failed', 'error');
  } finally {
    busy.value = false;
  }
}

async function reorder(n: LocationNode, direction: 'up' | 'down') {
  try {
    await api.reorderLocation(n.path, direction);
    await Promise.all([load(), store.load(true)]);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Failed', 'error');
  }
}
async function addUnlisted(value: string) {
  try {
    const r = await api.addLocation(value);
    notify(`Added “${r.path}” to the list`, r.synced ? 'success' : 'warning');
    await Promise.all([load(), store.load(true)]);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Failed', 'error');
  }
}
</script>

<template>
  <v-card id="locations" class="px-panel mb-4" title="Locations">
    <v-card-text class="pt-0">
      <div class="text-caption text-medium-emphasis mb-2">
        Items pick their location from this list. Tap a location for options. Renaming or moving one moves every item
        inside it, in the app and the sheet.
      </div>

      <div v-if="usage.nodes.length" class="tree">
        <v-menu v-for="n in usage.nodes" :key="n.path" location="bottom end">
          <template #activator="{ props: menu }">
            <button type="button" class="lrow" :style="{ paddingLeft: `${10 + n.depth * 20}px` }" v-bind="menu">
              <v-icon size="18" class="lrow__icon">{{ n.depth ? 'mdi-subdirectory-arrow-right' : 'mdi-map-marker-outline' }}</v-icon>
              <span class="lrow__name">{{ n.name }}</span>
              <span class="lrow__count">{{ n.subtreeActive || '' }}</span>
              <v-icon size="18" class="lrow__more">mdi-dots-vertical</v-icon>
            </button>
          </template>
          <v-list density="compact" class="px-panel">
            <v-list-item v-if="n.depth < MAX_DEPTH - 1" prepend-icon="mdi-plus" title="Add inside" @click="open('add', null, n.path)" />
            <v-list-item prepend-icon="mdi-pencil-outline" title="Rename" @click="open('rename', n)" />
            <v-list-item prepend-icon="mdi-folder-move-outline" title="Move to…" @click="open('move', n)" />
            <v-list-item v-if="!isFirst(n)" prepend-icon="mdi-arrow-up" title="Move up" @click="reorder(n, 'up')" />
            <v-list-item v-if="!isLast(n)" prepend-icon="mdi-arrow-down" title="Move down" @click="reorder(n, 'down')" />
            <v-list-item prepend-icon="mdi-delete-outline" title="Delete" class="text-error" @click="open('delete', n)" />
          </v-list>
        </v-menu>
      </div>
      <div v-else-if="loaded" class="text-medium-emphasis">No locations yet.</div>

      <v-btn class="px-btn px-btn--cream mt-3" block @click="open('add', null, '')">
        <v-icon start>mdi-plus</v-icon>Add a location
      </v-btn>

      <template v-if="usage.unlisted.length">
        <div class="px-font unlisted-title mt-5 mb-1">Not in the list</div>
        <div class="text-caption text-medium-emphasis mb-2">
          Typed by hand in the sheet. Add each one to the list, or move its items to a listed location.
        </div>
        <div v-for="u in usage.unlisted" :key="u.location" class="urow">
          <div class="urow__text">
            <div class="urow__name">{{ u.location }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ u.active }} active<template v-if="u.retired"> · {{ u.retired }} retired</template>
            </div>
          </div>
          <v-btn size="small" class="px-btn px-btn--cream" @click="addUnlisted(u.location)">Add</v-btn>
          <v-btn size="small" class="px-btn px-btn--cream" :disabled="!usage.nodes.length" @click="open('map', null, u.location)">Move…</v-btn>
        </div>
      </template>
    </v-card-text>
  </v-card>

  <v-dialog :model-value="!!mode" max-width="420" @update:model-value="(v) => !v && close()">
    <v-card v-if="mode" class="px-panel" :title="title">
      <v-card-text>
        <template v-if="mode === 'add' || mode === 'rename'">
          <v-text-field
            v-model="name"
            label="Name"
            autofocus
            hide-details="auto"
            :counter="60"
            :rules="[(v: string) => !v.includes('>') || 'A name cannot contain >']"
            @keyup.enter="submit"
          />
          <div v-if="mode === 'add'" class="text-caption text-medium-emphasis mt-2">
            Full location: {{ join(parent, name || '…') }}
          </div>
          <div v-else-if="node && node.subtreeTotal" class="text-caption text-medium-emphasis mt-2">
            {{ node.subtreeTotal }} item{{ node.subtreeTotal === 1 ? '' : 's' }} will be updated.
          </div>
        </template>

        <template v-else-if="mode === 'move' && node">
          <v-select v-model="target" :items="moveTargets" label="Move inside" hide-details />
          <div class="text-caption text-medium-emphasis mt-2">
            New location: {{ join(target, node.name) }}<template v-if="node.subtreeTotal">
              · {{ node.subtreeTotal }} item{{ node.subtreeTotal === 1 ? '' : 's' }} follow</template>
          </div>
        </template>

        <template v-else-if="mode === 'delete' && node">
          <template v-if="node.subtreeTotal">
            <div class="mb-3">
              {{ node.subtreeTotal }} item{{ node.subtreeTotal === 1 ? ' uses' : 's use' }} this location or one inside
              it. Where should {{ node.subtreeTotal === 1 ? 'it' : 'they' }} go?
            </div>
            <v-select v-model="target" :items="reassignTargets" label="Move items to" hide-details />
          </template>
          <div v-else>No items use it. Its sub-locations are deleted too.</div>
        </template>

        <template v-else-if="mode === 'map'">
          <v-select v-model="target" :items="mapTargets" label="Move items to" hide-details />
        </template>
      </v-card-text>
      <v-card-actions class="ga-2 px-3 pb-3">
        <v-spacer />
        <v-btn class="px-btn px-btn--cream" @click="close">Cancel</v-btn>
        <v-btn class="px-btn px-btn--primary" :disabled="!canSubmit" :loading="busy" @click="submit">
          {{ mode === 'delete' ? 'Delete' : mode === 'add' ? 'Add' : mode === 'rename' ? 'Rename' : 'Move' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.tree {
  border: 1px solid var(--sp-cream);
  border-radius: 10px;
  overflow: hidden;
}
.lrow {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  padding: 6px 8px 6px 10px;
  background: var(--sp-paper);
  border: none;
  border-bottom: 1px solid var(--sp-cream);
  font: inherit;
  color: var(--sp-ink);
  text-align: left;
  cursor: pointer;
}
.lrow:last-child {
  border-bottom: none;
}
.lrow:active {
  background: var(--sp-cream);
}
.lrow__icon {
  color: var(--sp-tan-dark);
}
.lrow__name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.lrow__count {
  font-size: 13px;
  color: var(--sp-muted);
}
.lrow__more {
  color: var(--sp-tan-dark);
}
.unlisted-title {
  font-size: 14px;
  color: var(--sp-brown-dark);
}
.urow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sp-cream);
}
.urow__text {
  flex: 1;
  min-width: 0;
}
.urow__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
