'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect, usePublicClient, useChainId, useSwitchChain } from 'wagmi';
import { formatEther } from 'viem';
import { getContracts, getChainFromId, INDEXER_API } from '@/config/contracts';
import { base, mainnet } from '@/config/wagmi';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

interface Token {
  address: string;
  symbol: string;
  name: string;
  chain: string;
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
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const currentChain = getChainFromId(chainId);

  // Fetch tokens
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
    };
    fetchTokens();
  }, []);

  // Fetch balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (!publicClient || !address || tokens.length === 0) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const chainTokens = tokens.filter(t => 
        (t.chain || 'base') === currentChain
      );

      const results: Holding[] = [];
      
      for (const token of chainTokens) {
        try {
          const balance = await publicClient.readContract({
            address: token.address as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          });
          
          if (balance > 0n) {
            results.push({
              token,
              balance: formatEther(balance),
            });
          }
        } catch (e) {
          // Skip tokens that fail
        }
      }

      setHoldings(results);
      setLoading(false);
    };

    fetchBalances();
  }, [publicClient, address, tokens, currentChain]);

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black tracking-tight mb-1">PORTFOLIO</h1>
        <p className="text-neutral-500 text-sm">Your cc0strategy holdings</p>
      </div>

      {!isConnected ? (
        <div className="border-2 border-white p-8 text-center">
          <h2 className="text-xl font-black mb-4">CONNECT WALLET</h2>
          <button
            onClick={() => connect({ connector: connectors[0] })}
            className="bg-white text-black px-8 py-3 font-bold hover:bg-neutral-200 transition-colors"
          >
            CONNECT
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Wallet Info */}
          <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              <span className="font-mono text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
            </div>
            <button onClick={() => disconnect()} className="text-neutral-500 hover:text-white text-sm">
              Disconnect
            </button>
          </div>

          {/* Chain Switcher */}
          <div className="flex gap-2">
            <button
              onClick={() => switchChain({ chainId: base.id })}
              className={`flex-1 py-2 font-bold text-sm border-2 transition-colors ${
                currentChain === 'base' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
              }`}
            >
              BASE
            </button>
            <button
              onClick={() => switchChain({ chainId: mainnet.id })}
              className={`flex-1 py-2 font-bold text-sm border-2 transition-colors ${
                currentChain === 'ethereum' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
              }`}
            >
              ETHEREUM
            </button>
          </div>

          {/* Holdings */}
          {loading ? (
            <div className="text-center py-8 text-neutral-500">Loading holdings...</div>
          ) : holdings.length === 0 ? (
            <div className="border border-neutral-800 p-8 text-center">
              <p className="text-neutral-500 mb-4">No cc0strategy tokens found on {currentChain?.toUpperCase()}</p>
              <Link
                href="/swap"
                className="inline-block px-6 py-2 border border-white hover:bg-white hover:text-black transition-colors text-sm font-bold"
              >
                BUY TOKENS
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {holdings.map(holding => (
                <div key={holding.token.address} className="border-2 border-neutral-800 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-black">${holding.token.symbol}</h3>
                      <p className="text-neutral-500 text-xs">{holding.token.name}</p>
                    </div>
                  </div>
                  <div className="font-mono text-lg mb-3">
                    {parseFloat(holding.balance).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/swap?token=${holding.token.address}`}
                      className="flex-1 py-2 text-center font-bold text-xs border border-white hover:bg-white hover:text-black transition-colors"
                    >
                      TRADE
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {holdings.length > 0 && (
            <div className="border border-neutral-800 p-4">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 text-sm">Total Tokens</span>
                <span className="font-black">{holdings.length}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
