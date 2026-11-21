<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
const describeRun = (r: { sqlite_bytes: number; photos_uploaded: number; photos_total: number }) =>
  [r.sqlite_bytes ? `database ${kb(r.sqlite_bytes)}` : '', r.photos_uploaded ? `${r.photos_uploaded} photo${r.photos_uploaded === 1 ? '' : 's'}` : '']
    .filter(Boolean)
    .join(', ') || 'nothing uploaded';
const reasonLabel: Record<string, string> = { manual: 'manual', cli: 'manual', scheduled: 'hourly', startup: 'on start', 'after-edit': 'after edit' };

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

// ---- categories ------------------------------------------------------------
type CategoryRow = { category: string; active: number; retired: number };
const categories = ref<CategoryRow[]>([]);
const renaming = ref<CategoryRow | null>(null);
const newName = ref('');
const renameBusy = ref(false);

async function loadCategories() {
  try {
    categories.value = await api.categories();
  } catch {
    /* shown empty */
  }
}
onMounted(loadCategories);

function startRename(row: CategoryRow) {
  renaming.value = row;
  newName.value = row.category;
}
const mergeTarget = computed(() => {
  const t = newName.value.trim();
  return renaming.value && t && t !== renaming.value.category ? categories.value.find((c) => c.category === t) : undefined;
});
const renameValid = computed(() => {
  const t = newName.value.trim();
  return !!renaming.value && !!t && t !== renaming.value.category && t.length <= 200;
});
async function confirmRename() {
  if (!renaming.value || !renameValid.value) return;
  renameBusy.value = true;
  try {
    const r = await api.renameCategory(renaming.value.category, newName.value.trim(), settings.displayName || 'unknown');
    notify(
      `${r.changed} item${r.changed === 1 ? '' : 's'} moved to “${newName.value.trim()}”` + (r.synced ? '' : '. Sheet sync pending.'),
      r.synced ? 'success' : 'warning',
    );
    renaming.value = null;
    await Promise.all([loadCategories(), store.load(true)]);
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Rename failed', 'error');
  } finally {
    renameBusy.value = false;
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

      <v-card class="px-panel mb-4" title="Categories">
        <v-card-text class="pt-0">
          <div class="text-caption text-medium-emphasis mb-2">
            Renaming moves every item in the category, in the app and the sheet. Renaming to an existing name merges them.
          </div>
          <v-list density="compact" bg-color="transparent" class="px-list py-0">
            <v-list-item v-for="c in categories" :key="c.category" class="px-0">
              <v-list-item-title>{{ c.category }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ c.active }} active<template v-if="c.retired"> · {{ c.retired }} retired</template>
              </v-list-item-subtitle>
              <template #append>
                <v-btn icon="mdi-pencil-outline" variant="text" size="small" :aria-label="`Rename ${c.category}`" @click="startRename(c)" />
              </template>
            </v-list-item>
          </v-list>
          <div v-if="!categories.length" class="text-medium-emphasis">No categories yet.</div>
        </v-card-text>
      </v-card>

      <v-dialog :model-value="!!renaming" max-width="400" @update:model-value="(v) => !v && (renaming = null)">
        <v-card v-if="renaming" class="px-panel" :title="`Rename “${renaming.category}”`">
          <v-card-text>
            <v-text-field v-model="newName" label="New name" autofocus hide-details="auto" :counter="200" @keyup.enter="confirmRename" />
            <v-alert v-if="mergeTarget" class="px-alert mt-3" density="compact">
              “{{ mergeTarget.category }}” already exists. The {{ renaming.active + renaming.retired }} item{{ renaming.active + renaming.retired === 1 ? '' : 's' }}
              will be merged into it.
            </v-alert>
            <div class="text-caption text-medium-emphasis mt-2">
              Affects {{ renaming.active + renaming.retired }} item{{ renaming.active + renaming.retired === 1 ? '' : 's' }}.
            </div>
          </v-card-text>
          <v-card-actions class="ga-2 px-3 pb-3">
            <v-spacer />
            <v-btn class="px-btn px-btn--cream" @click="renaming = null">Cancel</v-btn>
            <v-btn class="px-btn px-btn--primary" :disabled="!renameValid" :loading="renameBusy" @click="confirmRename">
              {{ mergeTarget ? 'Merge' : 'Rename' }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

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
                <template v-if="backup.history[0]">
                  <span class="px-font">Last backup</span>
                  <span class="text-medium-emphasis ml-2">{{ fmt(backup.history[0].at) }}</span>
                  <div class="text-body-2">
                    <template v-if="backup.history[0].ok">{{ describeRun(backup.history[0]) }}</template>
                    <template v-else>failed: {{ backup.history[0].error }}</template>
                  </div>
                </template>
                <span v-else class="text-medium-emphasis">No backup has run yet.</span>
                <div v-if="backup.last && backup.last.unchanged" class="text-caption text-medium-emphasis">
                  Last check {{ fmt(backup.last.at) }}, nothing changed
                </div>
                <div v-else-if="backup.last && !backup.last.ok" class="text-caption text-error">
                  Last attempt {{ fmt(backup.last.at) }} failed: {{ backup.last.error }}
                </div>
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
                <template v-if="backup.state === 'off'">Backups are switched off on this server instance.</template>
                <template v-else-if="backup.state === 'no-client'">Not set up. Add <code>secrets/oauth-client.json</code> on the server, then run <code>npm run drive-auth</code>.</template>
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
        <v-expansion-panels v-if="backup?.history.length" variant="accordion" flat>
          <v-expansion-panel title="Backup history">
            <v-expansion-panel-text>
              <div v-for="(h, i) in backup.history" :key="i" class="d-flex align-start ga-2 text-caption mb-2">
                <PxIcon :name="h.ok ? 'check' : 'cross'" :size="16" class="mt-1" />
                <div>
                  <span>{{ fmt(h.at) }}</span>
                  <span class="text-medium-emphasis"> · {{ reasonLabel[h.reason] ?? h.reason }}</span>
                  <div>{{ h.ok ? describeRun(h) : `failed: ${h.error}` }}</div>
                </div>
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
