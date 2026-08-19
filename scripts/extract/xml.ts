import { readFileSync, existsSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) =>
    [
      'item',
      'property',
      'passive_effect',
      'effect_group',
      'recipe',
      'ingredient',
      'triggered_effect',
      'requirement',
      'buff',
    ].includes(name),
});

export function loadXml<T = unknown>(filePath: string): T {
  if (!existsSync(filePath)) {
    throw new Error(`No se encontró el archivo: ${filePath}`);
  }
  const raw = readFileSync(filePath, 'utf-8');
  return parser.parse(raw) as T;
}

export function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// --- Estructuras genéricas mínimas de items.xml -----------------------------

export interface XmlProperty {
  name: string;
  value?: string;
  class?: string;
}

export interface XmlPassiveEffect {
  name: string;
  operation?: string;
  value?: string;
  tags?: string;
  level?: string;
}

export interface XmlEffectGroup {
  passive_effect?: XmlPassiveEffect[];
}

export interface XmlItem {
  name: string;
  property?: XmlProperty[];
  effect_group?: XmlEffectGroup[];
}

export interface ItemsXmlRoot {
  items: { item?: XmlItem[] };
}

export interface XmlIngredient {
  name: string;
  count?: string;
}

export interface XmlRecipe {
  name: string;
  ingredient?: XmlIngredient[];
  effect_group?: XmlEffectGroup[];
}

export interface RecipesXmlRoot {
  recipes: { recipe?: XmlRecipe[] };
}

export interface XmlRequirement {
  name: string;
  group_name?: string;
  operation?: string;
  value?: string;
}

export interface XmlTriggeredEffect {
  trigger?: string;
  action?: string;
  cvar?: string;
  operation?: string;
  value?: string;
}

export interface XmlBuffEffectGroup {
  requirement?: XmlRequirement[];
  triggered_effect?: XmlTriggeredEffect[];
  passive_effect?: XmlPassiveEffect[];
}

export interface XmlBuff {
  name: string;
  name_key?: string;
  description_key?: string;
  tooltip_key?: string;
  effect_group?: XmlBuffEffectGroup[];
}

export interface BuffsXmlRoot {
  buffs: { buff?: XmlBuff[] };
}

/** Lee todas las <property> de un item (para búsquedas por nombre, tolerando ausencias). */
export function getProperties(item: XmlItem): XmlProperty[] {
  return toArray(item.property);
}

export function getProperty(item: XmlItem, name: string): string | undefined {
  return getProperties(item).find((p) => p.name === name)?.value;
}

/** Junta todos los passive_effect de todos los effect_group de un item. */
export function getAllPassiveEffects(item: XmlItem): XmlPassiveEffect[] {
  const groups = toArray(item.effect_group);
  return groups.flatMap((g) => toArray(g.passive_effect));
}
