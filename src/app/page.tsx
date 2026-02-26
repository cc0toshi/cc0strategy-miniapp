'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-4 pt-8 pb-8 max-w-lg mx-auto">
        {/* Hero - no title, just description */}
        <div className="text-center mb-8">
          <p className="text-neutral-400 text-sm max-w-xs mx-auto">
            Token launchpad where trading fees flow directly to NFT holders
          </p>
        </div>
        
        {/* Main Actions */}
        <div className="space-y-3">
          <Link href="/deploy" className="block">
            <div className="border-2 border-white p-5 hover:bg-white hover:text-black transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-lg uppercase tracking-wide">Deploy</h2>
                  <p className="text-neutral-500 text-sm">Launch a new token</p>
                </div>
                <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
            </div>
          </Link>

          <Link href="/browse" className="block">
            <div className="border-2 border-white p-5 hover:bg-white hover:text-black transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-lg uppercase tracking-wide">Browse</h2>
                  <p className="text-neutral-500 text-sm">Discover all tokens</p>
                </div>
                <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </Link>

          <Link href="/swap" className="block">
            <div className="border-2 border-white p-5 hover:bg-white hover:text-black transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-lg uppercase tracking-wide">Trade</h2>
                  <p className="text-neutral-500 text-sm">Buy & sell tokens</p>
                </div>
                <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
            </div>
          </Link>
          
          <Link href="/claim" className="block">
            <div className="border-2 border-white p-5 hover:bg-white hover:text-black transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-lg uppercase tracking-wide">Claim</h2>
                  <p className="text-neutral-500 text-sm">Collect WETH rewards</p>
                </div>
                <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Fee Distribution Section */}
        <div className="mt-10 bg-white text-black p-6">
          <h2 className="font-bold text-lg uppercase tracking-wide mb-4 text-center">Fee Distribution</h2>
          
          {/* Pie Chart */}
          <div className="flex flex-col items-center">
            <div className="relative w-48 h-48 mb-6">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                {/* 80% NFT Holders - Black */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="black"
                  strokeWidth="20"
                  strokeDasharray="201.06 251.33"
                  strokeDashoffset="0"
                />
                {/* 10% Treasury - Gray */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#666666"
                  strokeWidth="20"
                  strokeDasharray="25.13 251.33"
                  strokeDashoffset="-201.06"
                />
                {/* 10% Buyback - Light Gray */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke="#999999"
                  strokeWidth="20"
                  strokeDasharray="25.13 251.33"
                  strokeDashoffset="-226.19"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-bold text-sm">6.9% FEE</span>
              </div>
            </div>
            
            {/* Legend */}
            <div className="space-y-2 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-black"></div>
                  <span className="text-xs uppercase tracking-wider">NFT Holders</span>
                </div>
                <span className="font-bold">80%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-[#666666]"></div>
                  <span className="text-xs uppercase tracking-wider">Treasury</span>
                </div>
                <span className="font-bold">10%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-[#999999]"></div>
                  <span className="text-xs uppercase tracking-wider">Buyback & Burn</span>
                </div>
                <span className="font-bold">10%</span>
              </div>
            </div>
          </div>
        </div>

        {/* About Section */}
        <div className="mt-8 space-y-6">
          <section>
            <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-neutral-500">The Concept</h2>
            <p className="text-neutral-400 text-sm leading-relaxed">
              CC0STRATEGY is a token launchpad where trading fees go directly to NFT holders. 
              Deploy a token for any NFT collection, and holders earn WETH from every swap.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-neutral-500">How It Works</h2>
            <ol className="space-y-2 text-sm text-neutral-400">
              <li className="flex gap-2">
                <span className="text-white font-bold">1.</span>
                <span>Deploy a token for any NFT collection</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white font-bold">2.</span>
                <span>Trading generates fees on every swap</span>
              </li>
              <li className="flex gap-2">
                <span className="text-white font-bold">3.</span>
                <span>NFT holders claim their share in WETH</span>
              </li>
            </ol>
          </section>

          <section>
            <h2 className="font-bold text-sm uppercase tracking-wider mb-3 text-neutral-500">Links</h2>
            <div className="flex gap-3">
              <a
                href="https://cc0strategy.fun"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-2 border border-neutral-700 text-neutral-400 text-xs uppercase tracking-wider hover:border-white hover:text-white transition-colors"
              >
                Website →
              </a>
              <a
                href="https://x.com/cc0toshi_"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-2 border border-neutral-700 text-neutral-400 text-xs uppercase tracking-wider hover:border-white hover:text-white transition-colors"
              >
                Twitter →
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
