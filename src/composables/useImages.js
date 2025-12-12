import { ref } from 'vue';

export function useImages() {
  const uploadedImages = ref([]);

  const handleFiles = (files) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        uploadedImages.value.push({
          data: e.target.result,
          name: file.name,
          type: file.type
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (dataUrl) => {
    uploadedImages.value = uploadedImages.value.filter(img => img.data !== dataUrl);
  };

  const clearImages = () => {
    uploadedImages.value = [];
  };

  return {
    uploadedImages,
    handleFiles,
    removeImage,
    clearImages
  };
}

