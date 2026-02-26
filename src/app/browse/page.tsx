'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { INDEXER_API } from '@/config/contracts';

interface Token {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  image_url: string | null;
  nft_collection: string;
}

function getImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

function TokenImage({ url, symbol }: { url: string | null; symbol: string }) {
  const [error, setError] = useState(false);
  const imageUrl = getImageUrl(url);

  if (!imageUrl || error) {
    return (
      <div className="w-12 h-12 bg-neutral-900 border border-neutral-700 flex items-center justify-center text-xs font-mono text-neutral-500 flex-shrink-0">
        {symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <div className="w-12 h-12 relative flex-shrink-0 border border-neutral-700">
      <Image
        src={imageUrl}
        alt={symbol}
        fill
        className="object-cover"
        onError={() => setError(true)}
        unoptimized
      />
    </div>
  );
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function BrowsePage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'base' | 'ethereum'>('all');

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const response = await fetch(`${INDEXER_API}/tokens`);
        const data = await response.json();
        if (data.tokens) {
          setTokens(data.tokens);
        }
      } catch (e) {
        console.error('Failed to fetch tokens:', e);
      }
      setLoading(false);
    };
    fetchTokens();
  }, []);

  const filteredTokens = tokens.filter(t => 
    filter === 'all' || (t.chain || 'base') === filter
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container-editorial py-6">
        <div className="mb-6">
          <h1 className="headline-lg font-editorial mb-1">BROWSE</h1>
          <p className="text-neutral-500 text-sm">All cc0strategy tokens</p>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {(['all', 'base', 'ethereum'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 font-bold text-xs uppercase tracking-wider border-2 transition-colors ${
                filter === f ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500 hover:border-white'
              }`}
            >
              {f === 'all' ? 'ALL' : f.toUpperCase()}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Loading tokens...</div>
        ) : filteredTokens.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">No tokens found</div>
        ) : (
          <div className="space-y-3">
            {filteredTokens.map(token => (
              <div key={token.address} className="card-brutal hover:border-white transition-colors">
                <div className="flex items-center gap-4">
                  <TokenImage url={token.image_url} symbol={token.symbol} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg truncate">${token.symbol}</h3>
                      <span className="text-[10px] font-mono bg-neutral-900 px-2 py-0.5 border border-neutral-700">
                        {(token.chain || 'base').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-neutral-500 text-sm truncate">{token.name}</p>
                    <p className="text-neutral-700 text-xs font-mono mt-1">{formatAddress(token.address)}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Link
                    href={`/swap?token=${token.address}`}
                    className="flex-1 py-2 text-center font-bold text-xs uppercase tracking-wider border-2 border-white hover:bg-white hover:text-black transition-colors"
                  >
                    Trade
                  </Link>
                  <Link
                    href={`/claim?token=${token.address}`}
                    className="flex-1 py-2 text-center font-bold text-xs uppercase tracking-wider border border-neutral-700 hover:border-white transition-colors"
                  >
                    Claim
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link href="/deploy" className="text-neutral-500 hover:text-white text-sm link-underline">
            Deploy a new token →
          </Link>
        </div>
      </div>
    </div>
  );
}
