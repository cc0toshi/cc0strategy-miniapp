// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBalance, useChainId, useSignTypedData, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseEther, formatEther, keccak256, concat, pad, toHex, hexToBigInt, parseAbi, encodeAbiParameters, maxUint256 } from 'viem';
import { CONTRACTS, CHAIN_ID, BLOCK_EXPLORER } from '@/config/contracts';
import { base } from '@/config/wagmi';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

// ABIs
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const EXTSLOAD_ABI = parseAbi(['function extsload(bytes32 slot) view returns (bytes32)']);

const UNIVERSAL_ROUTER_ABI = [
  { name: 'execute', type: 'function', inputs: [{ name: 'commands', type: 'bytes' }, { name: 'inputs', type: 'bytes[]' }], outputs: [], stateMutability: 'payable' },
] as const;

const PERMIT2_ABI = [
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'token', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }], stateMutability: 'view' },
] as const;

const PERMIT2_DOMAIN = (chainId: number, permit2Address: `0x${string}`) => ({
  name: 'Permit2', chainId, verifyingContract: permit2Address,
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

interface TokenInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  poolId: `0x${string}`;
  image_url?: string | null;
  nft_collection?: string;
}

interface PriceData {
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
}

const POOLS_SLOT = 6n;
const Q96 = BigInt(2 ** 96);
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as `0x${string}`;

function encodeExactInputSingleParams(
  poolKey: { currency0: `0x${string}`; currency1: `0x${string}`; fee: number; tickSpacing: number; hooks: `0x${string}` },
  zeroForOne: boolean, amountIn: bigint, amountOutMinimum: bigint, hookData: `0x${string}`
): `0x${string}` {
  const hookDataBytes = hookData === '0x' ? '0x' : hookData;
  const hookDataLength = hookDataBytes === '0x' ? 0 : (hookDataBytes.length - 2) / 2;
  return concat([
    pad(toHex(0x20), { size: 32 }), pad(poolKey.currency0, { size: 32 }), pad(poolKey.currency1, { size: 32 }),
    pad(toHex(poolKey.fee), { size: 32 }), pad(toHex(poolKey.tickSpacing), { size: 32 }), pad(poolKey.hooks, { size: 32 }),
    pad(toHex(zeroForOne ? 1 : 0), { size: 32 }), pad(toHex(amountIn), { size: 32 }), pad(toHex(amountOutMinimum), { size: 32 }),
    pad(toHex(0x120), { size: 32 }), pad(toHex(hookDataLength), { size: 32 }),
    ...(hookDataLength > 0 ? [pad(hookDataBytes as `0x${string}`, { size: Math.ceil(hookDataLength / 32) * 32 })] : []),
  ]) as `0x${string}`;
}

function formatCompact(num: number): string {
  if (num === 0) return '—';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function formatPrice(num: number): string {
  if (num === 0) return '—';
  if (num < 0.0001) return `$${num.toFixed(8)}`;
  if (num < 1) return `$${num.toFixed(6)}`;
  return `$${num.toFixed(2)}`;
}

function getImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  return url;
}

function TokenImage({ imageUrl, symbol, size = 'md' }: { imageUrl: string | null | undefined; symbol: string; size?: 'sm' | 'md' | 'lg' }) {
  const [error, setError] = useState(false);
  const sizeClasses = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16' };
  const resolvedUrl = getImageUrl(imageUrl);
  if (!resolvedUrl || error) {
    return <div className={`${sizeClasses[size]} bg-neutral-900 border border-neutral-700 flex items-center justify-center text-xs font-mono text-neutral-500 flex-shrink-0`}>{symbol?.slice(0, 2) || '??'}</div>;
  }
  return (
    <div className={`${sizeClasses[size]} relative bg-neutral-900 border border-neutral-700 overflow-hidden flex-shrink-0`}>
      <Image src={resolvedUrl} alt={symbol} fill className="object-cover" onError={() => setError(true)} unoptimized />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={handleCopy} className="p-1 hover:bg-neutral-800 transition-colors" title="Copy address">
      {copied ? <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-4 h-4 text-neutral-500 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
    </button>
  );
}

function TokenHeader({ token, priceData }: { token: TokenInfo | null; priceData: PriceData | null }) {
  if (!token) return null;
  const truncatedAddress = `${token.address.slice(0, 6)}...${token.address.slice(-4)}`;
  return (
    <div className="border-2 border-white p-4 mb-6">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-start gap-4">
          <TokenImage imageUrl={token.image_url} symbol={token.symbol} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="font-editorial text-xl md:text-2xl mb-1">{token.name}</h2>
            <div className="text-neutral-400 font-mono mb-1">${token.symbol}</div>
            <div className="flex items-center gap-1">
              <span className="text-neutral-500 font-mono text-xs">{truncatedAddress}</span>
              <CopyButton text={token.address} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 md:ml-auto">
          <div><div className="text-neutral-500 text-xs mb-1">PRICE</div><div className="font-mono">{priceData ? formatPrice(priceData.priceUsd) : '—'}</div></div>
          <div><div className="text-neutral-500 text-xs mb-1">24H</div><div className={priceData && priceData.priceChange24h !== 0 ? (priceData.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500') : 'text-neutral-500'}>{priceData ? `${priceData.priceChange24h >= 0 ? '+' : ''}${priceData.priceChange24h.toFixed(2)}%` : '—'}</div></div>
          <div><div className="text-neutral-500 text-xs mb-1">MCAP</div><div className="font-mono">{priceData ? formatCompact(priceData.marketCap) : '—'}</div></div>
        </div>
      </div>
    </div>
  );
}

function TokenSearchBar({ tokens, selectedToken, onSelect, isLoading }: { tokens: TokenInfo[]; selectedToken: TokenInfo | null; onSelect: (token: TokenInfo) => void; isLoading: boolean }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) { if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false); }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const filteredTokens = useMemo(() => {
    if (!query.trim()) return tokens;
    const q = query.toLowerCase();
    return tokens.filter(t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q));
  }, [tokens, query]);
  
  return (
    <div ref={wrapperRef} className="relative mb-6">
      <div className="relative">
        <input type="text" placeholder={isLoading ? "Loading tokens..." : "Search tokens..."} value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)}
          className="w-full border-2 border-white bg-black px-4 py-3 pr-12 text-sm focus:outline-none placeholder:text-neutral-600 uppercase tracking-wide" disabled={isLoading} />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>
      {isOpen && filteredTokens.length > 0 && (
        <div className="absolute z-50 w-full mt-1 border-2 border-white bg-black max-h-80 overflow-y-auto">
          {filteredTokens.map((token) => (
            <button key={token.address} onClick={() => { onSelect(token); setQuery(''); setIsOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-900 transition-colors text-left ${selectedToken?.address === token.address ? 'bg-neutral-900' : ''}`}>
              <TokenImage imageUrl={token.image_url} symbol={token.symbol} size="sm" />
              <div className="flex-1 min-w-0">
                <span className="font-bold truncate">{token.name}</span>
                <span className="text-neutral-500 text-sm font-mono ml-2">${token.symbol}</span>
              </div>
            </button>
          ))}
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
  
  const { data: ethBalanceData } = useBalance({ address });
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  
  const [allTokens, setAllTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [inputAmount, setInputAmount] = useState('0.001');
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [swapDirection, setSwapDirection] = useState<'buy' | 'sell'>('buy');
  const [error, setError] = useState<string | null>(null);
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [tokenPriceData, setTokenPriceData] = useState<PriceData | null>(null);
  const [needsTokenApproval, setNeedsTokenApproval] = useState(false);
  const [permit2Nonce, setPermit2Nonce] = useState<number>(0);
  const [isSigningPermit, setIsSigningPermit] = useState(false);
  
  const { writeContract, data: txHash, isPending, reset: resetWrite, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { signTypedDataAsync } = useSignTypedData();

  const isOnWrongChain = chainId !== CHAIN_ID;

  useEffect(() => { if (writeError) { console.error('writeContract error:', writeError); setError(writeError.message || 'Transaction failed'); } }, [writeError]);

  useEffect(() => {
    const fetchEthPrice = async () => {
      try { const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'); const data = await res.json(); setEthPrice(data.ethereum?.usd || 0); } catch (e) { console.error('Failed to fetch ETH price:', e); }
    };
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadTokens = async () => {
      setIsLoadingTokens(true);
      setError(null);
      try {
        const response = await fetch('/api/tokens');
        const data = await response.json();
        if (data.error) { setError(`Failed to load tokens: ${data.error}`); setAllTokens([]); setIsLoadingTokens(false); return; }
        if (data.tokens && Array.isArray(data.tokens) && data.tokens.length > 0) {
          const tokens = data.tokens.filter((t: any) => t && t.address && t.pool_id).map((t: any) => {
            let poolIdHex = t.pool_id;
            if (typeof poolIdHex === 'string') {
              if (poolIdHex.startsWith('\\x')) poolIdHex = '0x' + poolIdHex.slice(2);
              else if (!poolIdHex.startsWith('0x')) poolIdHex = '0x' + poolIdHex;
            }
            return { address: t.address as `0x${string}`, symbol: t.symbol || 'UNKNOWN', name: t.name || 'Unknown Token', poolId: poolIdHex as `0x${string}`, image_url: t.image_url, nft_collection: t.nft_collection };
          });
          setAllTokens(tokens);
          const urlToken = searchParams.get('token');
          if (urlToken) {
            const matchingToken = tokens.find((t: TokenInfo) => t.address.toLowerCase() === urlToken.toLowerCase());
            if (matchingToken) setSelectedToken(matchingToken);
            else if (tokens.length > 0) setSelectedToken(tokens[0]);
          } else if (tokens.length > 0) setSelectedToken(tokens[0]);
        } else { setAllTokens([]); setSelectedToken(null); }
      } catch (e: any) { console.error('Error loading tokens:', e); setError(`Network error: ${e.message}`); setAllTokens([]); }
      setIsLoadingTokens(false);
    };
    loadTokens();
  }, [searchParams]);

  useEffect(() => {
    if (!selectedToken) { setTokenPriceData(null); return; }
    const fetchPrice = async () => {
      try {
        const res = await fetch('/api/prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: [{ address: selectedToken.address, chain: 'base' }] }) });
        if (res.ok) { const data = await res.json(); setTokenPriceData(data.prices?.[selectedToken.address.toLowerCase()] || null); }
      } catch (e) { console.error('Failed to fetch token price:', e); }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, [selectedToken]);

  useEffect(() => {
    const loadTokenBalance = async () => {
      if (!publicClient || !address || !selectedToken || isOnWrongChain) { setTokenBalance(0n); return; }
      try { const balance = await publicClient.readContract({ address: selectedToken.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }); setTokenBalance(balance as bigint); } catch (e) { setTokenBalance(0n); }
    };
    loadTokenBalance();
  }, [publicClient, address, selectedToken, isSuccess, isOnWrongChain]);

  useEffect(() => {
    const checkApproval = async () => {
      if (swapDirection !== 'sell' || !publicClient || !address || !selectedToken?.address || !inputAmount || isOnWrongChain) { setNeedsTokenApproval(false); return; }
      try {
        const amountIn = parseEther(inputAmount || '0');
        if (amountIn <= 0n) { setNeedsTokenApproval(false); return; }
        const allowance = await publicClient.readContract({ address: selectedToken.address, abi: ERC20_ABI, functionName: 'allowance', args: [address, CONTRACTS.PERMIT2] });
        setNeedsTokenApproval((allowance as bigint) < amountIn);
        const permit2Allowance = await publicClient.readContract({ address: CONTRACTS.PERMIT2, abi: PERMIT2_ABI, functionName: 'allowance', args: [address, selectedToken.address, CONTRACTS.UNIVERSAL_ROUTER] });
        if (permit2Allowance && Array.isArray(permit2Allowance)) { const [, , nonce] = permit2Allowance as [bigint, number, number]; setPermit2Nonce(nonce); }
      } catch (e) { setNeedsTokenApproval(false); }
    };
    checkApproval();
  }, [publicClient, address, selectedToken, inputAmount, swapDirection, isSuccess, isOnWrongChain]);

  const calculateQuote = useCallback(async () => {
    if (!publicClient || !selectedToken?.poolId || !selectedToken?.address || isOnWrongChain) { setQuoteAmount(null); return; }
    if (!inputAmount || parseFloat(inputAmount) <= 0 || isNaN(parseFloat(inputAmount))) { setQuoteAmount(null); return; }
    setIsLoadingQuote(true); setError(null);
    try {
      const baseSlot = keccak256(concat([selectedToken.poolId, pad(toHex(POOLS_SLOT), { size: 32 })]));
      const slot0Data = await publicClient.readContract({ address: CONTRACTS.POOL_MANAGER, abi: EXTSLOAD_ABI, functionName: 'extsload', args: [baseSlot as `0x${string}`] });
      if (!slot0Data || slot0Data === '0x0000000000000000000000000000000000000000000000000000000000000000') { setError('Pool not initialized'); setQuoteAmount(null); setIsLoadingQuote(false); return; }
      const slot0BigInt = hexToBigInt(slot0Data as `0x${string}`);
      const sqrtPriceX96 = slot0BigInt & ((1n << 160n) - 1n);
      if (sqrtPriceX96 === 0n) { setError('Invalid pool state'); setQuoteAmount(null); setIsLoadingQuote(false); return; }
      const inputAmountWei = parseEther(inputAmount);
      const sqrtPriceSq = sqrtPriceX96 * sqrtPriceX96;
      const q96Sq = Q96 * Q96;
      let amountOut: bigint;
      if (swapDirection === 'buy') amountOut = (inputAmountWei * q96Sq) / sqrtPriceSq;
      else amountOut = (inputAmountWei * sqrtPriceSq) / q96Sq;
      const amountAfterFee = (amountOut * 98n) / 100n;
      setQuoteAmount(formatEther(amountAfterFee));
    } catch (e: any) { setError(e?.message || 'Failed to get quote'); setQuoteAmount(null); }
    setIsLoadingQuote(false);
  }, [publicClient, selectedToken, inputAmount, swapDirection, isOnWrongChain]);

  useEffect(() => { const timer = setTimeout(() => { calculateQuote(); }, 500); return () => clearTimeout(timer); }, [calculateQuote]);

  const handleMax = () => {
    if (swapDirection === 'buy') { if (ethBalanceData) { const maxEth = ethBalanceData.value - parseEther('0.001'); if (maxEth > 0n) setInputAmount(formatEther(maxEth)); } }
    else { if (tokenBalance > 0n) setInputAmount(formatEther(tokenBalance)); }
  };

  const handleTokenApprove = async () => {
    if (!selectedToken || !address) return;
    setError(null);
    try { writeContract({ address: selectedToken.address, abi: ERC20_ABI, functionName: 'approve', args: [CONTRACTS.PERMIT2, maxUint256] }); } catch (e: any) { setError(e.message || 'Token approval failed'); }
  };

  useEffect(() => {
    if (isSuccess && needsTokenApproval) {
      const recheckAllowances = async () => {
        if (!publicClient || !address || !selectedToken) return;
        try {
          const amountIn = parseEther(inputAmount || '0');
          const tokenAllowance = await publicClient.readContract({ address: selectedToken.address, abi: ERC20_ABI, functionName: 'allowance', args: [address, CONTRACTS.PERMIT2] });
          setNeedsTokenApproval((tokenAllowance as bigint) < amountIn);
        } catch (e) {}
      };
      recheckAllowances();
    }
  }, [isSuccess, needsTokenApproval, publicClient, address, selectedToken, inputAmount]);

  const handleSwap = async () => {
    if (!address || !selectedToken || !quoteAmount || isOnWrongChain) return;
    setError(null);
    try {
      const amountIn = parseEther(inputAmount);
      const minAmountOut = parseEther(quoteAmount) * 90n / 100n;
      const poolKey = {
        currency0: selectedToken.address.toLowerCase() < CONTRACTS.WETH.toLowerCase() ? selectedToken.address.toLowerCase() as `0x${string}` : CONTRACTS.WETH.toLowerCase() as `0x${string}`,
        currency1: selectedToken.address.toLowerCase() < CONTRACTS.WETH.toLowerCase() ? CONTRACTS.WETH.toLowerCase() as `0x${string}` : selectedToken.address.toLowerCase() as `0x${string}`,
        fee: 0x800000, tickSpacing: 200, hooks: CONTRACTS.HOOK.toLowerCase() as `0x${string}`,
      };
      const hookData = '0x' as `0x${string}`;
      
      if (swapDirection === 'buy') {
        const wrapEthInput = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [ADDRESS_THIS, amountIn]);
        const actions = '0x060b0f' as `0x${string}`;
        const swapParams = encodeExactInputSingleParams(poolKey, false, amountIn, minAmountOut, hookData);
        const settlePairParams = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [poolKey.currency1, amountIn, false]);
        const takePairParams = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [poolKey.currency0, 0n]);
        const v4SwapInput = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swapParams, settlePairParams, takePairParams]]);
        const commands = '0x0b10' as `0x${string}`;
        writeContract({ address: CONTRACTS.UNIVERSAL_ROUTER, abi: UNIVERSAL_ROUTER_ABI, functionName: 'execute', args: [commands, [wrapEthInput, v4SwapInput]], value: amountIn, chainId: CHAIN_ID });
      } else {
        setIsSigningPermit(true);
        try {
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
          const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
          const permitMessage = { details: { token: selectedToken.address, amount: amountIn > BigInt('0xffffffffffffffffffffffffffffffff') ? BigInt('0xffffffffffffffffffffffffffffffff') : amountIn, expiration, nonce: permit2Nonce }, spender: CONTRACTS.UNIVERSAL_ROUTER, sigDeadline: deadline };
          const signature = await signTypedDataAsync({ domain: PERMIT2_DOMAIN(CHAIN_ID, CONTRACTS.PERMIT2), types: PERMIT_TYPES, primaryType: 'PermitSingle', message: permitMessage });
          setIsSigningPermit(false);
          const actions = '0x060b0e' as `0x${string}`;
          const swapParams = encodeExactInputSingleParams(poolKey, true, amountIn, minAmountOut, hookData);
          const settleParams = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }], [poolKey.currency0, 0n, true]);
          const takeParams = encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [poolKey.currency1, ADDRESS_THIS, 0n]);
          const v4SwapInput = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swapParams, settleParams, takeParams]]);
          const unwrapEthInput = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [address, minAmountOut]);
          const permit2Input = encodeAbiParameters([{ type: 'tuple', components: [{ type: 'tuple', name: 'details', components: [{ type: 'address', name: 'token' }, { type: 'uint160', name: 'amount' }, { type: 'uint48', name: 'expiration' }, { type: 'uint48', name: 'nonce' }] }, { type: 'address', name: 'spender' }, { type: 'uint256', name: 'sigDeadline' }] }, { type: 'bytes' }], [{ details: { token: selectedToken.address, amount: permitMessage.details.amount, expiration: BigInt(expiration), nonce: BigInt(permit2Nonce) }, spender: CONTRACTS.UNIVERSAL_ROUTER, sigDeadline: deadline }, signature]);
          const commands = '0x0a100c' as `0x${string}`;
          writeContract({ address: CONTRACTS.UNIVERSAL_ROUTER, abi: UNIVERSAL_ROUTER_ABI, functionName: 'execute', args: [commands, [permit2Input, v4SwapInput, unwrapEthInput]], value: 0n, chainId: CHAIN_ID });
        } catch (e: any) { setIsSigningPermit(false); setError(e.message?.includes('rejected') ? 'Signature rejected' : e.message || 'Failed to sign permit'); return; }
      }
    } catch (e: any) { setError(e.message || 'Swap failed'); }
  };
  
  useEffect(() => { if (isSuccess && !needsTokenApproval) { resetWrite(); setInputAmount('0.001'); } }, [isSuccess, needsTokenApproval, resetWrite]);

  const formatBalance = (balance: bigint) => { const num = parseFloat(formatEther(balance)); if (num < 0.0001) return '< 0.0001'; if (num < 1) return num.toFixed(4); return num.toLocaleString(undefined, { maximumFractionDigits: 4 }); };
  const needsAnyApproval = swapDirection === 'sell' && needsTokenApproval;
  const isSwapDisabled = isPending || isConfirming || isSigningPermit || !quoteAmount || isLoadingQuote || needsAnyApproval || isOnWrongChain;

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-6"><div className="text-xs text-neutral-500 mb-2 tracking-widest">UNISWAP V4 · BASE</div><h1 className="font-editorial text-3xl md:text-4xl">TRADE</h1></div>
      <TokenSearchBar tokens={allTokens} selectedToken={selectedToken} onSelect={setSelectedToken} isLoading={isLoadingTokens} />
      <TokenHeader token={selectedToken} priceData={tokenPriceData} />
      
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="border-2 border-white flex flex-col lg:col-span-8">
          <div className="border-b-2 border-white p-4"><span className="font-editorial text-sm uppercase tracking-widest">PRICE CHART</span></div>
          {selectedToken ? (
            <iframe src={`https://www.geckoterminal.com/base/pools/${selectedToken.address}?embed=1&info=0&swaps=0&grayscale=1`} width="100%" height="100%" style={{ minHeight: "400px" }} frameBorder="0" className="bg-black block w-full" title="Price Chart" />
          ) : <div className="min-h-[400px] flex items-center justify-center text-neutral-600 text-sm">Select a token to view chart</div>}
        </div>

        <div className="border-2 border-white lg:col-span-4">
          {!isConnected ? (
            <div className="p-8 text-center">
              <div className="font-editorial text-xl mb-6">WALLET REQUIRED</div>
              <p className="text-neutral-500 mb-8">Connect your wallet to start trading</p>
              <button onClick={() => connect({ connector: injected() })} className="btn-primary w-full">Connect Wallet</button>
            </div>
          ) : (
            <>
              <div className="border-b-2 border-white p-4 flex justify-between items-center">
                <span className="font-mono text-sm text-neutral-400">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                <button onClick={() => disconnect()} className="text-neutral-500 hover:text-white text-xs uppercase tracking-wider">Disconnect</button>
              </div>
              <div className="p-4 space-y-4">
                {isOnWrongChain && (
                  <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-400">
                    ⚠️ Please switch to Base
                    <button onClick={() => switchChain({ chainId: CHAIN_ID })} className="ml-2 underline hover:no-underline">Switch now</button>
                  </div>
                )}
                <div className="grid grid-cols-2 border-2 border-white">
                  <button onClick={() => { setSwapDirection('buy'); setInputAmount('0.001'); }} className={`py-3 font-editorial text-sm uppercase tracking-widest transition-colors ${swapDirection === 'buy' ? 'bg-white text-black' : 'bg-black text-neutral-400 hover:text-white'}`}>Buy</button>
                  <button onClick={() => { setSwapDirection('sell'); setInputAmount('1'); }} className={`py-3 font-editorial text-sm uppercase tracking-widest border-l-2 border-white transition-colors ${swapDirection === 'sell' ? 'bg-white text-black' : 'bg-black text-neutral-400 hover:text-white'}`}>Sell</button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="border border-neutral-700 p-3"><div className="text-neutral-500 text-xs mb-1">ETH</div><div className="font-mono text-sm truncate">{ethBalanceData ? formatBalance(ethBalanceData.value) : '0'}</div></div>
                  <div className="border border-neutral-700 p-3"><div className="text-neutral-500 text-xs mb-1 truncate">{selectedToken?.symbol?.slice(0, 8) || 'Token'}</div><div className="font-mono text-sm truncate">{formatBalance(tokenBalance)}</div></div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-neutral-500 uppercase tracking-wider">{swapDirection === 'buy' ? 'YOU PAY' : 'YOU SELL'}</label>
                    <button onClick={handleMax} className="text-xs text-neutral-400 hover:text-white border border-neutral-600 px-2 py-1 uppercase tracking-wider">MAX</button>
                  </div>
                  <div className="flex gap-0">
                    <input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} className="flex-1 border-2 border-white bg-black px-4 py-3 text-xl font-mono focus:outline-none" placeholder="0.0" />
                    <div className="border-2 border-l-0 border-white bg-neutral-900 px-4 py-3 flex items-center"><span className="text-neutral-400 font-mono text-sm">{swapDirection === 'buy' ? 'ETH' : selectedToken?.symbol?.slice(0, 6) || '...'}</span></div>
                  </div>
                </div>
                <div className="flex justify-center"><svg className="w-6 h-6 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg></div>
                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">{swapDirection === 'buy' ? 'YOU RECEIVE' : 'YOU GET'}</label>
                  <div className="flex gap-0">
                    <div className="flex-1 border-2 border-white bg-neutral-900 px-4 py-3"><span className="text-xl font-mono">{isLoadingQuote ? '...' : quoteAmount ? parseFloat(quoteAmount).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0.0'}</span></div>
                    <div className="border-2 border-l-0 border-white bg-neutral-900 px-4 py-3 flex items-center"><span className="text-neutral-400 font-mono text-sm">{swapDirection === 'buy' ? selectedToken?.symbol?.slice(0, 6) || '...' : 'ETH'}</span></div>
                  </div>
                </div>
                {error && <div className="border-2 border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
                {needsAnyApproval ? (
                  <button onClick={handleTokenApprove} disabled={isPending || isConfirming} className="btn-primary w-full">{isPending || isConfirming ? 'Approving...' : `Approve ${selectedToken?.symbol}`}</button>
                ) : (
                  <button onClick={handleSwap} disabled={isSwapDisabled} className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
                    {isPending || isConfirming ? 'Confirming...' : isSigningPermit ? 'Sign in wallet...' : isOnWrongChain ? 'Switch to Base' : swapDirection === 'buy' ? 'Buy' : 'Sell'}
                  </button>
                )}
                {txHash && (
                  <div className="text-center">
                    <a href={`${BLOCK_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-500 hover:text-white underline">View on BaseScan →</a>
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

export default function SwapPage() {
  return <Suspense fallback={<div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>}><SwapPageContent /></Suspense>;
}
