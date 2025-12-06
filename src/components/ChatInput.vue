<script setup>
import { ref } from 'vue';

const props = defineProps({
  prompt: { type: String, default: '' },
  images: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:prompt', 'add-images', 'remove-image', 'send']);

const fileInput = ref(null);

const onPromptInput = (event) => emit('update:prompt', event.target.value);

const onFileChange = (event) => {
  emit('add-images', event.target.files);
  event.target.value = '';
};

const removeImage = (dataUrl) => emit('remove-image', dataUrl);

const onSend = () => emit('send');
</script>

<template>
  <div class="chat-input-container">
    <div class="chat-input-wrapper">
      <div class="input-controls">
        <input
          ref="fileInput"
          type="file"
          id="imageUpload"
          accept="image/*"
          multiple
          style="display: none;"
          @change="onFileChange"
        />
        <button class="btn secondary" id="imageUploadBtn" title="Upload images" @click="fileInput?.click()" :disabled="disabled">📷</button>
        <textarea
          :value="prompt"
          placeholder="Type your message here..."
          rows="1"
          :disabled="disabled"
          @keydown.enter.exact.prevent="onSend"          @input="onPromptInput"
        ></textarea>
      </div>
      <button class="btn" :disabled="disabled" @click="onSend">Send</button>
    </div>
    <div id="imagePreview" class="image-preview">
      <div v-for="img in images" :key="img.data" class="image-preview-item">
        <div v-for="(img, index) in images" :key="index" class="image-preview-item">
          <button class="remove-btn" @click="removeImage(img.data)">×</button>
        </div>
      </div>
    </div>
  </div>
</template>
