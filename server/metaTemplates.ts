export const META_MARKETS = ['UK', 'IN', 'DE', 'US'] as const;
export type MetaMarket = typeof META_MARKETS[number];

export type MetaTemplateIds = {
  campaignId?: string;
  adSetId?: string;
  adId?: string;
};

export const META_MARKET_TEMPLATES: Record<MetaMarket, MetaTemplateIds> = {
  UK: {
    campaignId: '120239008217210106',
    adSetId: '120239008217450106',
    adId: '120239008217220106',
  },
  IN: {},
  DE: {},
  US: {},
};

export function normalizeMetaMarket(input?: string): MetaMarket | null {
  if (!input) return null;
  const normalized = input.trim().toUpperCase();
  if ((META_MARKETS as readonly string[]).includes(normalized)) {
    return normalized as MetaMarket;
  }
  return null;
}

export function getMetaTemplateIds(market: MetaMarket): MetaTemplateIds {
  return META_MARKET_TEMPLATES[market];
}
