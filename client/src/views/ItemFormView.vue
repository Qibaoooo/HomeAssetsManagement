<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
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
  form.tag = item.tag;
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
  }
});

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
    const input: ItemInput = { ...form, updated_by: settings.displayName || 'unknown' };
    const res = isNew.value ? await api.create(input) : await api.update(props.id!, input);
    let item = res.item;
    if (pendingFile.value) {
      item = (await api.uploadPhoto(item.id, pendingFile.value)).item;
    } else if (removePhoto.value && existing.value?.photo) {
      item = (await api.deletePhoto(item.id)).item;
    }
    store.put(item);
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

// Type suggestions come only from the chosen category; with no category yet, offer every type.
const typeSuggestions = computed(() => {
  const cat = form.category.trim().toLowerCase();
  if (!cat) return store.meta.types;
  const inCat = new Set(
    store.items.filter((i) => i.category.toLowerCase() === cat).map((i) => i.type).filter(Boolean),
  );
  return [...inCat].sort((a, b) => a.localeCompare(b));
});

// Shared field props: labels always float (like sheet headers), no reserved message row.
const field = { persistentPlaceholder: true, placeholder: ' ', hideDetails: true, class: 'mb-3' } as const;
</script>

<template>
  <div class="page">
    <v-app-bar flat density="comfortable" class="px-appbar">
      <template #prepend>
        <v-btn icon="mdi-arrow-left" variant="text" aria-label="Back" @click="router.back()" />
      </template>
      <v-app-bar-title>{{ isNew ? 'New item' : 'Edit item' }}</v-app-bar-title>
      <template #append>
        <v-btn class="px-btn px-btn--cream mr-2" :disabled="!valid" :loading="saving" @click="save">Save</v-btn>
      </template>
    </v-app-bar>

    <v-progress-linear v-if="loading" indeterminate />

    <v-form v-else class="pa-4" @submit.prevent="save">
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

      <v-combobox v-model="form.category" label="Category" :items="store.meta.categories" v-bind="field" autocapitalize="words" />
      <v-combobox v-model="form.type" label="Type" :items="typeSuggestions" v-bind="field" autocapitalize="words" />
      <v-text-field v-model="form.design" label="Design" v-bind="field" autocapitalize="words" />
      <v-combobox v-model="form.brand" label="Brand" :items="store.meta.brands" v-bind="field" autocapitalize="words" />

      <v-row dense>
        <v-col cols="7">
          <v-combobox v-model="form.location" label="Location" :items="store.meta.locations" v-bind="field" />
        </v-col>
        <v-col cols="5">
          <v-combobox v-model="form.size" label="Size" :items="store.meta.sizes" v-bind="field" />
        </v-col>
      </v-row>

      <v-text-field v-model.number="form.quantity" label="Quantity" type="number" inputmode="numeric" min="0" class="qty" v-bind="field">
        <template #prepend-inner>
          <button type="button" class="qty-btn" aria-label="Decrease quantity" @click="step(-1)"><v-icon size="20">mdi-minus</v-icon></button>
        </template>
        <template #append-inner>
          <button type="button" class="qty-btn" aria-label="Increase quantity" @click="step(1)"><v-icon size="20">mdi-plus</v-icon></button>
        </template>
      </v-text-field>

      <v-combobox v-model="form.tag" label="Tag" :items="store.meta.tags" v-bind="field" />

      <v-row dense>
        <v-col cols="7">
          <v-text-field v-model="form.purchase_date" label="purchase_date" type="date" clearable v-bind="field" />
        </v-col>
        <v-col cols="5">
          <v-text-field v-model.number="form.price" label="price" type="number" inputmode="decimal" step="0.01" min="0" prefix="$" clearable v-bind="field" />
        </v-col>
      </v-row>

      <v-textarea v-model="form.remarks" label="Remarks" rows="2" auto-grow v-bind="field" />

      <v-btn type="submit" class="px-btn px-btn--primary mt-2" size="large" block :disabled="!valid" :loading="saving">
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
    </v-form>

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
.qty-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sp-sand);
  color: var(--sp-plum);
  border: 1px solid var(--sp-tan-dark);
  border-radius: 8px;
  cursor: pointer;
  padding: 0;
}
.qty-btn:active {
  background: var(--sp-tan);
}
.qty :deep(input) {
  text-align: center;
  font-size: 18px;
  font-weight: 600;
}
</style>
