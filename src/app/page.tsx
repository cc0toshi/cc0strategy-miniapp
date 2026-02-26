'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="text-center pt-8 pb-6">
        <h1 className="text-4xl font-black tracking-tight mb-1">cc0strategy</h1>
        <p className="text-neutral-500 text-sm">NFT holder fee distribution</p>
      </div>
      
      <div className="space-y-3 max-w-md mx-auto">
        <Link href="/browse" className="block">
          <div className="border-2 border-white p-5 hover:bg-neutral-900 transition-colors">
            <h2 className="text-lg font-black mb-0.5">BROWSE</h2>
            <p className="text-neutral-500 text-xs">Discover all tokens</p>
          </div>
        </Link>

        <Link href="/swap" className="block">
          <div className="border-2 border-white p-5 hover:bg-neutral-900 transition-colors">
            <h2 className="text-lg font-black mb-0.5">SWAP</h2>
            <p className="text-neutral-500 text-xs">Trade cc0 tokens</p>
          </div>
        </Link>
        
        <Link href="/claim" className="block">
          <div className="border-2 border-white p-5 hover:bg-neutral-900 transition-colors">
            <h2 className="text-lg font-black mb-0.5">CLAIM</h2>
            <p className="text-neutral-500 text-xs">Claim WETH for NFT holders</p>
          </div>
        </Link>

        <Link href="/deploy" className="block">
          <div className="border-2 border-neutral-700 p-5 hover:border-white transition-colors">
            <h2 className="text-lg font-black mb-0.5">DEPLOY</h2>
            <p className="text-neutral-500 text-xs">Launch a new token</p>
          </div>
        </Link>

        <Link href="/portfolio" className="block">
          <div className="border-2 border-neutral-700 p-5 hover:border-white transition-colors">
            <h2 className="text-lg font-black mb-0.5">PORTFOLIO</h2>
            <p className="text-neutral-500 text-xs">View your holdings</p>
          </div>
        </Link>
        
        <div className="flex gap-3 pt-2">
          <Link href="/about" className="flex-1">
            <div className="border border-neutral-800 p-3 hover:border-neutral-600 transition-colors text-center">
              <span className="text-xs font-bold text-neutral-500">ABOUT</span>
            </div>
          </Link>
          <Link href="/docs" className="flex-1">
            <div className="border border-neutral-800 p-3 hover:border-neutral-600 transition-colors text-center">
              <span className="text-xs font-bold text-neutral-500">DOCS</span>
            </div>
          </Link>
        </div>

        <div className="text-center pt-4">
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
