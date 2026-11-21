<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
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

const shownPhoto = computed(() => previewUrl.value ?? (removePhoto.value ? null : existing.value?.photo_url ?? null));

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
    <v-app-bar flat color="primary" density="comfortable">
      <template #prepend>
        <v-btn icon="mdi-arrow-left" @click="router.back()" />
      </template>
      <v-app-bar-title>{{ isNew ? 'New item' : 'Edit item' }}</v-app-bar-title>
      <template #append>
        <v-btn variant="text" :disabled="!valid" :loading="saving" @click="save">Save</v-btn>
      </template>
    </v-app-bar>

    <v-progress-linear v-if="loading" indeterminate color="primary" />

    <v-form v-else class="pa-4" @submit.prevent="save">
      <!-- photo -->
      <div class="photo-frame mb-2">
        <img v-if="shownPhoto" :src="shownPhoto" alt="item photo" />
        <v-icon v-else size="56" color="grey">mdi-camera-plus-outline</v-icon>
      </div>
      <div class="d-flex ga-2 mb-5">
        <v-btn variant="tonal" prepend-icon="mdi-camera" class="flex-grow-1" @click="cameraInput?.click()">Take photo</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-image-multiple" class="flex-grow-1" @click="galleryInput?.click()">Choose</v-btn>
        <v-btn v-if="shownPhoto" icon="mdi-delete-outline" variant="text" color="error" @click="clearPhoto" />
      </div>
      <input ref="cameraInput" type="file" accept="image/*" capture="environment" hidden @change="onPicked" />
      <input ref="galleryInput" type="file" accept="image/*" hidden @change="onPicked" />

      <v-combobox v-model="form.category" label="Category" :items="store.meta.categories" autocapitalize="words" />
      <v-combobox v-model="form.type" label="Type" :items="typeSuggestions" autocapitalize="words" />
      <v-text-field v-model="form.design" label="Design / colour" autocapitalize="words" />
      <v-combobox v-model="form.brand" label="Brand" :items="store.meta.brands" autocapitalize="words" />

      <v-row dense>
        <v-col cols="7">
          <v-combobox v-model="form.location" label="Location" :items="store.meta.locations" />
        </v-col>
        <v-col cols="5">
          <v-combobox v-model="form.size" label="Size" :items="store.meta.sizes" />
        </v-col>
      </v-row>

      <v-text-field
        v-model.number="form.quantity"
        label="Quantity"
        type="number"
        inputmode="numeric"
        min="0"
        prepend-inner-icon="mdi-minus"
        append-inner-icon="mdi-plus"
        @click:prepend-inner="step(-1)"
        @click:append-inner="step(1)"
      />

      <v-combobox v-model="form.tag" label="Tag (set or owner)" :items="store.meta.tags" />

      <v-row dense>
        <v-col cols="7">
          <v-text-field v-model="form.purchase_date" label="Purchased on" type="date" clearable />
        </v-col>
        <v-col cols="5">
          <v-text-field v-model.number="form.price" label="Price" type="number" inputmode="decimal" step="0.01" min="0" prefix="$" clearable />
        </v-col>
      </v-row>

      <v-textarea v-model="form.remarks" label="Remarks" rows="2" auto-grow />

      <v-btn type="submit" color="primary" size="large" block :disabled="!valid" :loading="saving" class="mt-2">
        {{ isNew ? 'Add item' : 'Save changes' }}
      </v-btn>

      <template v-if="existing">
        <v-btn
          v-if="existing.status === 'active'"
          variant="text"
          color="error"
          block
          class="mt-3"
          prepend-icon="mdi-archive-arrow-down-outline"
          @click="confirmRetire = true"
        >
          Retire this item
        </v-btn>
        <v-btn v-else variant="tonal" color="secondary" block class="mt-3" prepend-icon="mdi-archive-arrow-up-outline" @click="setStatus('active')">
          Restore to active
        </v-btn>
        <div class="text-caption text-medium-emphasis text-center mt-4">
          Last updated {{ new Date(existing.updated_at).toLocaleString() }}
          <span v-if="existing.updated_by">by {{ existing.updated_by }}</span>
        </div>
      </template>
    </v-form>

    <v-dialog v-model="confirmRetire" max-width="360">
      <v-card title="Retire this item?">
        <v-card-text>It stays in the sheet marked <em>retired</em> and is hidden from the list by default.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmRetire = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" :loading="saving" @click="setStatus('retired')">Retire</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
