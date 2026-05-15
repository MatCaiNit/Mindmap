// Frontend/src/stores/generationStore.js
// Quản lý trạng thái generation độc lập với modal
// → Đóng modal không dừng generation

import { create } from 'zustand'

export const useGenerationStore = create((set, get) => ({
  // State
  isGenerating: false,
  status: '',
  nodeCount: 0,
  phase: 'idle',  // 'idle' | 'streaming' | 'done' | 'error'
  error: '',
  mindmapId: null,
  abortController: null,

  // Actions
  startGeneration: ({ mindmapId, abortController }) => set({
    isGenerating: true,
    status: 'Đang khởi động...',
    nodeCount: 0,
    phase: 'streaming',
    error: '',
    mindmapId,
    abortController,
  }),

  updateStatus: (status) => set({ status }),

  incrementNodes: () => set(s => ({ nodeCount: s.nodeCount + 1 })),

  setNodeCount: (nodeCount) => set({ nodeCount }),

  finishGeneration: (totalNodes) => set({
    isGenerating: false,
    phase: 'done',
    status: `Hoàn tất — ${totalNodes} node`,
    abortController: null,
  }),

  failGeneration: (error) => set({
    isGenerating: false,
    phase: 'error',
    error,
    abortController: null,
  }),

  cancelGeneration: () => {
    const { abortController } = get()
    if (abortController) {
      abortController.abort()
    }
    set({
      isGenerating: false,
      phase: 'idle',
      status: '',
      nodeCount: 0,
      error: '',
      abortController: null,
    })
  },

  reset: () => set({
    isGenerating: false,
    status: '',
    nodeCount: 0,
    phase: 'idle',
    error: '',
    mindmapId: null,
    abortController: null,
  }),
}))