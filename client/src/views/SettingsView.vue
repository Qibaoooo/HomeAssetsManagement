<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import PxIcon from '../components/PxIcon.vue';
import PxSprite from '../components/PxSprite.vue';
import { useItems } from '../stores/items';
import { useSettings } from '../stores/settings';
import { notify } from '../toast';
import type { BackupStatus, SyncStatus } from '../types';

const settings = useSettings();
const store = useItems();
const status = ref<SyncStatus | null>(null);
const syncing = ref(false);
const backup = ref<BackupStatus | null>(null);
const backingUp = ref(false);

async function refresh() {
  try {
    [status.value, backup.value] = await Promise.all([api.syncStatus(), api.backupStatus()]);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Cannot reach server', 'error');
  }
}
onMounted(refresh);

async function backupNow() {
  backingUp.value = true;
  try {
    const { result } = await api.backup();
    notify(
      !result.ok ? `Backup failed: ${result.error}` : result.unchanged ? 'Nothing changed since the last backup' : 'Backed up to Google Drive',
      result.ok ? 'success' : 'error',
    );
    await refresh();
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Backup failed', 'error');
  } finally {
    backingUp.value = false;
  }
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

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
        <PxIcon name="gear" :size="32" class="ml-2" />
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
          <div class="d-flex align-center ga-3 mb-2">
            <PxSprite v-if="syncing" name="bunny-happy" :size="56" :fps="8" />
            <PxSprite v-else-if="!status.last" name="bunny-sleep" :size="56" :fps="2" />
            <PxIcon v-else :name="status.last.ok ? 'emoji:bunny-check' : 'emoji:bunny-cross'" :size="48" />
            <div>
              <template v-if="status.last">
                <span class="px-font">{{ status.last.ok ? 'OK' : 'Failed' }}</span>
                <span class="text-medium-emphasis ml-2">{{ fmt(status.last.at) }}</span>
                <div class="text-body-2">{{ status.last.ok ? counts(status.last) : status.last.error }}</div>
              </template>
              <span v-else class="text-medium-emphasis">No sync has run yet.</span>
            </div>
          </div>
          <v-alert v-if="status.pending" class="px-alert mb-2" density="compact">
            {{ status.pending }} change{{ status.pending > 1 ? 's' : '' }} waiting to be written to the sheet.
          </v-alert>
        </v-card-text>
        <v-card-actions class="px-3 pb-3 ga-2">
          <v-btn class="px-btn" :loading="syncing" @click="syncNow">
            <v-icon start>mdi-sync</v-icon>Sync now
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

      <v-card class="px-panel mt-4" title="Google Drive backup">
        <v-card-text v-if="backup">
          <template v-if="backup.state === 'ready'">
            <div class="d-flex align-center ga-3 mb-2">
              <PxSprite v-if="backingUp" name="bunny-happy" :size="56" :fps="8" />
              <PxSprite v-else-if="!backup.last" name="bunny-sleep" :size="56" :fps="2" />
              <PxIcon v-else :name="backup.last.ok ? 'emoji:bunny-check' : 'emoji:bunny-cross'" :size="48" />
              <div>
                <template v-if="backup.last">
                  <span class="px-font">{{ backup.last.ok ? 'OK' : 'Failed' }}</span>
                  <span class="text-medium-emphasis ml-2">{{ fmt(backup.last.at) }}</span>
                  <div class="text-body-2">
                    <template v-if="!backup.last.ok">{{ backup.last.error }}</template>
                    <template v-else-if="backup.last.unchanged">nothing changed</template>
                    <template v-else>database {{ kb(backup.last.sqliteBytes) }}, {{ backup.last.photosUploaded }} new photo{{ backup.last.photosUploaded === 1 ? '' : 's' }} of {{ backup.last.photosTotal }}</template>
                  </div>
                </template>
                <span v-else class="text-medium-emphasis">No backup has run yet.</span>
              </div>
            </div>
            <div class="text-caption text-medium-emphasis">
              Every {{ backup.intervalHours === 1 ? 'hour' : `${backup.intervalHours} hours` }} and a few minutes after each edit, into the Drive folder “{{ backup.folder }}”.
            </div>
          </template>
          <template v-else>
            <div class="d-flex align-center ga-3">
              <PxIcon name="emoji:bunny-question" :size="48" />
              <div class="text-body-2">
                <template v-if="backup.state === 'no-client'">Not set up. Add <code>secrets/oauth-client.json</code> on the server, then run <code>npm run drive-auth</code>.</template>
                <template v-else>Not authorised yet. Run <code>npm run drive-auth</code> on the server and sign in once.</template>
                See docs/BACKUP.md.
              </div>
            </div>
          </template>
        </v-card-text>
        <v-card-actions v-if="backup?.state === 'ready'" class="px-3 pb-3 ga-2">
          <v-btn class="px-btn" :loading="backingUp" @click="backupNow">
            <v-icon start>mdi-cloud-upload-outline</v-icon>Back up now
          </v-btn>
        </v-card-actions>
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
