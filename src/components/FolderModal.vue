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
            class="form-input"
          >
        </div>
        <div class="button-group">
          <button type="button" class="btn-cancel" @click="$emit('close')">取消</button>
          <button type="submit" class="btn-create">创建文件夹</button>
        </div>
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
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.close {
  position: absolute;
  top: 15px;
  right: 20px;
  font-size: 24px;
  cursor: pointer;
  color: #888;
  transition: color 0.2s;
}

.close:hover {
  color: #333;
}

h3 {
  margin-bottom: 20px;
  color: #333;
  font-size: 20px;
  font-weight: 500;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #555;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 12px 15px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 25px;
}

.btn-cancel,
.btn-create {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  min-width: 80px;
}

.btn-cancel {
  background-color: #f1f2f5;
  color: #666;
  border: 1px solid #ddd;
}

.btn-cancel:hover {
  background-color: #e9eaee;
  color: #333;
}

.btn-create {
  background-color: #667eea;
  color: white;
}

.btn-create:hover {
  background-color: #5a6bd0;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}

.btn-create:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
}
</style>
