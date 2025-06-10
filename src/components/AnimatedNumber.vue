<template>
  <span class="animated-number">{{ displayValue }}</span>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

interface Props {
  value: number
  formatter?: (value: number) => string
  duration?: number // 动画持续时间（毫秒）
  threshold?: number // 变化阈值，小于此值直接跳转
  animationType?: 'fast' | 'normal' | 'slow' // 动画类型
}

const props = withDefaults(defineProps<Props>(), {
  formatter: (value: number) => value.toString(),
  duration: 300,
  threshold: 0.1,
  animationType: 'normal'
})

const displayValue = ref('')
const currentValue = ref(0)
const animationId = ref<number | null>(null)

// 根据动画类型获取实际动画时长
const getAnimationDuration = (): number => {
  if (props.animationType === 'fast') {
    return 100 // 快速动画，适合速度等频繁变化的数据
  } else if (props.animationType === 'slow') {
    return 500 // 慢速动画，适合进度等
  } else {
    return props.duration // 正常速度
  }
}

// 根据动画类型获取变化阈值
const getChangeThreshold = (): number => {
  if (props.animationType === 'fast') {
    return props.value * 0.05 // 速度变化超过5%才动画
  } else {
    return props.threshold
  }
}

// 缓动函数：easeOutQuart
const easeOutQuart = (t: number): number => {
  return 1 - Math.pow(1 - t, 4)
}

// 缓动函数：easeOutQuad（更快）
const easeOutQuad = (t: number): number => {
  return 1 - (1 - t) * (1 - t)
}

// 数字动画函数
const animateToValue = (targetValue: number) => {
  if (animationId.value) {
    cancelAnimationFrame(animationId.value)
  }

  const startValue = currentValue.value
  const difference = targetValue - startValue
  const threshold = getChangeThreshold()
  const duration = getAnimationDuration()

  // 如果差值很小，直接跳转
  if (Math.abs(difference) < threshold) {
    currentValue.value = targetValue
    displayValue.value = props.formatter(targetValue)
    return
  }

  const startTime = performance.now()

  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // 根据动画类型选择缓动函数
    let easedProgress: number
    if (props.animationType === 'fast') {
      easedProgress = easeOutQuad(progress) // 使用更快的缓动
    } else {
      easedProgress = easeOutQuart(progress)
    }
    
    const newValue = startValue + (difference * easedProgress)
    
    currentValue.value = newValue
    displayValue.value = props.formatter(newValue)
    
    if (progress < 1) {
      animationId.value = requestAnimationFrame(animate)
    } else {
      // 确保最终值准确
      currentValue.value = targetValue
      displayValue.value = props.formatter(targetValue)
      animationId.value = null
    }
  }

  animationId.value = requestAnimationFrame(animate)
}

// 监听 value 变化
watch(() => props.value, (newValue) => {
  animateToValue(newValue)
}, { immediate: false })

// 组件挂载时初始化
onMounted(() => {
  currentValue.value = props.value
  displayValue.value = props.formatter(props.value)
})

// 组件卸载时清理动画
onUnmounted(() => {
  if (animationId.value) {
    cancelAnimationFrame(animationId.value)
  }
})
</script>

<style scoped>
.animated-number {
  display: inline-block;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  white-space: nowrap;
}
</style>