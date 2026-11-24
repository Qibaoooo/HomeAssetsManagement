<script setup lang="ts">
/**
 * Full-screen single-field editor for phones.
 *
 * The form page shows rows (label + value) that cannot summon a keyboard. Tapping a row opens
 * this editor: the input sits at the very top, the suggestions fill the space above the
 * keyboard, and Next moves to the following field without dismissing the keyboard. On wide
 * screens it becomes a centred card.
 *
 * The overlay follows the visual viewport (window.visualViewport), so on iOS, where the
 * keyboard does not shrink the layout viewport, the editor still fits above the keyboard.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

export type FieldKind = 'text' | 'number' | 'decimal' | 'date' | 'multiline' | 'tags';
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  /** capitalise words on the virtual keyboard */
  words?: boolean;
  prefix?: string;
  hint?: string;
}
export type FieldValue = string | number | null | string[];

const props = defineProps<{
  open: boolean;
  field: FieldDef | null;
  modelValue: FieldValue;
  suggestions: string[];
  hasNext: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: FieldValue];
  next: [];
  done: [];
}>();

const inputEl = ref<HTMLInputElement | HTMLTextAreaElement>();
const tagDraft = ref('');

// ---- value helpers ----------------------------------------------------------
const text = computed({
  get: () => (props.modelValue == null ? '' : String(props.modelValue)),
  set: (v: string) => emit('update:modelValue', v),
});
const num = computed({
  get: () => (typeof props.modelValue === 'number' ? props.modelValue : null),
  set: (v: number | null) => emit('update:modelValue', v),
});
const tags = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

function onNumberInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  if (raw === '') {
    num.value = null;
    return;
  }
  const n = Number(raw);
  if (!Number.isNaN(n)) num.value = n;
}
function stepNumber(delta: number) {
  num.value = Math.max(0, (num.value ?? 0) + delta);
  keepFocus();
}
function clearValue() {
  if (props.field?.kind === 'number' || props.field?.kind === 'decimal') num.value = null;
  else text.value = '';
  keepFocus();
}

// ---- tags -----------------------------------------------------------------
const hasTag = (t: string) => tags.value.some((x) => x.toLowerCase() === t.toLowerCase());
function addTag(t: string) {
  const v = t.trim();
  if (!v || hasTag(v)) return;
  emit('update:modelValue', [...tags.value, v]);
}
function removeTag(t: string) {
  emit(
    'update:modelValue',
    tags.value.filter((x) => x !== t),
  );
  keepFocus();
}
function commitTagDraft() {
  if (tagDraft.value.trim()) addTag(tagDraft.value);
  tagDraft.value = '';
}
function onTagKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    if (tagDraft.value.trim()) commitTagDraft();
    else advance();
  } else if (e.key === 'Backspace' && !tagDraft.value && tags.value.length) {
    emit('update:modelValue', tags.value.slice(0, -1));
  }
}

// ---- suggestions ------------------------------------------------------------
const query = computed(() => (props.field?.kind === 'tags' ? tagDraft.value : text.value).trim().toLowerCase());
const filtered = computed(() => {
  const q = query.value;
  const list = props.suggestions;
  if (!q) return list;
  const starts = list.filter((s) => s.toLowerCase().startsWith(q));
  const inside = list.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q));
  return [...starts, ...inside];
});
const exactMatch = computed(() => !!query.value && props.suggestions.some((s) => s.toLowerCase() === query.value));

function pick(s: string) {
  if (props.field?.kind === 'tags') {
    if (hasTag(s)) removeTag(s);
    else addTag(s);
    tagDraft.value = '';
    keepFocus();
    return;
  }
  text.value = s;
  advance();
}

// ---- navigation -------------------------------------------------------------
function advance() {
  if (props.field?.kind === 'tags') commitTagDraft();
  if (props.hasNext) emit('next');
  else emit('done');
}
function finish() {
  if (props.field?.kind === 'tags') commitTagDraft();
  emit('done');
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    finish();
  } else if (e.key === 'Enter' && props.field?.kind !== 'multiline') {
    e.preventDefault();
    advance();
  }
}

// ---- focus + viewport ---------------------------------------------------------
function keepFocus() {
  inputEl.value?.focus({ preventScroll: true });
}
watch(
  () => [props.open, props.field?.key] as const,
  async ([open]) => {
    if (!open) return;
    tagDraft.value = '';
    await nextTick();
    keepFocus();
  },
  { flush: 'post' },
);

const box = ref<Record<string, string>>({});
function fit() {
  const vv = window.visualViewport;
  if (!vv || window.innerWidth >= 600) {
    box.value = {};
    return;
  }
  box.value = { top: `${vv.offsetTop}px`, height: `${vv.height}px` };
}
function attach(on: boolean) {
  const vv = window.visualViewport;
  const fn = on ? 'addEventListener' : 'removeEventListener';
  vv?.[fn]('resize', fit);
  vv?.[fn]('scroll', fit);
  window[fn]('resize', fit);
  document.documentElement.classList.toggle('fe-open', on);
  if (on) fit();
}
watch(
  () => props.open,
  (open) => attach(open),
  { immediate: true },
);
onBeforeUnmount(() => attach(false));

const inputMode = computed(() => {
  switch (props.field?.kind) {
    case 'number':
      return 'numeric';
    case 'decimal':
      return 'decimal';
    default:
      return 'text';
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fe">
      <div v-if="open && field" class="fe" :style="box" role="dialog" aria-modal="true" :aria-label="field.label" @click.self="finish">
        <div class="fe__card">
          <div class="fe__bar">
            <button type="button" class="fe__nav" aria-label="Close" @click="finish">
              <v-icon size="26">mdi-close</v-icon>
            </button>
            <div class="fe__title px-font">{{ field.label }}</div>
            <button type="button" class="fe__nav fe__nav--text" @click="advance">
              {{ hasNext ? 'Next' : 'Done' }}
              <v-icon size="22">{{ hasNext ? 'mdi-chevron-right' : 'mdi-check' }}</v-icon>
            </button>
          </div>

          <!-- input row -->
          <div class="fe__input">
            <template v-if="field.kind === 'tags'">
              <div class="fe__chips">
                <button v-for="t in tags" :key="t" type="button" class="fe__chip" :aria-label="`Remove tag ${t}`" @click="removeTag(t)">
                  #{{ t }}<v-icon size="16" class="ml-1">mdi-close</v-icon>
                </button>
                <input
                  ref="inputEl"
                  v-model="tagDraft"
                  class="fe__field fe__field--tag"
                  type="text"
                  enterkeyhint="next"
                  autocomplete="off"
                  autocorrect="off"
                  placeholder="Add a tag"
                  @keydown="onTagKey"
                />
              </div>
            </template>

            <template v-else-if="field.kind === 'multiline'">
              <textarea
                ref="inputEl"
                v-model="text"
                class="fe__field fe__field--area"
                rows="3"
                enterkeyhint="done"
                @keydown="onKey"
              />
            </template>

            <template v-else-if="field.kind === 'number' || field.kind === 'decimal'">
              <button v-if="field.kind === 'number'" type="button" class="fe__step" aria-label="Decrease" @click="stepNumber(-1)">
                <v-icon size="22">mdi-minus</v-icon>
              </button>
              <span v-if="field.prefix" class="fe__prefix">{{ field.prefix }}</span>
              <input
                ref="inputEl"
                class="fe__field fe__field--num"
                type="number"
                :inputmode="inputMode"
                :step="field.kind === 'decimal' ? '0.01' : '1'"
                min="0"
                enterkeyhint="next"
                :value="num ?? ''"
                @input="onNumberInput"
                @keydown="onKey"
              />
              <button v-if="field.kind === 'number'" type="button" class="fe__step" aria-label="Increase" @click="stepNumber(1)">
                <v-icon size="22">mdi-plus</v-icon>
              </button>
              <button v-else-if="num != null" type="button" class="fe__clear" aria-label="Clear" @click="clearValue">
                <v-icon size="20">mdi-close-circle</v-icon>
              </button>
            </template>

            <template v-else>
              <input
                ref="inputEl"
                v-model="text"
                class="fe__field"
                :type="field.kind === 'date' ? 'date' : 'text'"
                inputmode="text"
                :autocapitalize="field.words ? 'words' : 'sentences'"
                autocomplete="off"
                autocorrect="off"
                :enterkeyhint="hasNext ? 'next' : 'done'"
                :placeholder="field.kind === 'date' ? '' : `Type ${field.label.toLowerCase()}`"
                @keydown="onKey"
              />
              <button v-if="text" type="button" class="fe__clear" aria-label="Clear" @click="clearValue">
                <v-icon size="20">mdi-close-circle</v-icon>
              </button>
            </template>
          </div>
          <div v-if="field.hint" class="fe__hint">{{ field.hint }}</div>

          <!-- suggestions: the half of the screen the keyboard leaves free -->
          <div class="fe__list">
            <template v-if="suggestions.length">
              <button
                v-for="s in filtered"
                :key="s"
                type="button"
                class="fe__opt"
                :class="{ 'fe__opt--on': field.kind === 'tags' ? hasTag(s) : text.toLowerCase() === s.toLowerCase() }"
                @click="pick(s)"
              >
                <span>{{ field.kind === 'tags' ? '#' : '' }}{{ s }}</span>
                <v-icon v-if="field.kind === 'tags' && hasTag(s)" size="18">mdi-check</v-icon>
              </button>
              <div v-if="query && !exactMatch" class="fe__new">
                <v-icon size="18" start>mdi-plus-circle-outline</v-icon>
                <span v-if="filtered.length">Not in the list yet. Tap <strong>{{ hasNext ? 'Next' : 'Done' }}</strong> to use what you typed.</span>
                <span v-else>No match. Tap <strong>{{ hasNext ? 'Next' : 'Done' }}</strong> to add a new one.</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
/* body scroll lock while the editor is open (global on purpose) */
html.fe-open,
html.fe-open body {
  overflow: hidden;
}
</style>

<style scoped>
.fe {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(107, 75, 91, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: calc(48px + env(safe-area-inset-top)) 12px 12px;
}
.fe__card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 100%;
  min-height: 0;
  background: var(--sp-cream);
  border: 1px solid var(--sp-tan);
  border-radius: var(--sp-radius);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(107, 75, 91, 0.3);
}
@media (min-width: 600px) {
  .fe {
    padding-top: 8vh;
  }
  .fe__card {
    max-height: 80vh;
  }
}

.fe__bar {
  display: flex;
  align-items: center;
  background: var(--sp-sand);
  border-bottom: 1px solid var(--sp-tan);
  min-height: 52px;
}
.fe__title {
  flex: 1;
  text-align: center;
  font-size: 22px;
  color: var(--sp-plum);
}
.fe__nav {
  min-width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sp-plum);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 10px;
  font: inherit;
  font-weight: 600;
  font-size: 16px;
}
.fe__nav--text {
  gap: 2px;
}

.fe__input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 12px 0;
  padding: 4px 8px 4px 14px;
  background: var(--sp-paper);
  border: 2px solid var(--sp-brown);
  border-radius: 12px;
  min-height: 56px;
}
.fe__field {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 20px;
  color: var(--sp-ink);
  padding: 10px 0;
}
.fe__field::placeholder {
  color: var(--sp-muted);
  opacity: 0.7;
}
.fe__field--area {
  resize: none;
  line-height: 1.4;
}
.fe__field--num {
  text-align: center;
  font-weight: 600;
  -moz-appearance: textfield;
  appearance: textfield;
}
.fe__field--num::-webkit-outer-spin-button,
.fe__field--num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.fe__prefix {
  font-size: 20px;
  color: var(--sp-muted);
}
.fe__step {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sp-sand);
  color: var(--sp-plum);
  border: 1px solid var(--sp-tan-dark);
  border-radius: 8px;
  cursor: pointer;
  padding: 0;
}
.fe__step:active {
  background: var(--sp-tan);
}
.fe__clear {
  background: none;
  border: none;
  color: var(--sp-muted);
  cursor: pointer;
  padding: 8px;
  display: flex;
}
.fe__chips {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
}
.fe__chip {
  display: inline-flex;
  align-items: center;
  background: var(--sp-green);
  color: var(--sp-plum);
  border: 1px solid var(--sp-green-dark);
  border-radius: 999px;
  padding: 4px 8px 4px 12px;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.fe__field--tag {
  flex: 1 1 120px;
  font-size: 18px;
  padding: 6px 0;
}
.fe__hint {
  margin: 6px 16px 0;
  font-size: 13px;
  color: var(--sp-muted);
}

.fe__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  margin: 10px 12px 0;
  padding-bottom: 12px;
}
.fe__opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  text-align: left;
  background: var(--sp-paper);
  color: var(--sp-ink);
  border: 1px solid var(--sp-tan);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 6px;
  font: inherit;
  font-size: 17px;
  cursor: pointer;
}
.fe__opt:active {
  background: var(--sp-sand);
}
.fe__opt--on {
  background: var(--sp-green);
  border-color: var(--sp-green-dark);
  color: var(--sp-plum);
  font-weight: 600;
}
.fe__new {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  font-size: 14px;
  color: var(--sp-brown-dark);
}

.fe-enter-active,
.fe-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fe-enter-from,
.fe-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
