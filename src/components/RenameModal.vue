<template>
  <div class="modal">
    <div class="modal-content">
      <span class="close" @click="$emit('close')">&times;</span>
      <h3>重命名{{ file?.type === 'folder' ? '文件夹' : '文件' }}</h3>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="newName">新名称:</label>
          <input 
            type="text" 
            id="newName" 
            v-model="newName" 
            required
            ref="newNameInput"
          >
        </div>
        <button type="submit">确定</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits, watch, onMounted } from 'vue'

const props = defineProps({
  file: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'rename'])

const newName = ref('')
const newNameInput = ref<HTMLInputElement | null>(null)

// 组件挂载时，设置默认名称并聚焦
onMounted(() => {
  if (props.file) {
    newName.value = props.file.name
    setTimeout(() => {
      if (newNameInput.value) {
        newNameInput.value.focus()
        
        // 如果是文件，选中文件名但不包括扩展名
        if (props.file.type !== 'folder' && props.file.name.includes('.')) {
          const dotIndex = props.file.name.lastIndexOf('.')
          newNameInput.value.setSelectionRange(0, dotIndex)
        } else {
          newNameInput.value.select()
        }
      }
    }, 100)
  }
})

// 当文件更改时，更新名称
watch(() => props.file, (newFile) => {
  if (newFile) {
    newName.value = newFile.name
  }
})

// 处理表单提交
const handleSubmit = () => {
  if (newName.value.trim() === props.file.name) {
    // 名称没有更改，直接关闭
    emit('close')
    return
  }

  if (newName.value.trim()) {
    // 如果是文件，确保保留原始扩展名
    if (props.file.type !== 'folder' && props.file.name.includes('.')) {
      const originalExt = props.file.name.substring(props.file.name.lastIndexOf('.'))
      
      // 如果新名称没有包含扩展名，添加原始扩展名
      if (!newName.value.includes('.')) {
        newName.value += originalExt
      } else {
        // 如果新名称已包含扩展名，确保它是相同的
        const newExt = newName.value.substring(newName.value.lastIndexOf('.'))
        if (newExt.toLowerCase() !== originalExt.toLowerCase()) {
          newName.value = newName.value.substring(0, newName.value.lastIndexOf('.')) + originalExt
        }
      }
    }
    
    emit('rename', newName.value.trim())
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
