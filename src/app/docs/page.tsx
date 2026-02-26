export default function DocsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-4 pt-6 pb-8 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="text-xs text-neutral-500 mb-2 tracking-widest font-mono">TECHNICAL REFERENCE</div>
          <h1 className="text-2xl font-black mb-2">DOCS</h1>
          <p className="text-neutral-400 text-sm">
            Complete technical documentation for CC0STRATEGY on Base.
          </p>
        </div>

        {/* Fork Notice */}
        <section className="mb-10">
          <h2 className="font-bold text-lg mb-4 border-b border-neutral-800 pb-2">BUILT ON CLANKER</h2>
          
          <div className="border-2 border-white p-4 mb-4">
            <p className="text-neutral-300 text-sm mb-3">
              CC0STRATEGY is a <strong className="text-white">fork of Clanker</strong>, the token launchpad built by the Clanker team. 
              We believe in transparency and giving credit where it&apos;s due.
            </p>
            <p className="text-neutral-500 text-xs mb-4">
              Clanker pioneered the Uniswap V4 hook-based token launchpad model. We forked their contracts 
              and modified them to direct trading fees to NFT holders.
            </p>
            <a 
              href="https://github.com/clanker-devco/v4-contracts" 
              target="_blank" 
              className="inline-block border border-white px-3 py-2 text-xs hover:bg-white hover:text-black transition-colors"
            >
              ORIGINAL CLANKER REPO →
            </a>
          </div>

          <h3 className="font-bold text-sm mb-3 text-neutral-300">WHAT WE FORKED</h3>
          <ul className="space-y-2 text-neutral-400 text-xs mb-6">
            <li className="flex gap-2">
              <span className="text-white">•</span>
              <span><strong className="text-white">Clanker.sol</strong> — Factory for deploying tokens with V4 pools</span>
            </li>
            <li className="flex gap-2">
              <span className="text-white">•</span>
              <span><strong className="text-white">ClankerToken.sol</strong> — Standard ERC-20 token template</span>
            </li>
            <li className="flex gap-2">
              <span className="text-white">•</span>
              <span><strong className="text-white">ClankerHook.sol</strong> — V4 hook for 6.9% fee collection</span>
            </li>
            <li className="flex gap-2">
              <span className="text-white">•</span>
              <span><strong className="text-white">LpLocker.sol</strong> — LP locker to prevent rug pulls</span>
            </li>
          </ul>

          <h3 className="font-bold text-sm mb-3 text-neutral-300">WHAT WE CHANGED</h3>
          <div className="space-y-3">
            <div className="border border-neutral-800 p-3">
              <h4 className="font-bold text-white text-sm mb-1">NFT FEE DISTRIBUTION</h4>
              <p className="text-neutral-400 text-xs">
                Added FeeDistributor that routes 80% of trading fees to NFT holders, claimable per token ID.
              </p>
            </div>
            <div className="border border-neutral-800 p-3">
              <h4 className="font-bold text-white text-sm mb-1">TREASURY BUYBACK</h4>
              <p className="text-neutral-400 text-xs">
                20% of fees go to treasury for strategic $CC0COMPANY token buyback.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-10">
          <h2 className="font-bold text-lg mb-4 border-b border-neutral-800 pb-2">HOW IT WORKS</h2>
          
          <div className="space-y-4 text-sm">
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 border-2 border-white flex items-center justify-center font-bold shrink-0 text-sm">1</div>
              <div>
                <h3 className="font-bold mb-1">DEPLOY A TOKEN</h3>
                <p className="text-neutral-400 text-xs">Link any ERC721 NFT collection to a new token. Factory creates token + Uniswap V4 pool in one tx.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 border-2 border-white flex items-center justify-center font-bold shrink-0 text-sm">2</div>
              <div>
                <h3 className="font-bold mb-1">TRADING GENERATES FEES</h3>
                <p className="text-neutral-400 text-xs">Every swap pays 6.9% fee. Hook captures fees and routes to FeeDistributor.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 border-2 border-white flex items-center justify-center font-bold shrink-0 text-sm">3</div>
              <div>
                <h3 className="font-bold mb-1">NFT HOLDERS CLAIM</h3>
                <p className="text-neutral-400 text-xs">80% of fees distributed to NFT holders. Claim WETH by token ID anytime.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Fee Breakdown */}
        <section className="mb-10">
          <h2 className="font-bold text-lg mb-4 border-b border-neutral-800 pb-2">FEE BREAKDOWN</h2>
          
          <div className="border-2 border-white">
            <div className="grid grid-cols-2 border-b border-white">
              <div className="p-3 font-bold text-sm">SWAP FEE</div>
              <div className="p-3 text-right font-mono text-sm">6.9%</div>
            </div>
            <div className="grid grid-cols-2 border-b border-white">
              <div className="p-3 font-bold text-sm">→ NFT HOLDERS</div>
              <div className="p-3 text-right font-mono text-sm text-green-500">80%</div>
            </div>
            <div className="grid grid-cols-2 border-b border-white">
              <div className="p-3 font-bold text-sm">→ TREASURY</div>
              <div className="p-3 text-right font-mono text-sm">10%</div>
            </div>
            <div className="grid grid-cols-2">
              <div className="p-3 font-bold text-sm">→ BUYBACK & BURN</div>
              <div className="p-3 text-right font-mono text-sm">10%</div>
            </div>
          </div>
          
          <p className="mt-3 text-xs text-neutral-500">
            <strong className="text-neutral-400">EXAMPLE:</strong> On a $100 swap, $6.90 fees. 
            $5.52 to NFT holders, $0.69 treasury, $0.69 buyback.
          </p>
        </section>

        {/* Contract Addresses - Base Only */}
        <section className="mb-10">
          <h2 className="font-bold text-lg mb-4 border-b border-neutral-800 pb-2">BASE CONTRACTS</h2>
          
          <div className="space-y-2">
            <div className="border border-neutral-800 p-3">
              <div className="font-bold text-xs text-neutral-500 mb-1">FACTORY</div>
              <a href="https://basescan.org/address/0xDbbC0A64fFe2a23b4543b0731CF61ef0d5d4E265" target="_blank" className="font-mono text-[10px] text-neutral-400 hover:text-white break-all">
                0xDbbC0A64fFe2a23b4543b0731CF61ef0d5d4E265
              </a>
            </div>
            <div className="border border-neutral-800 p-3">
              <div className="font-bold text-xs text-neutral-500 mb-1">FEE DISTRIBUTOR</div>
              <a href="https://basescan.org/address/0x498bcfdbd724989fc37259faba75168c8f47080d" target="_blank" className="font-mono text-[10px] text-neutral-400 hover:text-white break-all">
                0x498bcfdbd724989fc37259faba75168c8f47080d
              </a>
            </div>
            <div className="border border-neutral-800 p-3">
              <div className="font-bold text-xs text-neutral-500 mb-1">LP LOCKER</div>
              <a href="https://basescan.org/address/0x5821e651D6fBF096dB3cBD9a21FaE4F5A1E2620A" target="_blank" className="font-mono text-[10px] text-neutral-400 hover:text-white break-all">
                0x5821e651D6fBF096dB3cBD9a21FaE4F5A1E2620A
              </a>
            </div>
            <div className="border border-neutral-800 p-3">
              <div className="font-bold text-xs text-neutral-500 mb-1">HOOK</div>
              <a href="https://basescan.org/address/0x5eE3602f499cFEAa4E13D27b4F7D2661906b28cC" target="_blank" className="font-mono text-[10px] text-neutral-400 hover:text-white break-all">
                0x5eE3602f499cFEAa4E13D27b4F7D2661906b28cC
              </a>
            </div>
          </div>
        </section>

        {/* Links */}
        <section>
          <h2 className="font-bold text-lg mb-4 border-b border-neutral-800 pb-2">RESOURCES</h2>
          
          <div className="space-y-2">
            <a 
              href="https://github.com/cc0toshi/cc0strategy" 
              target="_blank" 
              className="block border-2 border-white p-4 hover:bg-white hover:text-black transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">CC0STRATEGY GITHUB</span>
                <span>→</span>
              </div>
            </a>
            <a 
              href="https://github.com/clanker-devco/v4-contracts" 
              target="_blank" 
              className="block border-2 border-white p-4 hover:bg-white hover:text-black transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">ORIGINAL CLANKER REPO</span>
                <span>→</span>
              </div>
            </a>
            <a 
              href="https://cc0strategy.fun" 
              target="_blank" 
              className="block border-2 border-white p-4 hover:bg-white hover:text-black transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">FULL WEB APP</span>
                <span>→</span>
              </div>
            </a>
            <a 
              href="https://farcaster.xyz/miniapps/N7O9MvQ8wid_/cc0strategy" 
              target="_blank" 
              className="block border-2 border-white p-4 hover:bg-white hover:text-black transition-colors"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">FARCASTER MINI APP</span>
                <span>→</span>
              </div>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
