// Frontend/src/stores/pdfViewerStore.js
import { create } from 'zustand'

export const usePdfViewerStore = create((set) => ({
  isVisible: false,
  pageNum: null,       // PDF page to navigate to
  chunkText: null,     // Exact text passage from the chunk (for reference)
  chunkIndex: null,    // Chunk index for reference

  show: (pageNum, chunkText, chunkIndex) =>
    set({ isVisible: true, pageNum, chunkText, chunkIndex }),

  hide: () =>
    set({ isVisible: false, pageNum: null, chunkText: null, chunkIndex: null }),
}))