import { NextRequest, NextResponse } from 'next/server';

interface PriceData {
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  fdv: number;
  liquidity: number;
}

export async function POST(request: NextRequest) {
  try {
    const { tokens } = await request.json();
    
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return NextResponse.json({ error: 'tokens array required', prices: {} }, { status: 400 });
    }
    
    const prices: Record<string, PriceData> = {};
    
    for (const token of tokens) {
      const tokenAddress = typeof token === 'string' ? token : token.address;
      const chain = typeof token === 'string' ? 'base' : (token.chain || 'base');
      
      const networkId = chain === 'ethereum' ? 'eth' : 'base';
      
      try {
        const poolsUrl = `https://api.geckoterminal.com/api/v2/networks/${networkId}/tokens/${tokenAddress.toLowerCase()}/pools?page=1`;
        
        const poolsResponse = await fetch(poolsUrl, {
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 60 },
        });
        
        if (poolsResponse.ok) {
          const poolsData = await poolsResponse.json();
          const pools = poolsData.data;
          
          if (pools && pools.length > 0) {
            const pool = pools[0];
            const poolAttrs = pool.attributes;
            
            if (poolAttrs) {
              const baseTokenPrice = parseFloat(poolAttrs.base_token_price_usd || '0');
              const quoteTokenPrice = parseFloat(poolAttrs.quote_token_price_usd || '0');
              
              const baseTokenAddr = pool.relationships?.base_token?.data?.id?.split('_')[1]?.toLowerCase();
              const isBaseToken = baseTokenAddr === tokenAddress.toLowerCase();
              const priceUsd = isBaseToken ? baseTokenPrice : quoteTokenPrice;
              
              prices[tokenAddress.toLowerCase()] = {
                priceUsd: priceUsd,
                priceChange24h: parseFloat(poolAttrs.price_change_percentage?.h24 || '0'),
                volume24h: parseFloat(poolAttrs.volume_usd?.h24 || '0'),
                marketCap: parseFloat(poolAttrs.market_cap_usd || '0') || parseFloat(poolAttrs.fdv_usd || '0'),
                fdv: parseFloat(poolAttrs.fdv_usd || '0'),
                liquidity: parseFloat(poolAttrs.reserve_in_usd || '0'),
              };
            }
          }
        }
      } catch (e) {
        console.error(`Error fetching price for ${tokenAddress} on ${chain}:`, e);
      }
    }
    
    return NextResponse.json({ prices });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Prices API error:', error);
    return NextResponse.json(
      { error: errorMessage, prices: {} },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokensParam = searchParams.get('tokens');
  const chain = searchParams.get('chain') || 'base';
  
  if (!tokensParam) {
    return NextResponse.json({ error: 'tokens param required', prices: {} }, { status: 400 });
  }
  
  const tokenAddresses = tokensParam.split(',').map(t => t.trim()).filter(Boolean);
  const tokens = tokenAddresses.map(address => ({ address, chain }));
  
  const fakeRequest = {
    json: async () => ({ tokens }),
  } as NextRequest;
  
  return POST(fakeRequest);
}
