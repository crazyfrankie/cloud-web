<template>
  <div v-if="visible" class="modal">
    <div class="modal-content">
      <span class="close" @click="$emit('close')">&times;</span>
      <h3>新建文件夹</h3>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="folderName">文件夹名称:</label>
          <input 
            type="text" 
            id="folderName" 
            v-model="folderName" 
            required
            ref="folderNameInput"
          >
        </div>
        <button type="submit">创建</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits, watch } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  }
})

const emit = defineEmits(['close', 'create'])

const folderName = ref('')
const folderNameInput = ref<HTMLInputElement | null>(null)

// 当模态框显示时，清空输入并聚焦
watch(() => props.visible, (newValue) => {
  if (newValue) {
    folderName.value = ''
    // 使用 nextTick 确保 DOM 已更新
    setTimeout(() => {
      if (folderNameInput.value) {
        folderNameInput.value.focus()
      }
    }, 100)
  }
})

// 处理表单提交
const handleSubmit = () => {
  if (folderName.value.trim()) {
    emit('create', folderName.value.trim())
  }
}
</script>

<style scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 30px;
  border-radius: 10px;
  width: 400px;
  max-width: 90%;
  position: relative;
}

.close {
  position: absolute;
  top: 15px;
  right: 20px;
  font-size: 24px;
  cursor: pointer;
  color: #888;
}

.close:hover {
  color: #333;
}

h3 {
  margin-bottom: 20px;
  color: #333;
}

button {
  margin-top: 10px;
}
</style>
