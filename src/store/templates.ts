import { del, get, keys, set } from 'idb-keyval';
import type { Landmark, Template } from '../pose/types';

const PREFIX = 'tpl:';

export async function listTemplates(): Promise<Template[]> {
  const ks = (await keys()).filter(
    (k): k is string => typeof k === 'string' && k.startsWith(PREFIX),
  );
  const all = await Promise.all(ks.map((k) => get<Template>(k)));
  return all
    .filter((t): t is Template => !!t)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveTemplate(t: Template): Promise<void> {
  await set(PREFIX + t.id, t);
}

export async function deleteTemplate(id: string): Promise<void> {
  await del(PREFIX + id);
}

export function newTemplate(
  name: string,
  landmarks: Landmark[],
  thumb?: string,
  extra?: Partial<Template>,
): Template {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Pose',
    landmarks,
    thumb,
    createdAt: Date.now(),
    ...extra,
  };
}

export async function exportTemplates(): Promise<string> {
  return JSON.stringify({ v: 1, templates: await listTemplates() }, null, 2);
}

export async function importTemplatesJson(json: string): Promise<number> {
  const data = JSON.parse(json) as { templates?: Template[] };
  const list = data.templates ?? [];
  for (const t of list) {
    const id = t.id || crypto.randomUUID();
    await set(PREFIX + id, { ...t, id });
  }
  return list.length;
}
