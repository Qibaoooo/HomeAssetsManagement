<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from './toast';

const route = useRoute();
const toastOpen = computed({
  get: () => toast.value !== null,
  set: (v: boolean) => {
    if (!v) toast.value = null;
  },
});
const tab = computed(() => (route.name === 'settings' ? 'settings' : route.name === 'item-new' ? 'add' : 'items'));
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

    <v-bottom-navigation :model-value="tab" grow color="primary" class="nav">
      <v-btn value="items" :to="{ name: 'items' }">
        <v-icon>mdi-view-list</v-icon>
        <span>Items</span>
      </v-btn>
      <v-btn value="add" :to="{ name: 'item-new' }">
        <v-icon>mdi-plus-circle</v-icon>
        <span>Add</span>
      </v-btn>
      <v-btn value="settings" :to="{ name: 'settings' }">
        <v-icon>mdi-cog</v-icon>
        <span>Settings</span>
      </v-btn>
    </v-bottom-navigation>

    <v-snackbar v-model="toastOpen" :color="toast?.color" :timeout="2500" location="top">
      {{ toast?.text }}
    </v-snackbar>
  </v-app>
</template>

<style scoped>
.nav {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
