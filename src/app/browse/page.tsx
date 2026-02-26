'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Token {
  address: string;
  name: string;
  symbol: string;
  image_url: string | null;
  nft_collection: string;
}

function getImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  return url;
}

function TokenImage({ url, symbol }: { url: string | null; symbol: string }) {
  const [error, setError] = useState(false);
  const imageUrl = getImageUrl(url);
  if (!imageUrl || error) {
    return <div className="w-12 h-12 bg-neutral-900 border border-neutral-700 flex items-center justify-center text-xs font-mono text-neutral-500 flex-shrink-0">{symbol.slice(0, 2)}</div>;
  }
  return (
    <div className="w-12 h-12 relative flex-shrink-0 border border-neutral-700">
      <Image src={imageUrl} alt={symbol} fill className="object-cover" onError={() => setError(true)} unoptimized />
    </div>
  );
}

export default function BrowsePage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const response = await fetch('/api/tokens');
        const data = await response.json();
        if (data.tokens) setTokens(data.tokens);
      } catch (e) { console.error('Failed to fetch tokens:', e); }
      setLoading(false);
    };
    fetchTokens();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container-editorial pt-16 pb-8">
        <div className="mb-6">
          <div className="text-xs text-neutral-500 mb-2 tracking-widest">BASE</div>
          <h1 className="headline-lg font-editorial mb-1">BROWSE</h1>
          <p className="text-neutral-500 text-sm">All cc0strategy tokens on Base</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-neutral-500">Loading tokens...</div>
        ) : tokens.length === 0 ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-neutral-500 mb-4">No tokens found</p>
            <Link href="/deploy" className="btn-primary inline-block">Deploy First Token</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tokens.map((token) => (
              <Link key={token.address} href={`/swap?token=${token.address}`} className="block">
                <div className="card-brutal card-brutal-hover transition-all">
                  <div className="flex items-center gap-4">
                    <TokenImage url={token.image_url} symbol={token.symbol} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-lg truncate">{token.name}</div>
                      <div className="text-neutral-500 text-sm font-mono">${token.symbol}</div>
                    </div>
                    <svg className="w-5 h-5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
