// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBalance, useSwitchChain, useChainId, useSignTypedData } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseEther, formatEther, formatUnits, keccak256, concat, pad, toHex, hexToBigInt, parseAbi, encodeAbiParameters, maxUint256, numberToHex } from 'viem';
import { CONTRACTS, getContracts, getChainFromId, CHAIN_IDS, BLOCK_EXPLORERS, hasDeployedContracts, type SupportedChain } from '@/config/contracts';
import { base, mainnet } from '@/config/wagmi';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

// ABIs
const ERC20_ABI = [
  { name: 'symbol', type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'name', type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'decimals', type: 'function', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const FACTORY_ABI = [
  {
    name: 'TokenCreated',
    type: 'event',
    inputs: [
      { name: 'msgSender', type: 'address', indexed: false },
      { name: 'tokenAddress', type: 'address', indexed: true },
      { name: 'tokenAdmin', type: 'address', indexed: true },
      { name: 'tokenImage', type: 'string', indexed: false },
      { name: 'tokenName', type: 'string', indexed: false },
      { name: 'tokenSymbol', type: 'string', indexed: false },
      { name: 'tokenMetadata', type: 'string', indexed: false },
      { name: 'tokenContext', type: 'string', indexed: false },
      { name: 'startingTick', type: 'int24', indexed: false },
      { name: 'poolHook', type: 'address', indexed: false },
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'poolPairedToken', type: 'address', indexed: false },
      { name: 'poolTickSpacing', type: 'int24', indexed: false },
      { name: 'lockerAddress', type: 'address', indexed: false },
    ],
  },
] as const;

const EXTSLOAD_ABI = parseAbi([
  'function extsload(bytes32 slot) view returns (bytes32)',
]);

const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

// Permit2 ABI
const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
    stateMutability: 'view',
  },
] as const;

// Permit2 EIP-712 types for signing
const PERMIT2_DOMAIN = (chainId: number, permit2Address: `0x${string}`) => ({
  name: 'Permit2',
  chainId,
  verifyingContract: permit2Address,
});

const PERMIT_TYPES = {
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
} as const;

// Token info interface
interface TokenInfo {
  website_url?: string | null;
  twitter_url?: string | null;
  telegram_url?: string | null;
  discord_url?: string | null;
  address: `0x${string}`;
  symbol: string;
  name: string;
  poolId: `0x${string}`;
  chain: SupportedChain;
  image_url?: string | null;
  nft_collection?: string;
}

// Price data interface
interface PriceData {
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  fdv: number;
  liquidity: number;
}

// Constants
const POOLS_SLOT = 6n;
const Q96 = BigInt(2 ** 96);

// Universal Router command codes
const WRAP_ETH = 0x0b;
const UNWRAP_ETH = 0x0c;
const V4_SWAP = 0x10;
const PERMIT2_PERMIT = 0x0a;

// V4 action codes (from Uniswap v4-periphery Actions.sol)
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE = 0x0b;
const SETTLE_ALL = 0x0c;
const SETTLE_PAIR = 0x0d;
const TAKE = 0x0e;
const TAKE_ALL = 0x0f;
const TAKE_PAIR = 0x11;

// ADDRESS_THIS constant for Universal Router
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as `0x${string}`;

// Helper to encode ExactInputSingleParams in ABI calldata format
function encodeExactInputSingleParams(
  poolKey: { currency0: `0x${string}`; currency1: `0x${string}`; fee: number; tickSpacing: number; hooks: `0x${string}` },
  zeroForOne: boolean,
  amountIn: bigint,
  amountOutMinimum: bigint,
  hookData: `0x${string}`
): `0x${string}` {
  const hookDataBytes = hookData === '0x' ? '0x' : hookData;
  const hookDataLength = hookDataBytes === '0x' ? 0 : (hookDataBytes.length - 2) / 2;
  const hookDataOffset = 0x120;
  
  return concat([
    pad(toHex(0x20), { size: 32 }),
    pad(poolKey.currency0, { size: 32 }),
    pad(poolKey.currency1, { size: 32 }),
    pad(toHex(poolKey.fee), { size: 32 }),
    pad(toHex(poolKey.tickSpacing), { size: 32 }),
    pad(poolKey.hooks, { size: 32 }),
    pad(toHex(zeroForOne ? 1 : 0), { size: 32 }),
    pad(toHex(amountIn), { size: 32 }),
    pad(toHex(amountOutMinimum), { size: 32 }),
    pad(toHex(hookDataOffset), { size: 32 }),
    pad(toHex(hookDataLength), { size: 32 }),
    ...(hookDataLength > 0 ? [pad(hookDataBytes as `0x${string}`, { size: Math.ceil(hookDataLength / 32) * 32 })] : []),
  ]) as `0x${string}`;
}

// Format numbers with abbreviations
function formatCompact(num: number): string {
  if (num === 0) return '—';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  if (num < 0.01 && num > 0) return '<$0.01';
  return `$${num.toFixed(2)}`;
}

// Format price
function formatPrice(num: number): string {
  if (num === 0) return '—';
  if (num < 0.00000001) return `$${num.toExponential(2)}`;
  if (num < 0.0001) return `$${num.toFixed(8)}`;
  if (num < 1) return `$${num.toFixed(6)}`;
  return `$${num.toFixed(2)}`;
}

// Convert IPFS URLs to gateway URLs
function getImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

// Token Image component
function TokenImage({ imageUrl, symbol, size = 'md' }: { imageUrl: string | null | undefined; symbol: string; size?: 'sm' | 'md' | 'lg' }) {
  const [error, setError] = useState(false);
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };
  
  const resolvedUrl = getImageUrl(imageUrl);
  if (!resolvedUrl || error) {
    return (
      <div className={`${sizeClasses[size]} bg-neutral-900 border border-neutral-700 flex items-center justify-center text-xs font-mono text-neutral-500 flex-shrink-0`}>
        {symbol?.slice(0, 2) || '??'}
      </div>
    );
  }
  
  return (
    <div className={`${sizeClasses[size]} relative bg-neutral-900 border border-neutral-700 overflow-hidden flex-shrink-0`}>
      <Image
        src={resolvedUrl}
        alt={symbol}
        fill
        className="object-cover"
        onError={() => setError(true)}
        unoptimized
      />
    </div>
  );
}

// Chain Badge component
function ChainBadge({ chain }: { chain: string }) {
  const isBase = chain === 'base';
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold rounded ${
      isBase ? 'bg-blue-900/50 text-blue-400' : 'bg-neutral-800 text-neutral-300 border border-neutral-600'
    }`}>
      {isBase ? (
        <>
          <svg className="w-3 h-3" viewBox="0 0 111 111" fill="currentColor">
            <path d="M54.921 110.034c30.354 0 54.967-24.593 54.967-54.921S85.275.191 54.921.191C26.043.191 2.003 22.567.142 51.031h71.858v7.983H.141c1.858 28.464 25.9 51.02 54.78 51.02Z"/>
          </svg>
          BASE
        </>
      ) : (
        <>
          <svg className="w-3 h-3" viewBox="0 0 784 784" fill="currentColor">
            <path d="M392 0L0 392l392 392 392-392L392 0zM196 392L392 196l196 196-196 196-196-196z"/>
          </svg>
          ETH
        </>
      )}
    </div>
  );
}

// Price Change component
function PriceChange({ change, size = 'md' }: { change: number; size?: 'sm' | 'md' }) {
  if (change === 0) return <span className="text-neutral-500">—</span>;
  const isPositive = change >= 0;
  const sizeClass = size === 'sm' ? 'text-xs' : 'text-sm';
  return (
    <span className={`font-mono ${sizeClass} ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
      {isPositive ? '+' : ''}{change.toFixed(2)}%
    </span>
  );
}


// Social Link Icons
function XIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

// Social Links component
function SocialLinks({ token }: { token: TokenInfo }) {
  const links = [
    { url: token.website_url, icon: GlobeIcon, label: 'Website' },
    { url: token.twitter_url, icon: XIcon, label: 'X (Twitter)' },
    { url: token.telegram_url, icon: TelegramIcon, label: 'Telegram' },
    { url: token.discord_url, icon: DiscordIcon, label: 'Discord' },
  ].filter(l => l.url);
  
  if (links.length === 0) return null;
  
  return (
    <div className="flex items-center gap-2">
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url!}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 border border-neutral-700 hover:border-white hover:bg-white hover:text-black transition-colors"
          title={link.label}
        >
          <link.icon />
        </a>
      ))}
    </div>
  );
}


// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-neutral-800 transition-colors"
      title="Copy address"
    >
      {copied ? (
        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-neutral-500 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

// Token Header component
function TokenHeader({ token, priceData }: { token: TokenInfo | null; priceData: PriceData | null }) {
  if (!token) return null;
  
  const truncatedAddress = `${token.address.slice(0, 6)}...${token.address.slice(-4)}`;
  const openSeaUrl = token.nft_collection 
    ? `https://opensea.io/assets/${token.chain === 'ethereum' ? 'ethereum' : 'base'}/${token.nft_collection}`
    : null;
  
  return (
    <div className="border-2 border-white p-4 md:p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        {/* Token Identity */}
        <div className="flex items-start gap-4">
          <TokenImage imageUrl={token.image_url} symbol={token.symbol} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="font-editorial text-xl md:text-3xl">{token.name}</h2>
              <ChainBadge chain={token.chain} />
            </div>
            <div className="text-neutral-400 font-mono mb-1">${token.symbol}</div>
            <div className="flex items-center gap-1">
              <span className="text-neutral-500 font-mono text-xs md:text-sm">{truncatedAddress}</span>
              <CopyButton text={token.address} />
            </div>
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex flex-wrap gap-4 md:gap-8 md:ml-auto">
          <div>
            <div className="text-neutral-500 text-xs mb-1">PRICE</div>
            <div className="font-mono text-lg">{priceData ? formatPrice(priceData.priceUsd) : '—'}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">24H</div>
            <div>{priceData ? <PriceChange change={priceData.priceChange24h} /> : <span className="text-neutral-500">—</span>}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">MARKET CAP</div>
            <div className="font-mono">{priceData && priceData.marketCap > 0 ? formatCompact(priceData.marketCap) : '—'}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">24H VOLUME</div>
            <div className="font-mono">{priceData && priceData.volume24h > 0 ? formatCompact(priceData.volume24h) : '—'}</div>
          </div>
        </div>
        
        {/* Links */}
        <div className="flex items-center gap-2">
          <SocialLinks token={token} />
          {openSeaUrl && (
            <a
              href={openSeaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 border border-neutral-700 hover:border-white hover:bg-white hover:text-black transition-colors text-xs font-bold uppercase tracking-wider"
              title="View NFT Collection on OpenSea"
            >
              OpenSea
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
function TokenSearchBar({ 
  tokens, 
  selectedToken, 
  onSelect,
  isLoading 
}: { 
  tokens: TokenInfo[];
  selectedToken: TokenInfo | null;
  onSelect: (token: TokenInfo) => void;
  isLoading: boolean;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const filteredTokens = useMemo(() => {
    if (!query.trim()) return tokens;
    const q = query.toLowerCase();
    return tokens.filter(t => 
      t.name.toLowerCase().includes(q) || 
      t.symbol.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
    );
  }, [tokens, query]);
  
  return (
    <div ref={wrapperRef} className="relative mb-6">
      <div className="relative">
        <input
          type="text"
          placeholder={isLoading ? "Loading tokens..." : "Search tokens across all chains..."}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full border-2 border-white bg-black px-4 py-3 pr-12 text-sm focus:outline-none placeholder:text-neutral-600 uppercase tracking-wide"
          disabled={isLoading}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
      
      {isOpen && filteredTokens.length > 0 && (
        <div className="absolute z-50 w-full mt-1 border-2 border-white bg-black max-h-80 overflow-y-auto">
          {filteredTokens.map((token) => (
            <button
              key={`${token.chain}-${token.address}`}
              onClick={() => {
                onSelect(token);
                setQuery('');
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-900 transition-colors text-left ${
                selectedToken?.address === token.address && selectedToken?.chain === token.chain ? 'bg-neutral-900' : ''
              }`}
            >
              <TokenImage imageUrl={token.image_url} symbol={token.symbol} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold truncate">{token.name}</span>
                  <ChainBadge chain={token.chain} />
                </div>
                <span className="text-neutral-500 text-sm font-mono">${token.symbol}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      
      {isOpen && query && filteredTokens.length === 0 && (
        <div className="absolute z-50 w-full mt-1 border-2 border-white bg-black p-4 text-center text-neutral-500">
          No tokens found
        </div>
      )}
    </div>
  );
}

function SwapPageContent() {
  const searchParams = useSearchParams();
  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  
  // Determine current chain
  const currentChain = getChainFromId(chainId);
  const chainContracts = currentChain ? getContracts(currentChain) : getContracts('base');
  const blockExplorer = currentChain ? BLOCK_EXPLORERS[currentChain] : BLOCK_EXPLORERS.base;
  
  // Balances
  const { data: ethBalanceData } = useBalance({ address });
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  
  // All tokens (across all chains)
  const [allTokens, setAllTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [inputAmount, setInputAmount] = useState('0.001');
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [swapDirection, setSwapDirection] = useState<'buy' | 'sell'>('buy');
  const [error, setError] = useState<string | null>(null);
  
  // ETH price for USD conversion
  const [ethPrice, setEthPrice] = useState<number>(0);
  
  // Token price data
  const [tokenPriceData, setTokenPriceData] = useState<PriceData | null>(null);
  
  // Approval state for sell
  const [needsTokenApproval, setNeedsTokenApproval] = useState(false);
  const [permit2Nonce, setPermit2Nonce] = useState<number>(0);
  const [isSigningPermit, setIsSigningPermit] = useState(false);
  
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { signTypedDataAsync } = useSignTypedData();

  // Log write contract errors
  useEffect(() => {
    if (writeError) {
      console.error('writeContract error:', writeError);
      setError(writeError.message || 'Transaction failed');
    }
  }, [writeError]);

  // Fetch ETH price
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        setEthPrice(data.ethereum?.usd || 0);
      } catch (e) {
        console.error('Failed to fetch ETH price:', e);
      }
    };
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load ALL tokens from API (both chains)
  useEffect(() => {
    const loadTokens = async () => {
      setIsLoadingTokens(true);
      setError(null);
      
      try {
        // Fetch all tokens (no chain filter)
        const response = await fetch('/api/tokens');
        const data = await response.json();
        
        if (data.error) {
          console.error('API error:', data.error);
          setError(`Failed to load tokens: ${data.error}`);
          setAllTokens([]);
          setIsLoadingTokens(false);
          return;
        }
        
        if (data.tokens && Array.isArray(data.tokens) && data.tokens.length > 0) {
          const tokens = data.tokens
            .filter((t: any) => t && t.address && t.pool_id)
            .map((t: any) => {
              let poolIdHex: string = t.pool_id;
              if (typeof poolIdHex === 'string') {
                if (poolIdHex.startsWith('\\x')) {
                  poolIdHex = '0x' + poolIdHex.slice(2);
                } else if (!poolIdHex.startsWith('0x')) {
                  poolIdHex = '0x' + poolIdHex;
                }
              } else {
                poolIdHex = `0x${Buffer.from(poolIdHex).toString('hex')}`;
              }
              
              return {
                address: t.address as `0x${string}`,
                symbol: t.symbol || 'UNKNOWN',
                name: t.name || 'Unknown Token',
                poolId: poolIdHex as `0x${string}`,
                chain: (t.chain || 'base') as SupportedChain,
                image_url: t.image_url,
                website_url: t.website_url,
                twitter_url: t.twitter_url,
                telegram_url: t.telegram_url,
                discord_url: t.discord_url,
                nft_collection: t.nft_collection,
              };
            });
          
          setAllTokens(tokens);
          
          // Check URL param for initial token selection
          const urlToken = searchParams.get('token');
          if (urlToken) {
            const matchingToken = tokens.find((t: TokenInfo) => t.address.toLowerCase() === urlToken.toLowerCase());
            if (matchingToken) {
              setSelectedToken(matchingToken);
            } else if (tokens.length > 0) {
              setSelectedToken(tokens[0]);
            }
          } else if (tokens.length > 0) {
            setSelectedToken(tokens[0]);
          }
        } else {
          setAllTokens([]);
          setSelectedToken(null);
        }
      } catch (e: any) {
        console.error('Error loading tokens:', e);
        setError(`Network error: ${e.message}`);
        setAllTokens([]);
      }
      setIsLoadingTokens(false);
    };

    loadTokens();
  }, [searchParams]);

  // Auto-switch chain when token is selected
  useEffect(() => {
    if (!selectedToken || !isConnected) return;
    
    const targetChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
    if (chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  }, [selectedToken, isConnected, chainId, switchChain]);

  // Fetch token price data
  useEffect(() => {
    if (!selectedToken) {
      setTokenPriceData(null);
      return;
    }
    
    const fetchPrice = async () => {
      try {
        const res = await fetch('/api/prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            tokens: [{ address: selectedToken.address, chain: selectedToken.chain }] 
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          const price = data.prices?.[selectedToken.address.toLowerCase()];
          setTokenPriceData(price || null);
        }
      } catch (e) {
        console.error('Failed to fetch token price:', e);
      }
    };
    
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, [selectedToken]);

  // Load token balance
  useEffect(() => {
    const loadTokenBalance = async () => {
      if (!publicClient || !address || !selectedToken) {
        setTokenBalance(0n);
        return;
      }
      
      // Only load balance if on correct chain
      const tokenChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
      if (chainId !== tokenChainId) {
        setTokenBalance(0n);
        return;
      }
      
      try {
        const balance = await publicClient.readContract({
          address: selectedToken.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        });
        setTokenBalance(balance as bigint);
      } catch (e) {
        console.error('Error loading token balance:', e);
        setTokenBalance(0n);
      }
    };

    loadTokenBalance();
  }, [publicClient, address, selectedToken, isSuccess, chainId]);

  // Check approval for sell (only token → Permit2, not Permit2 → Router)
  useEffect(() => {
    const checkApproval = async () => {
      if (swapDirection !== 'sell') {
        setNeedsTokenApproval(false);
        return;
      }
      
      if (!publicClient || !address || !selectedToken?.address || !inputAmount || !chainContracts?.PERMIT2 || !chainContracts?.UNIVERSAL_ROUTER) {
        setNeedsTokenApproval(false);
        return;
      }
      
      // Only check if on correct chain
      const tokenChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
      if (chainId !== tokenChainId) {
        setNeedsTokenApproval(false);
        return;
      }
      
      if (!selectedToken.address || selectedToken.address.length !== 42) {
        setNeedsTokenApproval(false);
        return;
      }
      
      try {
        const amountIn = parseEther(inputAmount || '0');
        if (amountIn <= 0n) {
          setNeedsTokenApproval(false);
          return;
        }
        
        // Check token allowance to Permit2
        const allowance = await publicClient.readContract({
          address: selectedToken.address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, chainContracts.PERMIT2],
        });
        
        const needsToken = (allowance as bigint) < amountIn;
        setNeedsTokenApproval(needsToken);
        
        // Fetch nonce from permit2 for signing (not for approval check)
        const permit2Allowance = await publicClient.readContract({
          address: chainContracts.PERMIT2,
          abi: PERMIT2_ABI,
          functionName: 'allowance',
          args: [address, selectedToken.address, chainContracts.UNIVERSAL_ROUTER],
        });
        
        if (permit2Allowance && Array.isArray(permit2Allowance)) {
          const [, , nonce] = permit2Allowance as [bigint, number, number];
          setPermit2Nonce(nonce);
        }
      } catch (e) {
        console.error('Error checking approval:', e);
        setNeedsTokenApproval(false);
      }
    };

    checkApproval();
  }, [publicClient, address, selectedToken, inputAmount, swapDirection, isSuccess, chainContracts, chainId]);

  // Calculate quote from sqrtPriceX96
  const calculateQuote = useCallback(async () => {
    if (!publicClient || !chainContracts?.POOL_MANAGER) {
      setQuoteAmount(null);
      return;
    }
    
    if (!selectedToken?.poolId || !selectedToken?.address) {
      setQuoteAmount(null);
      return;
    }
    
    // Only calculate if on correct chain
    const tokenChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
    if (chainId !== tokenChainId) {
      setQuoteAmount(null);
      return;
    }
    
    if (!inputAmount || parseFloat(inputAmount) <= 0 || isNaN(parseFloat(inputAmount))) {
      setQuoteAmount(null);
      return;
    }

    setIsLoadingQuote(true);
    setError(null);

    try {
      if (!selectedToken.poolId || selectedToken.poolId.length < 10) {
        setError('Invalid pool ID');
        setQuoteAmount(null);
        setIsLoadingQuote(false);
        return;
      }
      
      const baseSlot = keccak256(concat([selectedToken.poolId, pad(toHex(POOLS_SLOT), { size: 32 })]));
      
      const slot0Data = await publicClient.readContract({
        address: chainContracts.POOL_MANAGER,
        abi: EXTSLOAD_ABI,
        functionName: 'extsload',
        args: [baseSlot as `0x${string}`],
      });

      if (!slot0Data || slot0Data === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        setError('Pool not initialized');
        setQuoteAmount(null);
        setIsLoadingQuote(false);
        return;
      }

      const slot0BigInt = hexToBigInt(slot0Data as `0x${string}`);
      const sqrtPriceX96 = slot0BigInt & ((1n << 160n) - 1n);
      
      if (sqrtPriceX96 === 0n) {
        setError('Invalid pool state');
        setQuoteAmount(null);
        setIsLoadingQuote(false);
        return;
      }
      
      const inputAmountWei = parseEther(inputAmount);
      const sqrtPriceSq = sqrtPriceX96 * sqrtPriceX96;
      const q96Sq = Q96 * Q96;
      
      let amountOut: bigint;
      
      if (swapDirection === 'buy') {
        amountOut = (inputAmountWei * q96Sq) / sqrtPriceSq;
      } else {
        amountOut = (inputAmountWei * sqrtPriceSq) / q96Sq;
      }

      const amountAfterFee = (amountOut * 98n) / 100n;
      setQuoteAmount(formatEther(amountAfterFee));
    } catch (e: any) {
      console.error('Error calculating quote:', e);
      setError(e?.message || 'Failed to get quote');
      setQuoteAmount(null);
    }
    
    setIsLoadingQuote(false);
  }, [publicClient, selectedToken, inputAmount, swapDirection, chainContracts, chainId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      calculateQuote();
    }, 500);
    return () => clearTimeout(timer);
  }, [calculateQuote]);

  // USD conversion helpers
  const getInputUsdValue = () => {
    if (!inputAmount || !ethPrice) return null;
    const amount = parseFloat(inputAmount);
    if (isNaN(amount) || amount <= 0) return null;
    
    if (swapDirection === 'buy') {
      // Paying ETH
      return amount * ethPrice;
    } else {
      // Paying token
      if (!tokenPriceData?.priceUsd) return null;
      return amount * tokenPriceData.priceUsd;
    }
  };
  
  const getOutputUsdValue = () => {
    if (!quoteAmount || !ethPrice) return null;
    const amount = parseFloat(quoteAmount);
    if (isNaN(amount) || amount <= 0) return null;
    
    if (swapDirection === 'buy') {
      // Receiving token
      if (!tokenPriceData?.priceUsd) return null;
      return amount * tokenPriceData.priceUsd;
    } else {
      // Receiving ETH
      return amount * ethPrice;
    }
  };

  // Handle MAX button
  const handleMax = () => {
    if (swapDirection === 'buy') {
      if (ethBalanceData) {
        const maxEth = ethBalanceData.value - parseEther('0.001');
        if (maxEth > 0n) {
          setInputAmount(formatEther(maxEth));
        }
      }
    } else {
      if (tokenBalance > 0n) {
        setInputAmount(formatEther(tokenBalance));
      }
    }
  };

  // Handle approval - Token to Permit2 (one-time on-chain tx)
  const handleTokenApprove = async () => {
    if (!selectedToken || !address || !chainContracts.PERMIT2) return;
    
    setError(null);
    
    try {
      writeContract({
        address: selectedToken.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [chainContracts.PERMIT2, maxUint256],
      });
    } catch (e: any) {
      console.error('Token approval error:', e);
      setError(e.message || 'Token approval failed');
    }
  };

  // Re-check allowances when approval tx succeeds
  useEffect(() => {
    if (isSuccess && needsTokenApproval) {
      // Token approval just succeeded - re-check allowances immediately
      const recheckAllowances = async () => {
        if (!publicClient || !address || !selectedToken || !chainContracts?.PERMIT2) {
          return;
        }
        
        try {
          const amountIn = parseEther(inputAmount || '0');
          
          // Re-check token allowance to Permit2
          const tokenAllowance = await publicClient.readContract({
            address: selectedToken.address,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, chainContracts.PERMIT2],
          });
          const needsToken = (tokenAllowance as bigint) < amountIn;
          setNeedsTokenApproval(needsToken);
        } catch (e) {
          console.error('Error re-checking allowances:', e);
        }
      };
      
      recheckAllowances();
    }
  }, [isSuccess, needsTokenApproval, publicClient, address, selectedToken, inputAmount, chainContracts]);

  // Build and execute swap
  const handleSwap = async () => {
    if (!address || !selectedToken || !quoteAmount || !chainContracts?.HOOK || !chainContracts?.WETH || !chainContracts?.UNIVERSAL_ROUTER) {
      return;
    }
    
    // Check chain
    const tokenChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
    if (chainId !== tokenChainId) {
      setError('Please switch to the correct chain');
      return;
    }
    
    setError(null);
    
    try {
      const amountIn = parseEther(inputAmount);
      const minAmountOut = parseEther(quoteAmount) * 90n / 100n;
      
      const poolKey = {
        currency0: selectedToken.address.toLowerCase() < chainContracts.WETH.toLowerCase() 
          ? selectedToken.address.toLowerCase() as `0x${string}`
          : chainContracts.WETH.toLowerCase() as `0x${string}`,
        currency1: selectedToken.address.toLowerCase() < chainContracts.WETH.toLowerCase()
          ? chainContracts.WETH.toLowerCase() as `0x${string}`
          : selectedToken.address.toLowerCase() as `0x${string}`,
        fee: 0x800000,
        tickSpacing: 200,
        hooks: chainContracts.HOOK.toLowerCase() as `0x${string}`,
      };
      const hookData = '0x' as `0x${string}`;
      
      if (swapDirection === 'buy') {
        const wrapEthInput = encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }],
          [ADDRESS_THIS, amountIn]
        );
        
        const actions = '0x060b0f' as `0x${string}`;
        const zeroForOne = false;
        
        const swapParams = encodeExactInputSingleParams(
          poolKey,
          zeroForOne,
          amountIn,
          minAmountOut,
          hookData
        );
        
        const settlePairParams = encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }],
          [poolKey.currency1, amountIn, false]
        );
        
        const takePairParams = encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }],
          [poolKey.currency0, 0n]
        );
        
        const v4SwapInput = encodeAbiParameters(
          [{ type: 'bytes' }, { type: 'bytes[]' }],
          [actions, [swapParams, settlePairParams, takePairParams]]
        );
        
        const commands = '0x0b10' as `0x${string}`;
        const inputs = [wrapEthInput, v4SwapInput];
        
        writeContract({
          address: chainContracts.UNIVERSAL_ROUTER,
          abi: UNIVERSAL_ROUTER_ABI,
          functionName: 'execute',
          args: [commands, inputs],
          value: amountIn,
          chainId,
        });
        
      } else {
        // SELL flow: Sign Permit2 signature + swap in ONE transaction
        setIsSigningPermit(true);
        
        try {
          // 1. Sign Permit2 PermitSingle message (off-chain signature)
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 min
          const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
          
          const permitMessage = {
            details: {
              token: selectedToken.address,
              amount: amountIn > BigInt('0xffffffffffffffffffffffffffffffff') 
                ? BigInt('0xffffffffffffffffffffffffffffffff') 
                : amountIn,
              expiration,
              nonce: permit2Nonce,
            },
            spender: chainContracts.UNIVERSAL_ROUTER,
            sigDeadline: deadline,
          };
          
          const signature = await signTypedDataAsync({
            domain: PERMIT2_DOMAIN(chainId, chainContracts.PERMIT2),
            types: PERMIT_TYPES,
            primaryType: 'PermitSingle',
            message: permitMessage,
          });
          
          setIsSigningPermit(false);
          
          // 2. Build swap with permit bundled
          const actions = '0x060b0e' as `0x${string}`;
          const zeroForOne = true;
          
          const swapParams = encodeExactInputSingleParams(
            poolKey,
            zeroForOne,
            amountIn,
            minAmountOut,
            hookData
          );
          
          const settleParams = encodeAbiParameters(
            [{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }],
            [poolKey.currency0, 0n, true]
          );
          
          const takeParams = encodeAbiParameters(
            [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
            [poolKey.currency1, ADDRESS_THIS, 0n]
          );
          
          const v4SwapInput = encodeAbiParameters(
            [{ type: 'bytes' }, { type: 'bytes[]' }],
            [actions, [swapParams, settleParams, takeParams]]
          );
          
          const unwrapEthInput = encodeAbiParameters(
            [{ type: 'address' }, { type: 'uint256' }],
            [address, minAmountOut]
          );
          
          // 3. Encode Permit2 permit input
          // PermitSingle struct: ((token, amount, expiration, nonce), spender, sigDeadline)
          const permit2Input = encodeAbiParameters(
            [
              { type: 'tuple', components: [
                { type: 'tuple', name: 'details', components: [
                  { type: 'address', name: 'token' },
                  { type: 'uint160', name: 'amount' },
                  { type: 'uint48', name: 'expiration' },
                  { type: 'uint48', name: 'nonce' },
                ]},
                { type: 'address', name: 'spender' },
                { type: 'uint256', name: 'sigDeadline' },
              ]},
              { type: 'bytes' },
            ],
            [
              {
                details: {
                  token: selectedToken.address,
                  amount: permitMessage.details.amount,
                  expiration: BigInt(expiration),
                  nonce: BigInt(permit2Nonce),
                },
                spender: chainContracts.UNIVERSAL_ROUTER,
                sigDeadline: deadline,
              },
              signature,
            ]
          );
          
          // Commands: PERMIT2_PERMIT (0x0a) + V4_SWAP (0x10) + UNWRAP_ETH (0x0c)
          const commands = '0x0a100c' as `0x${string}`;
          const inputs = [permit2Input, v4SwapInput, unwrapEthInput];
          
          writeContract({
            address: chainContracts.UNIVERSAL_ROUTER,
            abi: UNIVERSAL_ROUTER_ABI,
            functionName: 'execute',
            args: [commands, inputs],
            value: 0n,
            chainId,
          });
        } catch (e: any) {
          setIsSigningPermit(false);
          console.error('Permit signing error:', e);
          if (e.message?.includes('rejected') || e.message?.includes('denied')) {
            setError('Signature rejected');
          } else {
            setError(e.message || 'Failed to sign permit');
          }
          return;
        }
      }
      
    } catch (e: any) {
      console.error('Swap build error:', e);
      setError(e.message || 'Swap failed');
    }
  };
  
  useEffect(() => {
    if (isSuccess && !needsTokenApproval) {
      resetWrite();
      setInputAmount('0.001');
    }
  }, [isSuccess, needsTokenApproval, resetWrite]);

  const formatDisplayAmount = (amount: string | null) => {
    if (!amount) return null;
    const num = parseFloat(amount);
    if (isNaN(num)) return null;
    if (num < 0.01) return num.toFixed(6);
    return num.toLocaleString(undefined, { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 4 
    });
  };

  const formatBalance = (balance: bigint) => {
    const num = parseFloat(formatEther(balance));
    if (num < 0.0001) return '< 0.0001';
    if (num < 1) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const formatUsd = (value: number | null) => {
    if (!value || value <= 0) return null;
    if (value < 0.01) return '<$0.01';
    return `~$${value.toFixed(2)}`;
  };

  const needsAnyApproval = swapDirection === 'sell' && needsTokenApproval;
  const isOnWrongChain = selectedToken && chainId !== (selectedToken.chain === 'base' ? base.id : mainnet.id);
  const isSwapDisabled = isPending || isConfirming || isSigningPermit || !quoteAmount || isLoadingQuote || needsAnyApproval || !hasDeployedContracts(selectedToken?.chain || 'base') || isOnWrongChain;

  return (
    <div className="w-full px-4 md:px-8 lg:px-12 py-6 md:py-12">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div className="text-xs text-neutral-500 mb-2 tracking-widest">UNISWAP V4</div>
        <h1 className="font-editorial text-3xl md:text-5xl">TRADE</h1>
      </div>
      
      {/* Search Bar */}
      <TokenSearchBar
        tokens={allTokens}
        selectedToken={selectedToken}
        onSelect={setSelectedToken}
        isLoading={isLoadingTokens}
      />
      
      {/* Token Header */}
      <TokenHeader token={selectedToken} priceData={tokenPriceData} />
      
      <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
        {/* GeckoTerminal Chart - 70% width on desktop */}
        <div className="border-2 border-white flex flex-col lg:col-span-8">
          <div className="border-b-2 border-white p-4">
            <span className="font-editorial text-sm uppercase tracking-widest">PRICE CHART</span>
          </div>
          {selectedToken ? (
            <iframe
              src={`https://www.geckoterminal.com/${selectedToken.chain === 'ethereum' ? 'eth' : 'base'}/pools/${selectedToken.address}?embed=1&info=0&swaps=0&grayscale=1`}
              width="100%"
              height="100%" style={{ minHeight: "400px" }}
              frameBorder="0"
              className="bg-black block w-full"
              title="Price Chart"
            />
          ) : (
            <div className="min-h-[400px] flex items-center justify-center text-neutral-600 text-sm">
              Select a token to view chart
            </div>
          )}
        </div>

        {/* Swap Interface - 30% width on desktop */}
        <div className="border-2 border-white lg:col-span-4">
          {!isConnected ? (
            <div className="p-8 md:p-12 text-center">
              <div className="font-editorial text-xl mb-6">WALLET REQUIRED</div>
              <p className="text-neutral-500 mb-8">Connect your wallet to start trading</p>
              <button
                onClick={() => connect({ connector: injected() })}
                className="btn-primary w-full"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <>
              {/* Wallet Info */}
              <div className="border-b-2 border-white p-4 flex justify-between items-center">
                <span className="font-mono text-sm text-neutral-400">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <button 
                  onClick={() => disconnect()} 
                  className="text-neutral-500 hover:text-white text-xs uppercase tracking-wider"
                >
                  Disconnect
                </button>
              </div>

              <div className="p-4 md:p-6 space-y-4 md:space-y-6">
                {/* Chain mismatch warning */}
                {isOnWrongChain && selectedToken && (
                  <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-400">
                    ⚠️ Please switch to {selectedToken.chain === 'ethereum' ? 'Ethereum' : 'Base'} to trade this token
                  </div>
                )}

                {/* Show warning if contracts not deployed */}
                {selectedToken?.chain === 'ethereum' && !hasDeployedContracts('ethereum') && (
                  <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-400">
                    ⚠️ Ethereum contracts not deployed yet. Trading coming soon!
                  </div>
                )}

                {/* Direction Toggle */}
                <div className="grid grid-cols-2 border-2 border-white">
                  <button
                    onClick={() => { setSwapDirection('buy'); setInputAmount('0.001'); }}
                    className={`py-3 md:py-4 font-editorial text-sm uppercase tracking-widest transition-colors ${
                      swapDirection === 'buy' 
                        ? 'bg-white text-black' 
                        : 'bg-black text-neutral-400 hover:text-white'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => { setSwapDirection('sell'); setInputAmount('1'); }}
                    className={`py-3 md:py-4 font-editorial text-sm uppercase tracking-widest border-l-2 border-white transition-colors ${
                      swapDirection === 'sell' 
                        ? 'bg-white text-black' 
                        : 'bg-black text-neutral-400 hover:text-white'
                    }`}
                  >
                    Sell
                  </button>
                </div>

                {/* Balances */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="border border-neutral-700 p-3 overflow-hidden">
                    <div className="text-neutral-500 text-xs mb-1">ETH Balance</div>
                    <div className="font-mono text-sm truncate">
                      {ethBalanceData ? formatBalance(ethBalanceData.value) : '0'} ETH
                    </div>
                  </div>
                  <div className="border border-neutral-700 p-3 overflow-hidden">
                    <div className="text-neutral-500 text-xs mb-1 truncate">{(selectedToken?.symbol || 'Token').slice(0, 12)}</div>
                    <div className="font-mono text-sm truncate">
                      {formatBalance(tokenBalance)} {(selectedToken?.symbol || '').slice(0, 8)}
                    </div>
                  </div>
                </div>
                
                {/* Input */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-neutral-500 uppercase tracking-wider">
                      {swapDirection === 'buy' ? 'YOU PAY' : 'YOU SELL'}
                    </label>
                    <button
                      onClick={handleMax}
                      className="text-xs text-neutral-400 hover:text-white border border-neutral-600 px-2 py-1 uppercase tracking-wider"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="flex gap-0">
                    <input
                      type="number"
                      value={inputAmount}
                      onChange={(e) => setInputAmount(e.target.value)}
                      className="flex-1 border-2 border-white bg-black px-4 py-3 text-lg font-mono border-r-0 focus:outline-none"
                      step="0.001"
                      min="0"
                    />
                    <div className="border-2 border-white px-3 flex items-center font-editorial font-bold text-sm max-w-[100px] overflow-hidden">
                      {swapDirection === 'buy' ? 'ETH' : (selectedToken?.symbol || 'TOKEN').slice(0, 10)}
                    </div>
                  </div>
                  {/* USD Value */}
                  <div className="text-xs text-neutral-500 mt-1 font-mono">
                    {formatUsd(getInputUsdValue()) || '\u00A0'}
                  </div>
                </div>
                
                {/* Arrow */}
                <div className="text-center py-1">
                  <span className="font-editorial text-2xl text-neutral-600">↓</span>
                </div>
                
                {/* Output */}
                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider block mb-2">YOU RECEIVE</label>
                  <div className="flex gap-0">
                    <div className="flex-1 border-2 border-white bg-black px-4 py-3 text-neutral-400 border-r-0 flex items-center min-h-[52px]">
                      {isLoadingQuote ? (
                        <span className="animate-pulse-slow text-sm">Calculating...</span>
                      ) : quoteAmount ? (
                        <span className="text-white font-mono text-lg">~{formatDisplayAmount(quoteAmount)}</span>
                      ) : (
                        <span className="text-sm">Enter amount</span>
                      )}
                    </div>
                    <div className="border-2 border-white px-3 flex items-center font-editorial font-bold text-sm max-w-[100px] overflow-hidden">
                      {swapDirection === 'buy' ? (selectedToken?.symbol || 'TOKEN').slice(0, 10) : 'ETH'}
                    </div>
                  </div>
                  {/* USD Value */}
                  <div className="text-xs text-neutral-500 mt-1 font-mono">
                    {formatUsd(getOutputUsdValue()) || '\u00A0'}
                  </div>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="border-2 border-neutral-600 p-3 text-neutral-400 text-sm font-mono">
                    {error}
                  </div>
                )}
                
                {/* Approval Button (for sell - one-time token → Permit2) */}
                {swapDirection === 'sell' && needsTokenApproval && (
                  <button
                    onClick={handleTokenApprove}
                    disabled={isPending || isConfirming}
                    className="btn-primary w-full text-sm"
                  >
                    {isPending || isConfirming ? 'APPROVING...' : `APPROVE ${(selectedToken?.symbol || 'TOKEN').slice(0, 8)}`}
                  </button>
                )}
                
                {/* SWAP Button */}
                <button
                  onClick={handleSwap}
                  disabled={isSwapDisabled}
                  className="btn-primary w-full"
                >
                  {isSigningPermit ? 'SIGN PERMIT...' :
                   isPending || isConfirming ? 'SWAPPING...' : 
                   isOnWrongChain ? 'SWITCH CHAIN' :
                   selectedToken?.chain === 'ethereum' && !hasDeployedContracts('ethereum') ? 'COMING SOON' :
                   needsAnyApproval ? 'APPROVE FIRST' : 'SWAP'}
                </button>
                
                {/* Transaction Link */}
                {txHash && (
                  <div className="text-center">
                    <a 
                      href={`${blockExplorer}/tx/${txHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-neutral-500 hover:text-white text-sm font-mono underline"
                    >
                      View on {currentChain === 'ethereum' ? 'Etherscan' : 'BaseScan'} →
                    </a>
                  </div>
                )}

                {/* Success Message */}
                {isSuccess && !needsAnyApproval && (
                  <div className="border-2 border-white p-4 text-center font-editorial">
                    ✓ SWAP COMPLETE
                  </div>
                )}
                
                {/* Approval Success Message */}
                {isSuccess && needsTokenApproval && (
                  <div className="border-2 border-neutral-600 p-3 text-center font-editorial text-neutral-400 text-sm">
                    ✓ APPROVAL CONFIRMED — NOW SWAP
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function SwapLoading() {
  return (
    <div className="w-full px-4 md:px-8 lg:px-12 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-xs text-neutral-500 mb-2 tracking-widest">UNISWAP V4</div>
        <h1 className="font-editorial text-3xl md:text-5xl">TRADE</h1>
      </div>
      <div className="border-2 border-white p-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">◐</div>
        <p className="text-neutral-400">Loading...</p>
      </div>
    </div>
  );
}

// Export with Suspense boundary for useSearchParams
export default function SwapPage() {
  return (
    <Suspense fallback={<SwapLoading />}>
      <SwapPageContent />
    </Suspense>
  );
}
