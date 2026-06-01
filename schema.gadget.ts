import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "template" model, go to https://shotify.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "template_model_v1",
  fields: {
    badge: { type: "string", storageKey: "template_badge" },
    category: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["Studio", "Lifestyle", "Seasonal", "Brand"],
      validations: { required: true },
      storageKey: "template_category",
    },
    creditsRequired: {
      type: "number",
      default: 1,
      decimals: 0,
      validations: {
        required: true,
        numberRange: { min: 1, max: 100 },
      },
      storageKey: "template_credits_required",
    },
    description: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: 1, max: 500 },
      },
      storageKey: "template_description",
    },
    displayImageUrl: {
      type: "url",
      validations: { required: true },
      storageKey: "template_display_image_url",
    },
    generationJobs: {
      type: "hasMany",
      children: {
        model: "generationJob",
        belongsToField: "template",
      },
      storageKey: "template_generation_jobs",
    },
    name: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: 1, max: 100 },
      },
      storageKey: "template_name",
    },
    prompt: {
      type: "string",
      validations: {
        required: true,
        stringLength: { min: 10, max: 8000 },
      },
      storageKey: "template_prompt",
    },
    sortOrder: {
      type: "number",
      default: 0,
      decimals: 0,
      storageKey: "template_sort_order",
    },
    visibility: {
      type: "enum",
      default: "hidden",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["public", "hidden"],
      validations: { required: true },
      storageKey: "template_visibility",
    },
  },
};
