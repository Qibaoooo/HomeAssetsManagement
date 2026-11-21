import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import './style.css';
import './sprout.css';
import App from './App.vue';
import { router } from './router';

const vuetify = createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'sprout',
    themes: {
      sprout: {
        dark: false,
        colors: {
          background: '#f3e5c2',
          surface: '#f3e5c2',
          'surface-variant': '#e8cfa6',
          'on-surface': '#474a4b',
          'on-background': '#474a4b',
          primary: '#aa7959',
          'on-primary': '#fbfbf6',
          secondary: '#c0d470',
          'on-secondary': '#6b4b5b',
          success: '#7f9a3c',
          warning: '#c49a6c',
          error: '#9e4450',
          info: '#6f6059',
        },
      },
    },
  },
  defaults: {
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VCombobox: { variant: 'outlined', density: 'comfortable' },
    VTextarea: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
  },
});

createApp(App).use(createPinia()).use(router).use(vuetify).mount('#app');
