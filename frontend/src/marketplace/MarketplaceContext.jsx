import { createContext, useContext } from "react"

const MarketplaceCatalogContext = createContext(null)
const MarketplaceMessagingContext = createContext(null)
const MarketplaceTraceabilityContext = createContext(null)

export function MarketplaceCatalogProvider({ value, children }) {
  return <MarketplaceCatalogContext.Provider value={value}>{children}</MarketplaceCatalogContext.Provider>
}

export function MarketplaceMessagingProvider({ value, children }) {
  return <MarketplaceMessagingContext.Provider value={value}>{children}</MarketplaceMessagingContext.Provider>
}

export function MarketplaceTraceabilityProvider({ value, children }) {
  return <MarketplaceTraceabilityContext.Provider value={value}>{children}</MarketplaceTraceabilityContext.Provider>
}

export function useMarketplaceCatalogView() {
  const context = useContext(MarketplaceCatalogContext)
  if (!context) {
    throw new Error("useMarketplaceCatalogView must be used within MarketplaceCatalogProvider")
  }
  return context
}

export function useMarketplaceMessagingView() {
  const context = useContext(MarketplaceMessagingContext)
  if (!context) {
    throw new Error("useMarketplaceMessagingView must be used within MarketplaceMessagingProvider")
  }
  return context
}

export function useMarketplaceTraceabilityView() {
  const context = useContext(MarketplaceTraceabilityContext)
  if (!context) {
    throw new Error("useMarketplaceTraceabilityView must be used within MarketplaceTraceabilityProvider")
  }
  return context
}
