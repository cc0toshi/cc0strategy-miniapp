import { NextRequest, NextResponse } from 'next/server';

interface AlchemyNFT {
  contract: {
    address: string;
  };
  tokenId: string;
  name?: string;
  description?: string;
  image?: {
    cachedUrl?: string;
    originalUrl?: string;
    pngUrl?: string;
    thumbnailUrl?: string;
  };
  collection?: {
    name?: string;
    slug?: string;
  };
}

interface AlchemyNFTResponse {
  ownedNfts: AlchemyNFT[];
  totalCount: number;
  pageKey?: string;
}

// Alchemy NFT API endpoint - Base only
const ALCHEMY_NFT_ENDPOINT = 'https://base-mainnet.g.alchemy.com/nft/v3/';

/**
 * Fetch NFTs owned by a wallet on Base, filtered by specific collections
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const collectionsParam = searchParams.get('collections');
  
  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }
  
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Alchemy API not configured' }, { status: 503 });
  }
  
  try {
    const collections = collectionsParam 
      ? collectionsParam.split(',').map(c => c.trim().toLowerCase())
      : null;
    
    let url = `${ALCHEMY_NFT_ENDPOINT}${apiKey}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=100`;
    
    if (collections && collections.length > 0) {
      for (const collection of collections) {
        url += `&contractAddresses[]=${collection}`;
      }
    }
    
    const allNfts: Array<{
      contractAddress: string;
      tokenId: string;
      name: string;
      image: string | null;
      collectionName: string | null;
      chain: string;
    }> = [];
    let pageKey: string | undefined;
    
    do {
      const fetchUrl = pageKey ? `${url}&pageKey=${pageKey}` : url;
      
      const response = await fetch(fetchUrl, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to fetch NFTs' }, { status: 502 });
      }
      
      const data: AlchemyNFTResponse = await response.json();
      
      for (const nft of data.ownedNfts) {
        if (collections && !collections.includes(nft.contract.address.toLowerCase())) {
          continue;
        }
        
        allNfts.push({
          contractAddress: nft.contract.address.toLowerCase(),
          tokenId: nft.tokenId,
          name: nft.name || `#${nft.tokenId}`,
          image: nft.image?.cachedUrl || nft.image?.pngUrl || nft.image?.originalUrl || nft.image?.thumbnailUrl || null,
          collectionName: nft.collection?.name || null,
          chain: 'base',
        });
      }
      
      pageKey = data.pageKey;
    } while (pageKey);
    
    return NextResponse.json({ address, chain: 'base', nfts: allNfts, totalCount: allNfts.length });
    
  } catch (error) {
    console.error('Portfolio NFTs API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST: Fetch NFTs for specified collections on Base
 */
export async function POST(request: NextRequest) {
  try {
    const { address, collections } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: 'address required' }, { status: 400 });
    }
    
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Alchemy API not configured' }, { status: 503 });
    }
    
    // Filter to Base collections only
    const baseCollections = collections && Array.isArray(collections)
      ? collections.filter((c: { chain?: string }) => !c.chain || c.chain === 'base').map((c: { address: string }) => c.address.toLowerCase())
      : null;
    
    let url = `${ALCHEMY_NFT_ENDPOINT}${apiKey}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=100`;
    
    if (baseCollections && baseCollections.length > 0) {
      for (const collection of baseCollections) {
        url += `&contractAddresses[]=${collection}`;
      }
    }
    
    const allNfts: Array<{
      contractAddress: string;
      tokenId: string;
      name: string;
      image: string | null;
      collectionName: string | null;
      chain: string;
    }> = [];
    let pageKey: string | undefined;
    
    try {
      do {
        const fetchUrl = pageKey ? `${url}&pageKey=${pageKey}` : url;
        
        const response = await fetch(fetchUrl, {
          headers: { 'Accept': 'application/json' },
        });
        
        if (response.ok) {
          const data: AlchemyNFTResponse = await response.json();
          
          for (const nft of data.ownedNfts) {
            if (baseCollections && !baseCollections.includes(nft.contract.address.toLowerCase())) {
              continue;
            }
            
            allNfts.push({
              contractAddress: nft.contract.address.toLowerCase(),
              tokenId: nft.tokenId,
              name: nft.name || `#${nft.tokenId}`,
              image: nft.image?.cachedUrl || nft.image?.pngUrl || nft.image?.originalUrl || nft.image?.thumbnailUrl || null,
              collectionName: nft.collection?.name || null,
              chain: 'base',
            });
          }
          
          pageKey = data.pageKey;
        } else {
          break;
        }
      } while (pageKey);
    } catch (e) {
      console.error('Error fetching NFTs:', e);
    }
    
    return NextResponse.json({ address, nfts: allNfts, totalCount: allNfts.length });
    
  } catch (error) {
    console.error('Portfolio NFTs POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
