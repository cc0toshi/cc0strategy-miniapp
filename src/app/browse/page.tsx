'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { INDEXER_API } from '@/config/contracts';

interface Token {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  image_url: string | null;
  nft_collection: string;
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
    <div className="min-h-screen bg-black text-white p-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black tracking-tight mb-1">BROWSE</h1>
        <p className="text-neutral-500 text-sm">All cc0strategy tokens</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['all', 'base', 'ethereum'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 font-bold text-xs border-2 transition-colors ${
              filter === f ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
            }`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-neutral-500">Loading tokens...</div>
      ) : filteredTokens.length === 0 ? (
        <div className="text-center py-8 text-neutral-500">No tokens found</div>
      ) : (
        <div className="space-y-3">
          {filteredTokens.map(token => (
            <div key={token.address} className="border-2 border-neutral-800 p-4 hover:border-white transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="font-black">${token.symbol}</h3>
                  <p className="text-neutral-500 text-xs">{token.name}</p>
                </div>
                <span className="text-xs font-mono bg-neutral-900 px-2 py-1">
                  {(token.chain || 'base').toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-neutral-600 font-mono mb-3">
                {formatAddress(token.address)}
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/swap?token=${token.address}`}
                  className="flex-1 py-2 text-center font-bold text-xs border border-white hover:bg-white hover:text-black transition-colors"
                >
                  SWAP
                </Link>
                <Link
                  href={`/claim?token=${token.address}`}
                  className="flex-1 py-2 text-center font-bold text-xs border border-neutral-700 hover:border-white transition-colors"
                >
                  CLAIM
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/deploy" className="text-neutral-500 hover:text-white text-sm">
          Deploy a new token →
        </Link>
      </div>
    </div>
  );
}
