import { NextResponse } from 'next/server';
import { OPENSEA_CHAIN_SLUG } from '@/config/contracts';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const collection = searchParams.get('collection');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Missing wallet address' }, { status: 400 });
  }
  
  try {
    const apiKey = process.env.OPENSEA_API_KEY;
    const headers: HeadersInit = {
      'Accept': 'application/json',
    };
    
    if (apiKey) {
      headers['X-API-KEY'] = apiKey;
    }
    
    let url = `https://api.opensea.io/api/v2/chain/${OPENSEA_CHAIN_SLUG}/account/${wallet}/nfts`;
    if (collection) {
      url += `?collection=${collection}`;
    }
    
    const response = await fetch(url, {
      headers,
      next: { revalidate: 60 }
    });
    
    if (!response.ok) {
      // Fallback: return empty if OpenSea fails
      console.error('OpenSea API error:', response.status);
      return NextResponse.json({ nfts: [] });
    }
    
    const data = await response.json();
    
    // Transform to simpler format
    const nfts = (data.nfts || []).map((nft: any) => ({
      identifier: nft.identifier,
      name: nft.name || `#${nft.identifier}`,
      image_url: nft.image_url || nft.display_image_url,
      collection: nft.collection,
      contract: nft.contract,
    }));
    
    return NextResponse.json({ nfts });
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    return NextResponse.json({ nfts: [] });
  }
}
