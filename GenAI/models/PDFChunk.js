import mongoose from 'mongoose'

const PDFChunkSchema = new mongoose.Schema({
  mindmapId: { type: String, required: true, index: true },
  text:      { type: String, required: true },
  embedding: { type: [Number], default: [] },   // 768 chiều
  chunkIndex: { type: Number, default: 0 },
  metadata: {
    filename:     String,
    pageEstimate: Number,
  }
}, { timestamps: true })

PDFChunkSchema.index({ mindmapId: 1, chunkIndex: 1 })

export default mongoose.model('PDFChunk', PDFChunkSchema)