import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'items', component: () => import('./views/ItemsView.vue') },
    { path: '/items/new', name: 'item-new', component: () => import('./views/ItemFormView.vue') },
    { path: '/items/:id', name: 'item-edit', component: () => import('./views/ItemFormView.vue'), props: true },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});
