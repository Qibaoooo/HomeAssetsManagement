<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
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
    <v-app-bar flat color="primary" density="comfortable">
      <v-app-bar-title>Settings</v-app-bar-title>
    </v-app-bar>

    <div class="pa-4">
      <v-card class="mb-4" title="This device">
        <v-card-text>
          <v-text-field
            v-model="settings.displayName"
            label="Your name"
            hint="Stamped on every change you make, so the sheet shows who edited what."
            persistent-hint
            prepend-inner-icon="mdi-account"
          />
          <v-switch v-model="settings.showRetired" label="Show retired items in the list" color="primary" hide-details class="mt-2" />
        </v-card-text>
      </v-card>

      <v-card title="Google Sheet sync">
        <v-card-text v-if="status">
          <div v-if="status.last" class="mb-2">
            <v-chip :color="status.last.ok ? 'success' : 'error'" size="small" variant="flat" class="mr-2">
              {{ status.last.ok ? 'OK' : 'Failed' }}
            </v-chip>
            <span class="text-medium-emphasis">{{ fmt(status.last.at) }}</span>
            <div class="mt-1 text-body-2">{{ status.last.ok ? counts(status.last) : status.last.error }}</div>
          </div>
          <div v-else class="text-medium-emphasis mb-2">No sync has run yet.</div>
          <v-alert v-if="status.pending" type="warning" variant="tonal" density="compact" class="mb-2">
            {{ status.pending }} change{{ status.pending > 1 ? 's' : '' }} waiting to be written to the sheet.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-sync" :loading="syncing" @click="syncNow">Sync now</v-btn>
          <v-btn variant="text" @click="refresh">Refresh</v-btn>
        </v-card-actions>
        <v-expansion-panels v-if="status?.log.length" variant="accordion">
          <v-expansion-panel title="Recent log">
            <v-expansion-panel-text>
              <div v-for="(l, i) in status.log" :key="i" class="text-caption mb-1">
                <span class="text-medium-emphasis">{{ fmt(l.at) }}</span>
                <v-chip :color="l.level === 'error' ? 'error' : l.level === 'warn' ? 'warning' : undefined" size="x-small" class="mx-1">{{ l.level }}</v-chip>
                {{ l.message }}
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card>

      <div class="text-caption text-medium-emphasis text-center mt-6">
        Server: {{ serverHost }}
      </div>
    </div>
  </div>
</template>
