<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import PxIcon from './components/PxIcon.vue';
import { requestItemsReset } from './signals';
import { toast } from './toast';

const route = useRoute();
function onItemsTab() {
  if (route.name === 'items') requestItemsReset();
}
const tab = computed(() => (route.name === 'settings' ? 'settings' : route.name === 'item-new' ? 'add' : 'items'));
const toastOpen = computed({
  get: () => toast.value !== null,
  set: (v: boolean) => {
    if (!v) toast.value = null;
  },
});
const toastIcon = computed(() =>
  toast.value?.color === 'error'
    ? 'emoji:bunny-cross'
    : toast.value?.color === 'warning'
      ? 'emoji:bunny-exclaim'
      : 'emoji:bunny-check',
);
</script>

<template>
  <v-app>
    <v-main>
      <router-view v-slot="{ Component }">
        <keep-alive include="ItemsView">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </v-main>

    <v-bottom-navigation :model-value="tab" grow class="px-nav">
      <v-btn value="items" :to="{ name: 'items' }" @click="onItemsTab">
        <PxIcon name="house" :size="24" />
        <span>Items</span>
      </v-btn>
      <v-btn value="add" :to="{ name: 'item-new' }">
        <PxIcon name="plus" :size="24" />
        <span>Add</span>
      </v-btn>
      <v-btn value="settings" :to="{ name: 'settings' }">
        <PxIcon name="gear" :size="24" />
        <span>Settings</span>
      </v-btn>
    </v-bottom-navigation>

    <v-snackbar v-model="toastOpen" :timeout="2500" location="top" content-class="px-panel">
      <div class="d-flex align-center ga-2">
        <PxIcon :name="toastIcon" :size="36" />
        <span>{{ toast?.text }}</span>
      </div>
    </v-snackbar>
  </v-app>
</template>

<style scoped>
.px-nav {
  padding-bottom: env(safe-area-inset-bottom);
}
.px-nav .v-btn__content span {
  margin-top: 4px;
}
</style>
