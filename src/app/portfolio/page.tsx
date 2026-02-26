'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAccount, useConnect, useDisconnect, usePublicClient, useBalance } from 'wagmi';
import { formatUnits, formatEther } from 'viem';
import { CONTRACTS } from '@/config/contracts';

// Types
interface Token {
  id: number;
  address: string;
  name: string;
  symbol: string;
  nft_collection: string;
  pool_id: string;
  deployer: string;
  image_url: string | null;
  deployed_at: string | null;
  created_at: string;
  chain: string;
}

interface PriceData {
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  fdv: number;
  liquidity: number;
}

interface TokenHolding {
  token: Token;
  balance: string;
  balanceFormatted: number;
  priceUsd: number;
  valueUsd: number;
  priceChange24h: number;
}

interface NFTRewardsByToken {
  [tokenAddress: string]: string;
}

interface NFTHolding {
  contractAddress: string;
  tokenId: string;
  name: string;
  image: string | null;
  collectionName: string | null;
  chain: string;
  rewardsByToken: NFTRewardsByToken;
  totalRewards: string;
}

type TabType = 'tokens' | 'nfts';

// Fee Distributor ABI for claimable check
const FEE_DISTRIBUTOR_ABI = [
  {
    name: 'claimable',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: 'amount', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Helper functions
function formatUsd(num: number): string {
  if (num === 0) return '$0.00';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  if (num < 0.01 && num > 0) return '<$0.01';
  return `$${num.toFixed(2)}`;
}

function formatBalance(num: number): string {
  if (num === 0) return '0';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  if (num < 0.0001 && num > 0) return num.toExponential(2);
  return num.toFixed(4);
}

function formatPrice(num: number): string {
  if (num === 0) return '—';
  return `$${num.toFixed(8)}`;
}

function getImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

// Components
function PriceChange({ change }: { change: number }) {
  if (change === 0) return <span className="text-neutral-500">—</span>;
  const isPositive = change >= 0;
  return (
    <span className={`font-mono text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
      {isPositive ? '+' : ''}{change.toFixed(2)}%
    </span>
  );
}

function TabSwitcher({ active, onChange }: { active: TabType; onChange: (tab: TabType) => void }) {
  return (
    <div className="flex border-2 border-white">
      <button
        onClick={() => onChange('tokens')}
        className={`flex-1 px-6 py-3 font-bold text-sm transition-colors ${
          active === 'tokens' 
            ? 'bg-white text-black' 
            : 'bg-black text-white hover:bg-neutral-900'
        }`}
      >
        TOKENS
      </button>
      <button
        onClick={() => onChange('nfts')}
        className={`flex-1 px-6 py-3 font-bold text-sm transition-colors border-l-2 border-white ${
          active === 'nfts' 
            ? 'bg-white text-black' 
            : 'bg-black text-white hover:bg-neutral-900'
        }`}
      >
        NFTs
      </button>
    </div>
  );
}

function TokenFilter({ 
  tokens, 
  selectedToken, 
  onSelect 
}: { 
  tokens: Token[]; 
  selectedToken: string | null; 
  onSelect: (address: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 text-xs font-bold border transition-colors ${
          selectedToken === null
            ? 'bg-white text-black border-white'
            : 'bg-black text-white border-neutral-600 hover:border-white'
        }`}
      >
        ALL TOKENS
      </button>
      {tokens.map((token) => (
        <button
          key={token.address}
          onClick={() => onSelect(token.address)}
          className={`px-3 py-1.5 text-xs font-bold border transition-colors ${
            selectedToken === token.address
              ? 'bg-white text-black border-white'
              : 'bg-black text-white border-neutral-600 hover:border-white'
          }`}
        >
          ${token.symbol}
        </button>
      ))}
    </div>
  );
}

function TokenImage({ imageUrl, symbol }: { imageUrl: string | null; symbol: string }) {
  const [error, setError] = useState(false);
  const url = getImageUrl(imageUrl);
  
  if (!url || error) {
    return (
      <div className="w-10 h-10 bg-neutral-900 border border-neutral-700 flex items-center justify-center text-xs font-mono text-neutral-500 flex-shrink-0">
        {symbol.slice(0, 2)}
      </div>
    );
  }
  
  return (
    <div className="w-10 h-10 relative bg-neutral-900 border border-neutral-700 overflow-hidden flex-shrink-0">
      <Image
        src={url}
        alt={symbol}
        fill
        className="object-cover"
        onError={() => setError(true)}
        unoptimized
      />
    </div>
  );
}

// Token Row Component
function TokenHoldingRow({ holding, index }: { holding: TokenHolding; index: number }) {
  return (
    <Link 
      href={`/swap?token=${holding.token.address}`}
      className="grid grid-cols-12 items-center py-4 px-4 border-b border-neutral-800 hover:bg-neutral-900 transition-colors group"
    >
      {/* Rank */}
      <div className="col-span-1 text-neutral-500 font-mono text-sm hidden md:block">
        #{String(index + 1).padStart(2, '0')}
      </div>
      
      {/* Token Info */}
      <div className="col-span-5 md:col-span-3 flex items-center gap-3">
        <TokenImage imageUrl={holding.token.image_url} symbol={holding.token.symbol} />
        <div className="min-w-0">
          <div className="font-bold text-white group-hover:underline truncate">
            {holding.token.name}
          </div>
          <div className="text-neutral-500 text-sm font-mono">
            ${holding.token.symbol}
          </div>
        </div>
      </div>
      
      {/* Balance */}
      <div className="col-span-3 md:col-span-2 text-right">
        <div className="font-mono text-sm">{formatBalance(holding.balanceFormatted)}</div>
        <div className="text-neutral-500 text-xs">{holding.token.symbol}</div>
      </div>
      
      {/* Price */}
      <div className="col-span-2 text-right hidden md:block">
        <div className="font-mono text-sm">{formatPrice(holding.priceUsd)}</div>
      </div>
      
      {/* Value */}
      <div className="col-span-4 md:col-span-2 text-right">
        <div className="font-mono font-bold">{formatUsd(holding.valueUsd)}</div>
        <PriceChange change={holding.priceChange24h} />
      </div>
      
      {/* 24h % (desktop only) */}
      <div className="col-span-2 text-right hidden md:block">
        <PriceChange change={holding.priceChange24h} />
      </div>
    </Link>
  );
}

// NFT Card Component
function NFTCard({ nft, displayRewards }: { nft: NFTHolding; displayRewards: string }) {
  const [imageError, setImageError] = useState(false);
  const rewardsNum = parseFloat(displayRewards);
  const hasPendingRewards = rewardsNum > 0;
  
  return (
    <Link 
      href="/claim"
      className="border-2 border-neutral-800 hover:border-white transition-colors group"
    >
      {/* Image */}
      <div className="aspect-square bg-neutral-900 relative overflow-hidden">
        {nft.image && !imageError ? (
          <img
            src={nft.image}
            alt={nft.name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-600 text-2xl font-bold">
            #{nft.tokenId}
          </div>
        )}
        
        {/* Pending rewards badge */}
        {hasPendingRewards && (
          <div className="absolute top-2 left-2 bg-green-500 text-black px-2 py-0.5 text-[10px] font-bold">
            REWARDS
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="p-3 border-t border-neutral-800">
        {/* Collection Name */}
        <div className="font-mono font-bold text-sm truncate">
          {nft.collectionName || 'Unknown Collection'}
        </div>
        
        {/* Token ID */}
        <div className="text-neutral-500 text-xs">#{nft.tokenId}</div>
        
        {/* Claimable WETH - full decimals, smaller font */}
        {hasPendingRewards && (
          <div className="mt-2 pt-2 border-t border-neutral-800">
            <div className="font-mono text-green-500 text-[10px] font-bold break-all leading-tight">
              {displayRewards} WETH
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

// Main Component
export default function PortfolioPage() {
  const { isConnected, address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient();
  
  // Get ETH balance
  const { data: ethBalance } = useBalance({
    address: address,
  });
  
  const [activeTab, setActiveTab] = useState<TabType>('tokens');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [nftHoldings, setNftHoldings] = useState<NFTHolding[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadingNfts, setLoadingNfts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTokenFilter, setSelectedTokenFilter] = useState<string | null>(null);

  // Get unique tokens that have NFT collections (for filter)
  const tokensWithNfts = useMemo(() => {
    return tokens.filter(t => 
      t.nft_collection && 
      t.nft_collection !== '0x0000000000000000000000000000000000000000'
    );
  }, [tokens]);

  // Total portfolio value
  const totalValue = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.valueUsd, 0);
  }, [holdings]);

  // Fetch cc0strategy tokens list (Base only)
  useEffect(() => {
    fetch('/api/tokens')
      .then(res => res.json())
      .then(data => {
        if (data.tokens) {
          const baseTokens = data.tokens.filter((t: Token) => !t.chain || t.chain === 'base');
          setTokens(baseTokens);
        }
      })
      .catch(e => console.error('Failed to fetch tokens:', e));
  }, []);

  // Fetch token balances when wallet connects
  useEffect(() => {
    if (!isConnected || !address || tokens.length === 0) {
      setHoldings([]);
      return;
    }

    const fetchBalances = async () => {
      setLoadingTokens(true);
      setError(null);

      try {
        const tokenList = tokens.map(t => ({ address: t.address, chain: 'base' }));

        const res = await fetch('/api/portfolio/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, tokens: tokenList }),
        });

        if (!res.ok) throw new Error('Failed to fetch balances');
        
        const data = await res.json();
        const balances = data.balances || {};

        const pricesRes = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: tokenList }),
        });

        let prices: Record<string, PriceData> = {};
        if (pricesRes.ok) {
          const pricesData = await pricesRes.json();
          prices = pricesData.prices || {};
        }

        const newHoldings: TokenHolding[] = [];
        
        for (const token of tokens) {
          const balanceInfo = balances[token.address.toLowerCase()];
          if (!balanceInfo) continue;

          const balanceDecimal = balanceInfo.balanceDecimal;
          if (!balanceDecimal || balanceDecimal === '0') continue;

          const balanceFormatted = parseFloat(formatUnits(BigInt(balanceDecimal), 18));
          
          const price = prices[token.address.toLowerCase()];
          const priceUsd = price?.priceUsd || 0;
          const valueUsd = balanceFormatted * priceUsd;
          const priceChange24h = price?.priceChange24h || 0;

          newHoldings.push({
            token,
            balance: balanceDecimal,
            balanceFormatted,
            priceUsd,
            valueUsd,
            priceChange24h,
          });
        }

        newHoldings.sort((a, b) => b.valueUsd - a.valueUsd);
        setHoldings(newHoldings);

      } catch (e: unknown) {
        console.error('Error fetching balances:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      }

      setLoadingTokens(false);
    };

    fetchBalances();
  }, [isConnected, address, tokens]);

  // Fetch NFTs when switching to NFTs tab
  useEffect(() => {
    if (activeTab !== 'nfts' || !isConnected || !address || tokens.length === 0) {
      return;
    }

    const fetchNfts = async () => {
      setLoadingNfts(true);
      setError(null);

      try {
        const collections = tokens
          .filter(t => t.nft_collection && t.nft_collection !== '0x0000000000000000000000000000000000000000')
          .map(t => ({ address: t.nft_collection, chain: 'base' }));

        if (collections.length === 0) {
          setNftHoldings([]);
          setLoadingNfts(false);
          return;
        }

        const res = await fetch('/api/portfolio/nfts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, collections }),
        });

        if (!res.ok) throw new Error('Failed to fetch NFTs');
        
        const data = await res.json();
        const nfts = data.nfts || [];

        const nftHoldingsWithRewards: NFTHolding[] = [];

        for (const nft of nfts) {
          const linkedTokens = tokens.filter(
            t => t.nft_collection.toLowerCase() === nft.contractAddress.toLowerCase()
          );

          const rewardsByToken: NFTRewardsByToken = {};
          let totalRewards = BigInt(0);

          if (linkedTokens.length > 0 && publicClient) {
            for (const token of linkedTokens) {
              try {
                const amount = await publicClient.readContract({
                  address: CONTRACTS.FEE_DISTRIBUTOR as `0x${string}`,
                  abi: FEE_DISTRIBUTOR_ABI,
                  functionName: 'claimable',
                  args: [token.address as `0x${string}`, BigInt(nft.tokenId)],
                });
                const amountBigInt = amount as bigint;
                rewardsByToken[token.address.toLowerCase()] = amountBigInt.toString();
                totalRewards += amountBigInt;
              } catch (e) {
                rewardsByToken[token.address.toLowerCase()] = '0';
              }
            }
          }

          nftHoldingsWithRewards.push({
            ...nft,
            rewardsByToken,
            totalRewards: totalRewards.toString(),
          });
        }

        nftHoldingsWithRewards.sort((a, b) => {
          const rewardsA = BigInt(a.totalRewards);
          const rewardsB = BigInt(b.totalRewards);
          if (rewardsA !== rewardsB) return rewardsA > rewardsB ? -1 : 1;
          return parseInt(a.tokenId) - parseInt(b.tokenId);
        });

        setNftHoldings(nftHoldingsWithRewards);

      } catch (e: unknown) {
        console.error('Error fetching NFTs:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      }

      setLoadingNfts(false);
    };

    fetchNfts();
  }, [activeTab, isConnected, address, tokens, publicClient]);

  // Calculate display rewards based on filter
  const getDisplayRewards = (nft: NFTHolding): string => {
    if (selectedTokenFilter === null) {
      return formatEther(BigInt(nft.totalRewards));
    } else {
      const tokenRewards = nft.rewardsByToken[selectedTokenFilter.toLowerCase()] || '0';
      return formatEther(BigInt(tokenRewards));
    }
  };

  // Total pending rewards (respects filter)
  const totalPendingRewards = useMemo(() => {
    if (selectedTokenFilter === null) {
      return nftHoldings.reduce((sum, n) => sum + parseFloat(formatEther(BigInt(n.totalRewards))), 0);
    } else {
      return nftHoldings.reduce((sum, n) => {
        const tokenRewards = n.rewardsByToken[selectedTokenFilter.toLowerCase()] || '0';
        return sum + parseFloat(formatEther(BigInt(tokenRewards)));
      }, 0);
    }
  }, [nftHoldings, selectedTokenFilter]);

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Hero */}
      <div className="border-b-2 border-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="text-xs text-neutral-500 mb-2 tracking-widest font-mono">YOUR HOLDINGS</div>
          <h1 className="text-2xl font-black tracking-tight mb-1">
            PORTFOLIO
          </h1>
          <p className="text-neutral-400 text-sm">
            View your CC0STRATEGY tokens and NFTs on Base
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {!isConnected ? (
          <div className="border-2 border-white p-8 text-center">
            <h2 className="text-xl font-black mb-4">CONNECT WALLET</h2>
            <p className="text-neutral-500 mb-6">Connect your wallet to view your portfolio</p>
            <button 
              onClick={() => connect({ connector: connectors[0] })} 
              className="bg-white text-black px-8 py-3 font-bold hover:bg-neutral-200 transition-colors"
            >
              CONNECT
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Wallet Info */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-white rounded-full"></div>
                <span className="font-mono text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </div>
              <button onClick={() => disconnect()} className="text-neutral-500 hover:text-white text-sm">
                Disconnect
              </button>
            </div>

            {/* Balance Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* ETH Balance */}
              <div className="border-2 border-white p-4">
                <div className="text-xs font-bold tracking-widest text-neutral-500 mb-2 font-mono">
                  ETH BALANCE
                </div>
                <div className="text-2xl font-black font-mono">
                  {ethBalance ? parseFloat(formatEther(ethBalance.value)).toFixed(4) : '0.0000'}
                </div>
                <div className="text-neutral-500 text-xs font-mono">ETH</div>
              </div>

              {/* Total Portfolio Value */}
              <div className="border-2 border-white p-4">
                <div className="text-xs font-bold tracking-widest text-neutral-500 mb-2 font-mono">
                  PORTFOLIO VALUE
                </div>
                <div className="text-2xl font-black font-mono">
                  {formatUsd(totalValue)}
                </div>
                <div className="text-neutral-500 text-xs font-mono">USD</div>
              </div>
            </div>

            {/* Pending Rewards (NFTs tab) */}
            {activeTab === 'nfts' && totalPendingRewards > 0 && (
              <div className="border-2 border-green-500 p-4">
                <div className="text-xs font-bold tracking-widest text-neutral-500 mb-1 font-mono">
                  {selectedTokenFilter ? 'FILTERED PENDING REWARDS' : 'TOTAL PENDING REWARDS'}
                </div>
                <div className="text-xl font-bold font-mono text-green-500">
                  {totalPendingRewards.toFixed(18)} WETH
                </div>
                <Link 
                  href="/claim" 
                  className="inline-block mt-2 text-sm text-white underline hover:no-underline"
                >
                  Claim all rewards →
                </Link>
              </div>
            )}

            {/* Tab Switcher */}
            <TabSwitcher active={activeTab} onChange={setActiveTab} />

            {/* Token Filter (NFTs tab only) */}
            {activeTab === 'nfts' && tokensWithNfts.length > 0 && (
              <div className="border border-neutral-800 p-3">
                <div className="text-[10px] text-neutral-500 font-mono mb-2 tracking-widest">FILTER BY TOKEN</div>
                <TokenFilter 
                  tokens={tokensWithNfts} 
                  selectedToken={selectedTokenFilter} 
                  onSelect={setSelectedTokenFilter} 
                />
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="border-2 border-red-500 p-4">
                <p className="text-red-400 font-mono text-sm">{error}</p>
              </div>
            )}

            {/* Tokens Tab */}
            {activeTab === 'tokens' && (
              <>
                {loadingTokens ? (
                  <div className="border-2 border-white p-8 text-center">
                    <div className="text-4xl mb-4 animate-pulse">◐</div>
                    <p className="text-neutral-400">Loading token balances...</p>
                  </div>
                ) : holdings.length === 0 ? (
                  <div className="border-2 border-white p-8 text-center">
                    <div className="text-4xl mb-4">∅</div>
                    <h2 className="text-xl font-bold mb-4">NO TOKENS FOUND</h2>
                    <p className="text-neutral-500 mb-6">
                      You don&apos;t hold any CC0STRATEGY tokens yet
                    </p>
                    <Link 
                      href="/browse" 
                      className="inline-block border-2 border-white px-6 py-3 hover:bg-white hover:text-black transition-colors"
                    >
                      BROWSE TOKENS
                    </Link>
                  </div>
                ) : (
                  <div className="border-2 border-white">
                    {/* Header */}
                    <div className="hidden md:grid grid-cols-12 items-center py-3 px-4 border-b-2 border-white text-xs tracking-widest text-neutral-500 font-mono">
                      <div className="col-span-1">#</div>
                      <div className="col-span-3">TOKEN</div>
                      <div className="col-span-2 text-right">BALANCE</div>
                      <div className="col-span-2 text-right">PRICE</div>
                      <div className="col-span-2 text-right">VALUE</div>
                      <div className="col-span-2 text-right">24H %</div>
                    </div>
                    
                    {/* Mobile Header */}
                    <div className="md:hidden grid grid-cols-12 items-center py-3 px-4 border-b-2 border-white text-xs tracking-widest text-neutral-500 font-mono">
                      <div className="col-span-5">TOKEN</div>
                      <div className="col-span-3 text-right">BALANCE</div>
                      <div className="col-span-4 text-right">VALUE</div>
                    </div>
                    
                    {/* Token Rows */}
                    {holdings.map((holding, index) => (
                      <TokenHoldingRow 
                        key={holding.token.address} 
                        holding={holding} 
                        index={index} 
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* NFTs Tab */}
            {activeTab === 'nfts' && (
              <>
                {loadingNfts ? (
                  <div className="border-2 border-white p-8 text-center">
                    <div className="text-4xl mb-4 animate-pulse">◐</div>
                    <p className="text-neutral-400">Loading NFTs...</p>
                  </div>
                ) : nftHoldings.length === 0 ? (
                  <div className="border-2 border-white p-8 text-center">
                    <div className="text-4xl mb-4">∅</div>
                    <h2 className="text-xl font-bold mb-4">NO NFTs FOUND</h2>
                    <p className="text-neutral-500 mb-6">
                      You don&apos;t hold any NFTs linked to CC0STRATEGY tokens
                    </p>
                    <Link 
                      href="/browse" 
                      className="inline-block border-2 border-white px-6 py-3 hover:bg-white hover:text-black transition-colors"
                    >
                      BROWSE TOKENS
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {nftHoldings.map((nft) => (
                      <NFTCard 
                        key={`${nft.contractAddress}-${nft.tokenId}`} 
                        nft={nft}
                        displayRewards={getDisplayRewards(nft)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Footer Info */}
            <div className="text-[10px] text-neutral-600 font-mono space-y-0.5">
              <p>• Token balances fetched via Alchemy API</p>
              <p>• Price data from GeckoTerminal</p>
              <p>• Rewards from FeeDistributor contract</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
