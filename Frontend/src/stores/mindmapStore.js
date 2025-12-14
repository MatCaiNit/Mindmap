// ==========================================
// FILE: Frontend/src/stores/mindmapStore.js
// ==========================================
import { create } from 'zustand'

export const useMindmapStore = create((set) => ({
  mindmaps: [],
  currentMindmap: null,
  
  setMindmaps: (mindmaps) => set({ mindmaps }),
  setCurrentMindmap: (mindmap) => set({ currentMindmap: mindmap }),
  
  addMindmap: (mindmap) => 
    set((state) => ({ mindmaps: [mindmap, ...state.mindmaps] })),
  
  updateMindmap: (id, updates) => 
    set((state) => ({
      mindmaps: state.mindmaps.map(m => 
        m._id === id ? { ...m, ...updates } : m
      ),
      currentMindmap: state.currentMindmap?._id === id 
        ? { ...state.currentMindmap, ...updates } 
        : state.currentMindmap
    })),
  
  deleteMindmap: (id) => 
    set((state) => ({
      mindmaps: state.mindmaps.filter(m => m._id !== id)
    })),
}))