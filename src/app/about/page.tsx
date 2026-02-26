'use client';

import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black tracking-tight mb-1">ABOUT</h1>
        <p className="text-neutral-500 text-sm">What is cc0strategy?</p>
      </div>

      <div className="space-y-6 max-w-md mx-auto">
        <section>
          <h2 className="text-xl font-black mb-3 border-b border-neutral-800 pb-2">THE CONCEPT</h2>
          <p className="text-neutral-400 text-sm leading-relaxed">
            cc0strategy is a token launchpad where <span className="text-white">trading fees go directly to NFT holders</span>. 
            Deploy a token for any NFT collection, and holders earn WETH from every swap.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-black mb-3 border-b border-neutral-800 pb-2">FEE DISTRIBUTION</h2>
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-neutral-900">
              <span className="text-neutral-400">NFT Holders</span>
              <span className="font-black text-white">80%</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-900">
              <span className="text-neutral-400">Treasury</span>
              <span className="font-mono text-neutral-500">10%</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-neutral-400">Buyback & Burn</span>
              <span className="font-mono text-neutral-500">10%</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-black mb-3 border-b border-neutral-800 pb-2">HOW IT WORKS</h2>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="font-black text-white">1.</span>
              <span className="text-neutral-400">Deploy a token for any NFT collection</span>
            </li>
            <li className="flex gap-3">
              <span className="font-black text-white">2.</span>
              <span className="text-neutral-400">Trading generates fees on every swap</span>
            </li>
            <li className="flex gap-3">
              <span className="font-black text-white">3.</span>
              <span className="text-neutral-400">NFT holders claim their share in WETH</span>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-black mb-3 border-b border-neutral-800 pb-2">LINKS</h2>
          <div className="space-y-2">
            <a
              href="https://cc0strategy.fun"
              target="_blank"
              rel="noopener noreferrer"
              className="block py-3 px-4 border border-neutral-800 hover:border-white transition-colors text-sm"
            >
              Website →
            </a>
            <a
              href="https://x.com/cc0toshi_"
              target="_blank"
              rel="noopener noreferrer"
              className="block py-3 px-4 border border-neutral-800 hover:border-white transition-colors text-sm"
            >
              Twitter →
            </a>
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
