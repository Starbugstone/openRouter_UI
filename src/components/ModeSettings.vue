<script setup>
const props = defineProps({
  mode: { type: String, default: 'text' },
  stream: { type: Boolean, default: true },
  timeoutSec: { type: Number, default: 30 },
  imgCount: { type: Number, default: 1 }
});

const emit = defineEmits([
  'update:mode',
  'update:stream',
  'update:timeoutSec',
  'update:imgCount'
]);

const onModeChange = (event) => emit('update:mode', event.target.value);
const onStreamChange = (event) => emit('update:stream', event.target.checked);
const onTimeoutChange = (event) => emit('update:timeoutSec', Number(event.target.value));
const onImgCountChange = (event) => emit('update:imgCount', Number(event.target.value));
</script>

<template>
  <div class="row">
    <div>
      <label>Mode</label>
      <select :value="mode" @change="onModeChange">
        <option value="text">Text (Chat Completions)</option>
        <option value="image">Image Generation (via Chat + modalities)</option>
      </select>
    </div>
    <div v-if="mode === 'image'" style="display:flex; flex-direction:column; min-width: 140px;">
      <label>Number of images (best-effort)</label>
      <input :value="imgCount" type="number" min="1" max="9" style="width: 3ch;" @input="onImgCountChange" />
    </div>
  </div>

  <div class="actions" style="margin-top:12px">
    <label class="pill">
      <input type="checkbox" :checked="stream" @change="onStreamChange" />
      Stream
    </label>
    <label class="pill">
      Timeout (s):
      <input :value="timeoutSec" type="number" min="5" max="120" style="width:64px;background:transparent;border:none;color:#e8eaed" @input="onTimeoutChange"/>
    </label>
  </div>
</template>


