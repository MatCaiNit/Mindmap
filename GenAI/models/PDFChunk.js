import mongoose from 'mongoose'

const PdfChunkSchema = new mongoose.Schema({
  mindmapId: { type: String, required: true, index: true },
  filename:  { type: String, default: '' },
  text:      { type: String, required: true },
  page:      { type: Number, required: true },
  chunkIndex:{ type: Number, default: 0 },
  bbox: {
    x0: { type: Number, default: 0 },
    y0: { type: Number, default: 0 },
    x1: { type: Number, default: 0 },
    y1: { type: Number, default: 0 },
  },
  embedding: { type: [Number], default: [] },
}, { timestamps: true })

export default mongoose.model('PdfChunk', PdfChunkSchema)