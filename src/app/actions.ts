"use server";

import { AiImagesClient } from "@gadget-client/ai-images";

const GADGET_API_KEY = process.env.GADGET_API_KEY;
const GADGET_ENV = process.env.GADGET_ENV || "development";

if (!GADGET_API_KEY) {
  console.error("Error: GADGET_API_KEY is not defined in the environment.");
}

const api = new AiImagesClient({
  environment: GADGET_ENV,
  authenticationMode: {
    apiKey: GADGET_API_KEY,
  },
});

export interface TemplateRecord {
  id: string;
  name: string;
  badge?: string;
  category: "Studio" | "Lifestyle" | "Seasonal" | "Brand";
  creditsRequired: number;
  description: string;
  displayImageUrl: string;
  prompt: string;
  sortOrder: number;
  visibility: "public" | "hidden";
  createdAt?: string;
  updatedAt?: string;
}

export async function getTemplates(search?: string): Promise<TemplateRecord[]> {
  try {
    const templates = await api.template.findMany({
      sort: { sortOrder: "Ascending" },
      search: search || undefined,
    });
    return JSON.parse(JSON.stringify(templates));
  } catch (error: any) {
    console.error("Failed to get templates:", error);
    throw new Error(error?.message || "Failed to fetch templates");
  }
}

export async function createTemplate(payload: Partial<TemplateRecord>): Promise<TemplateRecord> {
  try {
    const created = await api.template.create(payload as any);
    return JSON.parse(JSON.stringify(created));
  } catch (error: any) {
    console.error("Failed to create template:", error);
    throw new Error(error?.message || "Failed to create template");
  }
}

export async function updateTemplate(id: string, payload: Partial<TemplateRecord>): Promise<TemplateRecord> {
  try {
    const updated = await api.template.update({
      id,
      ...payload,
    } as any);
    return JSON.parse(JSON.stringify(updated));
  } catch (error: any) {
    console.error("Failed to update template:", error);
    throw new Error(error?.message || "Failed to update template");
  }
}

export async function deleteTemplate(id: string): Promise<{ success: boolean }> {
  try {
    await api.template.delete(id);
    return { success: true };
  } catch (error: any) {
    console.error("Failed to delete template:", error);
    throw new Error(error?.message || "Failed to delete template");
  }
}
