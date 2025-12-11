// Backend/validators/mindmap.validator.js
import Joi from 'joi';

export const createMindmapSchema = Joi.object({
  title: Joi.string().min(1).max(200).required(),
  description: Joi.string().allow('', null).max(2000).optional()
});

export const updateMindmapSchema = Joi.object({
  title: Joi.string().min(1).max(200).optional(),
  description: Joi.string().allow('', null).max(2000).optional()
});
