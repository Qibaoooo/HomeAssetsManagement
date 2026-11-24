<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import FieldEditor, { type FieldDef, type FieldValue } from '../components/FieldEditor.vue';
import PxIcon from '../components/PxIcon.vue';
import { useItems } from '../stores/items';
import { useSettings } from '../stores/settings';
import { notify } from '../toast';
import type { Item, ItemInput } from '../types';

const props = defineProps<{ id?: string }>();
const router = useRouter();
const store = useItems();
const settings = useSettings();

const isNew = computed(() => !props.id);

// Back arrow: history when there is some, otherwise (deep link, home-screen launch) the list.
function goBack() {
  if (window.history.length > 1 && window.history.state?.back) router.back();
  else router.replace({ name: 'items' });
}
const loading = ref(!!props.id);
const saving = ref(false);
const existing = ref<Item | null>(null);

const form = reactive<Required<Omit<ItemInput, 'updated_by' | 'status'>>>({
  category: '',
  type: '',
  design: '',
  brand: '',
  location: '',
  size: '',
  quantity: 1,
  remarks: '',
  tag: '',
  purchase_date: null,
  price: null,
});

// Tags: edited as a list, stored in the sheet as one comma-separated string.
const tags = ref<string[]>([]);
const splitTags = (s: string) =>
  s.split(',').map((t) => t.trim()).filter((t, i, a) => t && a.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);

function fill(item: Item) {
  existing.value = item;
  form.category = item.category;
  form.type = item.type;
  form.design = item.design;
  form.brand = item.brand;
  form.location = item.location;
  form.size = item.size;
  form.quantity = item.quantity;
  form.remarks = item.remarks;
  tags.value = splitTags(item.tag);
  form.purchase_date = item.purchase_date;
  form.price = item.price;
}

onMounted(async () => {
  await store.load();
  if (props.id) {
    const cached = store.byId.get(props.id);
    try {
      fill(cached ?? (await api.get(props.id)));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Item not found', 'error');
      router.replace({ name: 'items' });
    } finally {
      loading.value = false;
    }
  } else {
    // A new item starts in the editor on the first field, so adding is one tap shorter.
    openField('category');
  }
});

// ---- fields ------------------------------------------------------------------
// Rows on the page, in the order Next walks through them. Labels match the sheet headers.
type Key = keyof typeof form | 'tag';
const GROUPS: FieldDef[][] = [
  [
    { key: 'category', label: 'Category', kind: 'text', words: true },
    { key: 'type', label: 'Type', kind: 'text', words: true },
    { key: 'design', label: 'Design', kind: 'text', words: true },
    { key: 'brand', label: 'Brand', kind: 'text', words: true },
  ],
  [
    { key: 'location', label: 'Location', kind: 'text' },
    { key: 'size', label: 'Size', kind: 'text' },
    { key: 'quantity', label: 'Quantity', kind: 'number' },
    { key: 'tag', label: 'Tag', kind: 'tags', hint: 'Several allowed: tap suggestions, or type and press Enter.' },
  ],
  [
    { key: 'purchase_date', label: 'purchase_date', kind: 'date' },
    { key: 'price', label: 'price', kind: 'decimal', prefix: '$' },
    { key: 'remarks', label: 'Remarks', kind: 'multiline' },
  ],
];
const FIELDS = GROUPS.flat();

const editing = ref<Key | null>(null);
const editingDef = computed(() => FIELDS.find((f) => f.key === editing.value) ?? null);
const editingIndex = computed(() => FIELDS.findIndex((f) => f.key === editing.value));
const hasNext = computed(() => editingIndex.value >= 0 && editingIndex.value < FIELDS.length - 1);

function openField(key: Key) {
  editing.value = key;
}
function nextField() {
  if (hasNext.value) editing.value = FIELDS[editingIndex.value + 1].key as Key;
  else editing.value = null;
}
function closeEditor() {
  editing.value = null;
}

const editingValue = computed<FieldValue>({
  get: () => {
    const k = editing.value;
    if (!k) return null;
    if (k === 'tag') return tags.value;
    return form[k];
  },
  set: (v) => {
    const k = editing.value;
    if (!k) return;
    if (k === 'tag') tags.value = Array.isArray(v) ? v : [];
    else if (k === 'quantity' || k === 'price') form[k] = typeof v === 'number' ? v : null;
    else if (k === 'purchase_date') form.purchase_date = typeof v === 'string' && v ? v : null;
    else form[k] = typeof v === 'string' ? v : '';
  },
});

// Type suggestions come only from the chosen category; with no category yet, offer every type.
const typeSuggestions = computed(() => {
  const cat = form.category.trim().toLowerCase();
  if (!cat) return store.meta.types;
  const inCat = new Set(
    store.items.filter((i) => i.category.toLowerCase() === cat).map((i) => i.type).filter(Boolean),
  );
  return [...inCat].sort((a, b) => a.localeCompare(b));
});
const suggestions = computed<string[]>(() => {
  switch (editing.value) {
    case 'category':
      return store.meta.categories;
    case 'type':
      return typeSuggestions.value;
    case 'brand':
      return store.meta.brands;
    case 'location':
      return store.meta.locations;
    case 'size':
      return store.meta.sizes;
    case 'tag':
      return store.meta.tags;
    default:
      return [];
  }
});

// What a row shows when the editor is closed.
function display(key: Key): string {
  switch (key) {
    case 'tag':
      return tags.value.map((t) => `#${t}`).join('  ');
    case 'quantity':
      return form.quantity == null ? '' : String(form.quantity);
    case 'price':
      return form.price == null ? '' : `$${form.price}`;
    case 'purchase_date':
      return form.purchase_date ?? '';
    default:
      return form[key] ?? '';
  }
}

// ---- photo ---------------------------------------------------------------
const cameraInput = ref<HTMLInputElement>();
const galleryInput = ref<HTMLInputElement>();
const pendingFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const removePhoto = ref(false);

function onPicked(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow re-picking the same file
  if (!file) return;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  pendingFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
  removePhoto.value = false;
}
function clearPhoto() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = null;
  pendingFile.value = null;
  removePhoto.value = !!existing.value?.photo_url;
}
onBeforeUnmount(() => previewUrl.value && URL.revokeObjectURL(previewUrl.value));

const shownPhoto = computed(() => previewUrl.value ?? (removePhoto.value ? null : (existing.value?.photo_url ?? null)));

// ---- save ----------------------------------------------------------------
const valid = computed(() => !!(form.category.trim() || form.type.trim() || form.design.trim()));

function step(delta: number) {
  form.quantity = Math.max(0, (form.quantity ?? 0) + delta);
}

async function save() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  try {
    const input: ItemInput = { ...form, tag: splitTags(tags.value.join(',')).join(', '), updated_by: settings.displayName || 'unknown' };
    const res = isNew.value ? await api.create(input) : await api.update(props.id!, input);
    let item = res.item;
    if (pendingFile.value) {
      item = (await api.uploadPhoto(item.id, pendingFile.value)).item;
    } else if (removePhoto.value && existing.value?.photo) {
      item = (await api.deletePhoto(item.id)).item;
    }
    store.put(item);
    void store.load(true); // refresh categories/locations/tags so new values appear as chips right away
    notify(res.synced ? 'Saved and written to the sheet' : 'Saved locally. Sheet sync pending.', res.synced ? 'success' : 'warning');
    router.replace({ name: 'items' });
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Save failed', 'error');
  } finally {
    saving.value = false;
  }
}

const confirmRetire = ref(false);
async function setStatus(status: 'active' | 'retired') {
  if (!props.id || saving.value) return;
  saving.value = true;
  try {
    const res = await api.setStatus(props.id, status, settings.displayName || 'unknown');
    store.put(res.item);
    notify(status === 'retired' ? 'Item retired' : 'Item restored', res.synced ? 'success' : 'warning');
    router.replace({ name: 'items' });
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Failed', 'error');
  } finally {
    saving.value = false;
    confirmRetire.value = false;
  }
}
</script>

<template>
  <div class="page">
    <v-app-bar flat density="comfortable" class="px-appbar">
      <template #prepend>
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Back" @click="goBack" />
      </template>
      <v-app-bar-title>{{ isNew ? 'New item' : 'Edit item' }}</v-app-bar-title>
      <template #append>
        <v-btn class="px-btn px-btn--cream mr-2" :disabled="!valid" :loading="saving" @click="save">Save</v-btn>
      </template>
    </v-app-bar>

    <v-progress-linear v-if="loading" indeterminate />

    <div v-else class="pa-4">
      <!-- photo -->
      <div class="px-panel px-panel--dark mb-2">
        <div class="photo-frame" :class="{ 'photo-frame--empty': !shownPhoto }">
          <img v-if="shownPhoto" :src="shownPhoto" alt="item photo" />
          <PxIcon v-else name="emoji:cat-purple" :size="80" />
        </div>
      </div>
      <div class="d-flex ga-2 mb-5">
        <v-btn class="px-btn px-btn--cream flex-grow-1" @click="cameraInput?.click()">
          <v-icon start>mdi-camera</v-icon>Take photo
        </v-btn>
        <v-btn class="px-btn px-btn--cream flex-grow-1" @click="galleryInput?.click()">
          <v-icon start>mdi-image-multiple</v-icon>Choose
        </v-btn>
        <v-btn v-if="shownPhoto" class="px-btn px-btn--grey px-btn--icon" aria-label="Remove photo" @click="clearPhoto">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
      <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="onPicked" />
      <input ref="galleryInput" type="file" accept="image/*" hidden @change="onPicked" />

      <!-- fields as rows: nothing here opens a keyboard; tapping a row opens the editor -->
      <div v-for="(group, gi) in GROUPS" :key="gi" class="px-panel mb-3 rows">
        <button
          v-for="f in group"
          :key="f.key"
          type="button"
          class="frow"
          :class="{ 'frow--empty': !display(f.key as Key) }"
          @click="openField(f.key as Key)"
        >
          <span class="frow__label">{{ f.label }}</span>
          <template v-if="f.key === 'quantity'">
            <span class="frow__qty">
              <span class="qty-btn" role="button" tabindex="0" aria-label="Decrease quantity" @click.stop="step(-1)" @keydown.enter.stop.prevent="step(-1)">
                <v-icon size="18">mdi-minus</v-icon>
              </span>
              <span class="frow__value frow__value--qty">{{ display('quantity') || '0' }}</span>
              <span class="qty-btn" role="button" tabindex="0" aria-label="Increase quantity" @click.stop="step(1)" @keydown.enter.stop.prevent="step(1)">
                <v-icon size="18">mdi-plus</v-icon>
              </span>
            </span>
          </template>
          <span v-else class="frow__value">{{ display(f.key as Key) || 'Tap to add' }}</span>
          <v-icon size="18" class="frow__chev">mdi-chevron-right</v-icon>
        </button>
      </div>

      <v-btn class="px-btn px-btn--primary mt-2" size="large" block :disabled="!valid" :loading="saving" @click="save">
        {{ isNew ? 'Add item' : 'Save changes' }}
      </v-btn>

      <template v-if="existing">
        <v-btn v-if="existing.status === 'active'" variant="text" color="error" block class="mt-3" @click="confirmRetire = true">
          <v-icon start>mdi-archive-arrow-down-outline</v-icon>Retire this item
        </v-btn>
        <v-btn v-else class="px-btn px-btn--cream mt-3" block @click="setStatus('active')">
          <v-icon start>mdi-archive-arrow-up-outline</v-icon>Restore to active
        </v-btn>
        <div class="text-caption text-medium-emphasis text-center mt-4">
          Last updated {{ new Date(existing.updated_at).toLocaleString() }}
          <span v-if="existing.updated_by">by {{ existing.updated_by }}</span>
        </div>
      </template>
    </div>

    <FieldEditor
      v-model="editingValue"
      :open="editing !== null"
      :field="editingDef"
      :suggestions="suggestions"
      :has-next="hasNext"
      @next="nextField"
      @done="closeEditor"
    />

    <v-dialog v-model="confirmRetire" max-width="360">
      <v-card class="px-panel" title="Retire this item?">
        <v-card-text class="d-flex align-center ga-3">
          <PxIcon name="emoji:bunny-sweat" :size="48" />
          <span>It stays in the sheet marked <em>retired</em> and is hidden from the list by default.</span>
        </v-card-text>
        <v-card-actions class="ga-2 px-3 pb-3">
          <v-spacer />
          <v-btn class="px-btn px-btn--cream" @click="confirmRetire = false">Cancel</v-btn>
          <v-btn class="px-btn px-btn--primary" :loading="saving" @click="setStatus('retired')">Retire</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.rows {
  padding: 2px 0;
}
.frow {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 8px 10px 8px 14px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--sp-cream);
  text-align: left;
  font: inherit;
  color: var(--sp-ink);
  cursor: pointer;
}
.frow:last-child {
  border-bottom: none;
}
.frow:active {
  background: var(--sp-cream);
}
.frow__label {
  font-size: 13px;
  color: var(--sp-brown-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.frow__value {
  font-size: 16px;
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}
.frow--empty .frow__value {
  color: var(--sp-muted);
  font-weight: 400;
}
.frow__chev {
  color: var(--sp-tan-dark);
}
.frow__qty {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.frow__value--qty {
  min-width: 28px;
  text-align: center;
  font-size: 18px;
}
.qty-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--sp-sand);
  color: var(--sp-plum);
  border: 1px solid var(--sp-tan-dark);
  border-radius: 8px;
}
.qty-btn:active {
  background: var(--sp-tan);
}
</style>
