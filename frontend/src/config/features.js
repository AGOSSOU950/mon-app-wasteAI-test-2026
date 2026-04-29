const marketplaceOverride = typeof localStorage !== 'undefined' ? localStorage.getItem('wasteai_feature_marketplace') : null
const photoAiOverride = typeof localStorage !== 'undefined' ? localStorage.getItem('wasteai_feature_photo_identification') : null

export const FEATURES = {
  marketplace: String(import.meta.env.VITE_ENABLE_MARKETPLACE ?? marketplaceOverride ?? 'false').toLowerCase() === 'true',
  photoIdentification: String(import.meta.env.VITE_ENABLE_PHOTO_AI ?? photoAiOverride ?? 'false').toLowerCase() === 'true',
}

export function setFeatureFlag(name, enabled) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(`wasteai_feature_${name}`, enabled ? 'true' : 'false')
}
