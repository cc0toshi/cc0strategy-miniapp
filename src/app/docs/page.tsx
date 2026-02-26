'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CONTRACTS } from '@/config/contracts';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  
  return (
    <button
      onClick={handleCopy}
      className="text-xs text-neutral-500 hover:text-white"
    >
      {copied ? '✓' : 'COPY'}
    </button>
  );
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-neutral-900">
      <span className="text-neutral-400 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-neutral-600">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <CopyButton text={address} />
      </div>
    </div>
  );
}

export default function DocsPage() {
  const [chain, setChain] = useState<'base' | 'ethereum'>('base');
  const contracts = CONTRACTS[chain];

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black tracking-tight mb-1">DOCS</h1>
        <p className="text-neutral-500 text-sm">Contract addresses & info</p>
      </div>

      <div className="space-y-6 max-w-md mx-auto">
        {/* Chain Selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setChain('base')}
            className={`flex-1 py-2 font-bold text-sm border-2 transition-colors ${
              chain === 'base' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
            }`}
          >
            BASE
          </button>
          <button
            onClick={() => setChain('ethereum')}
            className={`flex-1 py-2 font-bold text-sm border-2 transition-colors ${
              chain === 'ethereum' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
            }`}
          >
            ETHEREUM
          </button>
        </div>

        {/* Contract Addresses */}
        <section>
          <h2 className="text-lg font-black mb-3 border-b border-neutral-800 pb-2">
            CONTRACTS ({chain.toUpperCase()})
          </h2>
          <div className="space-y-1">
            <AddressRow label="Factory" address={contracts.FACTORY} />
            <AddressRow label="FeeDistributor" address={contracts.FEE_DISTRIBUTOR} />
            <AddressRow label="Hook" address={contracts.HOOK} />
            <AddressRow label="WETH" address={contracts.WETH} />
          </div>
        </section>

        {/* How to Deploy */}
        <section>
          <h2 className="text-lg font-black mb-3 border-b border-neutral-800 pb-2">HOW TO DEPLOY</h2>
          <ol className="space-y-2 text-sm text-neutral-400">
            <li>1. Go to <Link href="/deploy" className="text-white underline">Deploy</Link></li>
            <li>2. Enter NFT collection address (must be ERC721Enumerable)</li>
            <li>3. Set token name and symbol</li>
            <li>4. Pay 0.001 ETH deployment fee</li>
            <li>5. Token is live and trading!</li>
          </ol>
        </section>

        {/* How to Claim */}
        <section>
          <h2 className="text-lg font-black mb-3 border-b border-neutral-800 pb-2">HOW TO CLAIM</h2>
          <ol className="space-y-2 text-sm text-neutral-400">
            <li>1. Go to <Link href="/claim" className="text-white underline">Claim</Link></li>
            <li>2. Select the token</li>
            <li>3. Enter your NFT token IDs</li>
            <li>4. Claim your WETH rewards</li>
          </ol>
        </section>

        {/* Fee Breakdown */}
        <section>
          <h2 className="text-lg font-black mb-3 border-b border-neutral-800 pb-2">FEE BREAKDOWN</h2>
          <div className="text-sm text-neutral-400 space-y-1">
            <p>• Swap fee: 1%</p>
            <p>• 80% → NFT holders</p>
            <p>• 10% → Protocol treasury</p>
            <p>• 10% → Buyback & burn</p>
          </div>
        </section>

        <div className="pt-4 text-center">
          <Link href="/" className="text-neutral-500 hover:text-white text-sm">
            ← Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
