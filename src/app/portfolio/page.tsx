'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, usePublicClient, useChainId, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatEther } from 'viem';
import { CONTRACTS, CHAIN_ID } from '@/config/contracts';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

interface Token {
  address: string;
  symbol: string;
  name: string;
  nft_collection: string;
}

interface Holding {
  token: Token;
  balance: string;
}

export default function PortfolioPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const isOnWrongChain = chainId !== CHAIN_ID;

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const response = await fetch('/api/tokens');
        const data = await response.json();
        if (data.tokens) setTokens(data.tokens);
      } catch (e) { console.error('Failed to fetch tokens:', e); }
    };
    fetchTokens();
  }, []);

  useEffect(() => {
    const loadBalances = async () => {
      if (!publicClient || !address || !tokens.length || isOnWrongChain) { setHoldings([]); setLoading(false); return; }
      setLoading(true);
      const results: Holding[] = [];
      for (const token of tokens) {
        try {
          const balance = await publicClient.readContract({ address: token.address as `0x${string}`, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] });
          const bal = balance as bigint;
          if (bal > 0n) results.push({ token, balance: formatEther(bal) });
        } catch {}
      }
      setHoldings(results);
      setLoading(false);
    };
    loadBalances();
  }, [publicClient, address, tokens, isOnWrongChain]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container-editorial pt-16 pb-8">
        <div className="mb-6">
          <div className="text-xs text-neutral-500 mb-2 tracking-widest">BASE</div>
          <h1 className="headline-lg font-editorial mb-1">PORTFOLIO</h1>
          <p className="text-neutral-500 text-sm">Your cc0strategy holdings</p>
        </div>

        {!isConnected ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-neutral-500 mb-6">Connect your wallet to view holdings</p>
            <button onClick={() => connect({ connector: injected() })} className="btn-primary">Connect Wallet</button>
          </div>
        ) : (
          <div className="space-y-6">
            {isOnWrongChain && (
              <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-4 text-yellow-400">
                ⚠️ Please switch to Base
                <button onClick={() => switchChain({ chainId: CHAIN_ID })} className="ml-2 underline hover:no-underline">Switch now</button>
              </div>
            )}

            <div className="card-brutal p-4 flex justify-between items-center">
              <span className="font-mono text-sm text-neutral-400">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <button onClick={() => disconnect()} className="text-neutral-500 hover:text-white text-xs uppercase tracking-wider">Disconnect</button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-neutral-500">Loading holdings...</div>
            ) : holdings.length === 0 ? (
              <div className="card-brutal p-8 text-center">
                <p className="text-neutral-500 mb-4">No holdings found</p>
                <Link href="/browse" className="btn-primary inline-block">Browse Tokens</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {holdings.map((h) => (
                  <Link key={h.token.address} href={`/swap?token=${h.token.address}`} className="block">
                    <div className="card-brutal card-brutal-hover transition-all">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold">{h.token.name}</div>
                          <div className="text-neutral-500 text-sm font-mono">${h.token.symbol}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono">{parseFloat(h.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                          <div className="text-neutral-500 text-xs">{h.token.symbol}</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
