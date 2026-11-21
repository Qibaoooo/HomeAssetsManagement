import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import './style.css';
import App from './App.vue';
import { router } from './router';

const vuetify = createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: { colors: { primary: '#5c6bc0', secondary: '#26a69a' } },
      dark: { colors: { primary: '#7986cb', secondary: '#4db6ac' } },
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
