'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container-editorial pt-16 pb-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="headline-xl font-editorial mb-3">CC0STRATEGY</h1>
          <p className="text-neutral-500 text-sm max-w-xs mx-auto">
            Token launchpad where trading fees flow directly to NFT holders
          </p>
        </div>
        
        {/* Main Actions */}
        <div className="space-y-3">
          <Link href="/browse" className="block">
            <div className="card-brutal card-brutal-hover transition-all">
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
            <div className="card-brutal card-brutal-hover transition-all">
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
            <div className="card-brutal card-brutal-hover transition-all">
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

          <Link href="/deploy" className="block">
            <div className="border-2 border-neutral-700 p-6 hover:border-white transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-lg uppercase tracking-wide text-neutral-400">Deploy</h2>
                  <p className="text-neutral-600 text-sm">Launch a new token</p>
                </div>
                <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Info Card */}
        <div className="mt-8 border border-neutral-800 p-5">
          <p className="caption text-neutral-600 mb-3">HOW IT WORKS</p>
          <ul className="space-y-2 text-sm text-neutral-400">
            <li className="flex items-start gap-2">
              <span className="text-white">•</span>
              <span>Trading fees go to NFT holders</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white">•</span>
              <span>80% to holders, 20% protocol</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white">•</span>
              <span>Claim WETH anytime</span>
            </li>
          </ul>
        </div>
        
        {/* Footer Links */}
        <div className="flex gap-3 mt-6">
          <Link href="/about" className="flex-1 text-center py-3 border border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider hover:border-white hover:text-white transition-colors">
            About
          </Link>
          <Link href="/docs" className="flex-1 text-center py-3 border border-neutral-800 text-neutral-500 text-xs uppercase tracking-wider hover:border-white hover:text-white transition-colors">
            Docs
          </Link>
        </div>

        <div className="text-center mt-6">
          <a
            href="https://cc0strategy.fun"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-600 hover:text-neutral-400 text-xs"
          >
            cc0strategy.fun →
          </a>
        </div>
      </div>
    </div>
  )
}
