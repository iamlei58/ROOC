<script setup>
defineProps({
  imageUrl: {
    type: String,
    default: "https://file.joymaker.com/game/rooc/web/assets/zh-TW_logo-CNKqky8L.png"
  },
  message: {
    type: String,
    required: true
  }
});
</script>

<template>
  <img :src="imageUrl" alt="">
  <p>{{ message }}</p>
</template>
