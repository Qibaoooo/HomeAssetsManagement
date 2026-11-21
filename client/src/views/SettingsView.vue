<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import PxIcon from '../components/PxIcon.vue';
import { useItems } from '../stores/items';
import { useSettings } from '../stores/settings';
import { notify } from '../toast';
import type { SyncStatus } from '../types';

const settings = useSettings();
const store = useItems();
const status = ref<SyncStatus | null>(null);
const syncing = ref(false);

async function refresh() {
  try {
    status.value = await api.syncStatus();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Cannot reach server', 'error');
  }
}
onMounted(refresh);

async function syncNow() {
  syncing.value = true;
  try {
    const { result } = await api.sync();
    notify(result.ok ? 'Sync complete' : `Sync failed: ${result.error}`, result.ok ? 'success' : 'error');
    await Promise.all([refresh(), store.load(true)]);
  } finally {
    syncing.value = false;
  }
}

const serverHost = window.location.host;
const fmt = (iso: string) => new Date(iso).toLocaleString();
const counts = (r: NonNullable<SyncStatus['last']>) =>
  (['pulled', 'pushed', 'appended', 'backfilled', 'retired', 'conflicts'] as const)
    .filter((k) => r[k])
    .map((k) => `${k} ${r[k]}`)
    .join(', ') || 'no changes';
</script>

<template>
  <div class="page">
    <v-app-bar flat density="comfortable" class="px-appbar">
      <template #prepend>
        <PxIcon name="gear" variant="white" :size="32" class="ml-2" />
      </template>
      <v-app-bar-title>Settings</v-app-bar-title>
    </v-app-bar>

    <div class="pa-4">
      <v-card class="px-panel mb-4" title="This device">
        <v-card-text>
          <v-text-field
            v-model="settings.displayName"
            label="Your name"
            hint="Stamped on every change you make, so the sheet shows who edited what."
            persistent-hint
            prepend-inner-icon="mdi-account"
          />
          <v-switch v-model="settings.showRetired" label="Show retired items in the list" inset hide-details class="mt-2" />
        </v-card-text>
      </v-card>

      <v-card class="px-panel" title="Google Sheet sync">
        <v-card-text v-if="status">
          <div v-if="status.last" class="mb-2 d-flex align-center ga-2">
            <PxIcon :name="status.last.ok ? 'check' : 'cross'" :size="24" />
            <span class="px-font">{{ status.last.ok ? 'OK' : 'Failed' }}</span>
            <span class="text-medium-emphasis">{{ fmt(status.last.at) }}</span>
          </div>
          <div v-if="status.last" class="text-body-2 mb-2">{{ status.last.ok ? counts(status.last) : status.last.error }}</div>
          <div v-else class="text-medium-emphasis mb-2">No sync has run yet.</div>
          <v-alert v-if="status.pending" class="px-alert mb-2" density="compact">
            {{ status.pending }} change{{ status.pending > 1 ? 's' : '' }} waiting to be written to the sheet.
          </v-alert>
        </v-card-text>
        <v-card-actions class="px-3 pb-3 ga-2">
          <v-btn class="px-btn" :loading="syncing" @click="syncNow">
            <PxIcon name="star" :size="20" class="mr-2" />Sync now
          </v-btn>
          <v-btn class="px-btn px-btn--cream" @click="refresh">Refresh</v-btn>
        </v-card-actions>
        <v-expansion-panels v-if="status?.log.length" variant="accordion" flat>
          <v-expansion-panel title="Recent log">
            <v-expansion-panel-text>
              <div v-for="(l, i) in status.log" :key="i" class="text-caption mb-1">
                <span class="text-medium-emphasis">{{ fmt(l.at) }}</span>
                <PxIcon :name="l.level === 'error' ? 'cross' : l.level === 'warn' ? 'exclaim' : 'check'" :size="16" class="mx-1" />
                {{ l.message }}
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card>

      <div class="px-font text-caption text-medium-emphasis text-center mt-6">
        Server: {{ serverHost }}
      </div>
      <div class="text-caption text-medium-emphasis text-center mt-1">
        UI art: Sprout Lands by Cup Nooble
      </div>
    </div>
  </div>
</template>
