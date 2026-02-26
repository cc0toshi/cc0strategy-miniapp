'use client';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="text-center max-w-lg">
        <p className="text-neutral-400 text-sm leading-relaxed mb-8">
          Launch tokens linked to any NFT collection on Base. Trading fees flow directly to NFT holders. No staking. No lockups. Just hold &amp; earn.
        </p>
        
        <div className="flex flex-col gap-3">
          <a
            href="/browse"
            className="block w-full border-2 border-white px-6 py-3 text-sm uppercase tracking-widest hover:bg-white hover:text-black transition-colors text-center"
          >
            Browse Tokens
          </a>
          <a
            href="/deploy"
            className="block w-full border border-neutral-700 px-6 py-3 text-sm uppercase tracking-widest text-neutral-400 hover:border-white hover:text-white transition-colors text-center"
          >
            Deploy Token
          </a>
        </div>
        
        <div className="mt-12 pt-6 border-t border-neutral-800">
          <a
            href="https://cc0strategy.fun"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 text-xs hover:text-white transition-colors"
          >
            CC0STRATEGY.FUN →
          </a>
        </div>
      </div>
    </div>
  );
}
