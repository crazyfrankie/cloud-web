<template>
  <transition-group name="toast" tag="div" class="toast-container">
    <div
      v-for="notification in notifications"
      :key="notification.id"
      :class="['toast', `toast-${notification.type}`]"
    >
      <div class="toast-content">
        <div class="toast-icon">
          <svg v-if="notification.type === 'success'" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <svg v-else-if="notification.type === 'error'" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          </svg>
          <svg v-else-if="notification.type === 'warning'" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <svg v-else viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="toast-message">
          {{ notification.message }}
        </div>
      </div>
      <button
        @click="removeNotification(notification.id)"
        class="toast-close"
      >
        ×
      </button>
    </div>
  </transition-group>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

const notifications = ref<Notification[]>([])

let notificationId = 0

const addNotification = (type: Notification['type'], message: string, duration = 4000) => {
  const id = String(++notificationId)
  const notification: Notification = {
    id,
    type,
    message
  }
  
  notifications.value.push(notification)
  
  // 自动移除通知
  if (duration > 0) {
    setTimeout(() => {
      removeNotification(id)
    }, duration)
  }
}

const removeNotification = (id: string) => {
  const index = notifications.value.findIndex(n => n.id === id)
  if (index > -1) {
    notifications.value.splice(index, 1)
  }
}

// 导出方法供外部调用
defineExpose({
  success: (message: string, duration?: number) => addNotification('success', message, duration),
  error: (message: string, duration?: number) => addNotification('error', message, duration),
  warning: (message: string, duration?: number) => addNotification('warning', message, duration),
  info: (message: string, duration?: number) => addNotification('info', message, duration)
})
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  pointer-events: none;
}

.toast {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  margin-bottom: 10px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  max-width: 400px;
  min-width: 300px;
  pointer-events: auto;
  border-left: 4px solid;
}

.toast-success {
  border-left-color: #10b981;
}

.toast-error {
  border-left-color: #ef4444;
}

.toast-warning {
  border-left-color: #f59e0b;
}

.toast-info {
  border-left-color: #3b82f6;
}

.toast-content {
  display: flex;
  align-items: flex-start;
  flex: 1;
}

.toast-icon {
  width: 20px;
  height: 20px;
  margin-right: 12px;
  flex-shrink: 0;
  margin-top: 2px;
}

.toast-success .toast-icon {
  color: #10b981;
}

.toast-error .toast-icon {
  color: #ef4444;
}

.toast-warning .toast-icon {
  color: #f59e0b;
}

.toast-info .toast-icon {
  color: #3b82f6;
}

.toast-message {
  color: #374151;
  font-size: 14px;
  line-height: 1.5;
}

.toast-close {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 18px;
  font-weight: bold;
  margin-left: 12px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: color 0.2s, background-color 0.2s;
}

.toast-close:hover {
  color: #6b7280;
  background-color: #f3f4f6;
}

/* 动画效果 */
.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.3s ease-in;
}

.toast-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>