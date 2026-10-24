import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function getBusinessAccess(client: SupabaseClient<Database>, userId: string) {
  const { data, error } = await client
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', userId)

  if (error) throw new Error('Unable to verify business access')
  const memberships = data ?? []
  return {
    businessIds: memberships.map(membership => membership.business_id),
    canProvision: memberships.some(membership => membership.role === 'platform_admin'),
    canAccess: (businessId: string) => memberships.some(membership => membership.business_id === businessId),
    canManage: (businessId: string) => memberships.some(membership =>
      membership.business_id === businessId && ['platform_admin', 'owner', 'manager'].includes(membership.role)
    ),
    canManageMembers: (businessId: string) => memberships.some(membership =>
      membership.business_id === businessId && ['platform_admin', 'owner'].includes(membership.role)
    ),
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const AI_SETTING_KEYS = ['ai_tone', 'services', 'products', 'prices', 'faqs', 'opening_hours', 'contact_details', 'handoff_message', 'booking_system', 'greeting_en', 'greeting_hi', 'handoff_message_hi', 'owner_phone'] as const

export type CatalogProject = {
  id: string
  name: string
  aliases?: string[]
  category?: string
  location?: string
  status?: string
  description?: string
  price?: string
  amenities?: string[]
  configurations?: { bhk: number; price: string }[]
}

export type BusinessCatalog = {
  name?: string
  profile?: string
  head_office?: string
  sales_office?: string
  phone?: string
  email?: string
  hours?: string
  projects: CatalogProject[]
}

export type AISettings = Partial<Record<typeof AI_SETTING_KEYS[number], string>> & { catalog?: BusinessCatalog }

export function validCatalog(value: unknown): value is BusinessCatalog {
  if (!isRecord(value) || !Array.isArray(value.projects) || value.projects.length > 100) return false
  if (Object.entries(value).some(([key, field]) => key !== 'projects' &&
    (!['name', 'profile', 'head_office', 'sales_office', 'phone', 'email', 'hours'].includes(key) || typeof field !== 'string' || field.length > 10000))) return false
  const identifiers = new Set<string>()
  return value.projects.every(project => {
    if (!isRecord(project) || typeof project.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(project.id) || identifiers.has(project.id) ||
      typeof project.name !== 'string' || !project.name.trim()) return false
    identifiers.add(project.id)
    return Object.entries(project).every(([key, field]) => {
      if (['id', 'name', 'category', 'location', 'status', 'description', 'price'].includes(key)) return typeof field === 'string' && field.length <= 4000
      if (['aliases', 'amenities'].includes(key)) return Array.isArray(field) && field.length <= 30 && field.every(item => typeof item === 'string' && item.length <= 300)
      if (key === 'configurations') return Array.isArray(field) && field.length <= 20 && field.every(item =>
        isRecord(item) && Object.keys(item).every(name => ['bhk', 'price'].includes(name)) &&
        Number.isInteger(item.bhk) && Number(item.bhk) >= 1 && Number(item.bhk) <= 9 && typeof item.price === 'string' && item.price.length <= 300)
      return false
    })
  })
}

export function validAISettings(value: unknown): value is AISettings {
  return isRecord(value) && JSON.stringify(value).length <= 200000 && Object.entries(value).every(([key, field]) => {
    if (key === 'catalog') return validCatalog(field)
    if (!AI_SETTING_KEYS.includes(key as typeof AI_SETTING_KEYS[number]) || typeof field !== 'string' || field.length > 30000) return false
    return key !== 'owner_phone' || field === '' || /^[1-9]\d{6,14}$/.test(field)
  })
}

export function publicAISettings(value: unknown): AISettings {
  if (!isRecord(value)) return {}
  const settings: AISettings = Object.fromEntries(AI_SETTING_KEYS.flatMap(key => typeof value[key] === 'string' ? [[key, value[key]]] : []))
  if (isRecord(value.catalog)) {
    const catalog = Object.fromEntries(Object.entries(value.catalog).filter(([key]) =>
      ['name', 'profile', 'head_office', 'sales_office', 'phone', 'email', 'hours', 'projects'].includes(key)))
    if (validCatalog(catalog)) settings.catalog = catalog
  }
  return settings
}
