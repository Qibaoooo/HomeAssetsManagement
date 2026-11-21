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

// Suggest the usual types for the chosen category first.
const typeSuggestions = computed(() => {
  const inCat = new Set(store.items.filter((i) => i.category === form.category).map((i) => i.type));
  return [...inCat, ...store.meta.types.filter((t) => !inCat.has(t))].filter(Boolean);
});
</script>

<template>
  <div class="page">
    <v-app-bar flat density="comfortable" class="px-appbar">
      <template #prepend>
        <v-btn variant="text" class="px-btn px-btn--cream px-btn--icon ml-2" aria-label="Back" @click="router.back()">
          <PxIcon name="minus" :size="24" />
        </v-btn>
      </template>
      <v-app-bar-title>{{ isNew ? 'New item' : 'Edit item' }}</v-app-bar-title>
      <template #append>
        <v-btn class="px-btn mr-2" :disabled="!valid" :loading="saving" @click="save">
          <PxIcon name="check" :size="20" class="mr-1" />Save
        </v-btn>
      </template>
    </v-app-bar>

    <v-progress-linear v-if="loading" indeterminate />

    <v-form v-else class="pa-4" @submit.prevent="save">
      <!-- photo -->
      <div class="px-panel px-panel--dark mb-2">
        <div class="photo-frame" :class="{ 'photo-frame--empty': !shownPhoto }">
          <img v-if="shownPhoto" :src="shownPhoto" alt="item photo" />
          <PxIcon v-else name="question" variant="light" :size="64" />
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
          <PxIcon name="cross" :size="20" />
        </v-btn>
      </div>
      <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="onPicked" />
      <input ref="galleryInput" type="file" accept="image/*" hidden @change="onPicked" />

      <v-combobox v-model="form.category" label="Category" :items="store.meta.categories" autocapitalize="words" />
      <v-combobox v-model="form.type" label="Type" :items="typeSuggestions" autocapitalize="words" />
      <v-text-field v-model="form.design" label="Design" autocapitalize="words" />
      <v-combobox v-model="form.brand" label="Brand" :items="store.meta.brands" autocapitalize="words" />

      <v-row dense>
        <v-col cols="7">
          <v-combobox v-model="form.location" label="Location" :items="store.meta.locations" />
        </v-col>
        <v-col cols="5">
          <v-combobox v-model="form.size" label="Size" :items="store.meta.sizes" />
        </v-col>
      </v-row>

      <v-text-field v-model.number="form.quantity" label="Quantity" type="number" inputmode="numeric" min="0" class="qty">
        <template #prepend-inner>
          <button type="button" class="qty-btn" aria-label="Decrease" @click="step(-1)"><PxIcon name="minus" :size="16" /></button>
        </template>
        <template #append-inner>
          <button type="button" class="qty-btn" aria-label="Increase" @click="step(1)"><PxIcon name="plus" :size="16" /></button>
        </template>
      </v-text-field>

      <v-combobox v-model="form.tag" label="Tag" :items="store.meta.tags" />

      <v-row dense>
        <v-col cols="7">
          <v-text-field v-model="form.purchase_date" label="purchase_date" type="date" clearable />
        </v-col>
        <v-col cols="5">
          <v-text-field v-model.number="form.price" label="price" type="number" inputmode="decimal" step="0.01" min="0" prefix="$" clearable />
        </v-col>
      </v-row>

      <v-textarea v-model="form.remarks" label="Remarks" rows="2" auto-grow />

      <v-btn type="submit" class="px-btn px-btn--brown mt-2" size="large" block :disabled="!valid" :loading="saving">
        <PxIcon name="check" variant="white" :size="20" class="mr-2" />{{ isNew ? 'Add item' : 'Save changes' }}
      </v-btn>

      <template v-if="existing">
        <v-btn v-if="existing.status === 'active'" variant="text" color="error" block class="mt-3" @click="confirmRetire = true">
          <PxIcon name="ban" :size="20" class="mr-2" />Retire this item
        </v-btn>
        <v-btn v-else class="px-btn px-btn--cream mt-3" block @click="setStatus('active')">
          <PxIcon name="star" :size="20" class="mr-2" />Restore to active
        </v-btn>
        <div class="text-caption text-medium-emphasis text-center mt-4">
          Last updated {{ new Date(existing.updated_at).toLocaleString() }}
          <span v-if="existing.updated_by">by {{ existing.updated_by }}</span>
        </div>
      </template>
    </v-form>

    <v-dialog v-model="confirmRetire" max-width="360">
      <v-card class="px-panel" title="Retire this item?">
        <v-card-text>It stays in the sheet marked <em>retired</em> and is hidden from the list by default.</v-card-text>
        <v-card-actions class="ga-2 px-3 pb-3">
          <v-spacer />
          <v-btn class="px-btn px-btn--cream" @click="confirmRetire = false">Cancel</v-btn>
          <v-btn class="px-btn px-btn--brown" :loading="saving" @click="setStatus('retired')">Retire</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.qty-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sp-sand);
  border: 2px solid var(--sp-brown);
  border-radius: 3px;
  box-shadow: 0 2px 0 var(--sp-brown-dark);
  cursor: pointer;
  padding: 0;
}
.qty-btn:active {
  transform: translateY(2px);
  box-shadow: none;
}
.qty :deep(input) {
  text-align: center;
  font-family: 'Sprout', monospace;
  font-size: 21px;
}
</style>
