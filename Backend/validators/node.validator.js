import Joi from 'joi';

export const createNodeSchema = Joi.object({
  mindmapId: Joi.string().required(),
  parentId: Joi.string().allow(null, '').optional(),
  text: Joi.string().min(1).max(500).required(),
  position: Joi.object({ x: Joi.number().required(), y: Joi.number().required() }).optional(),
  meta: Joi.object().optional()
});

export const updateNodeSchema = Joi.object({
  text: Joi.string().min(1).max(500).optional(),
  position: Joi.object({ x: Joi.number().required(), y: Joi.number().required() }).optional(),
  meta: Joi.object().optional()
});
