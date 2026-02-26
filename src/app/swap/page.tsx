// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount, useConnect, useDisconnect, useWriteContract, usePublicClient, useSwitchChain, useChainId, useBalance, useSendTransaction } from 'wagmi';
import { parseEther, formatEther, encodeAbiParameters, concat, pad, toHex, keccak256, hexToBigInt, parseAbi, maxUint256 } from 'viem';
import { CONTRACTS, getContracts, getChainFromId, INDEXER_API, type SupportedChain } from '@/config/contracts';
import { base, mainnet } from '@/config/wagmi';

// ABIs
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

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

const EXTSLOAD_ABI = parseAbi([
  'function extsload(bytes32 slot) view returns (bytes32)',
]);

// Constants
const POOLS_SLOT = 6n;
const Q96 = BigInt(2 ** 96);
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as `0x${string}`;

interface TokenInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  poolId: `0x${string}`;
  chain: SupportedChain;
  image_url?: string | null;
}

// Helper to encode swap params
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

export default function SwapPage() {
  const [isReady, setIsReady] = useState(false);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [inputAmount, setInputAmount] = useState('0.001');
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [swapDirection, setSwapDirection] = useState<'buy' | 'sell'>('buy');
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: ethBalanceData } = useBalance({ address });
  const { writeContract, isPending, data: txHash } = useWriteContract();

  const currentChain = getChainFromId(chainId);
  const chainContracts = currentChain ? getContracts(currentChain) : getContracts('base');

  // Initialize SDK
  useEffect(() => {
    const init = async () => {
      await sdk.actions.ready();
      setIsReady(true);
    };
    init();
  }, []);

  // Fetch tokens from indexer
  useEffect(() => {
    const fetchTokens = async () => {
      setIsLoadingTokens(true);
      try {
        const response = await fetch(`${INDEXER_API}/tokens`);
        const data = await response.json();
        
        if (data.tokens && Array.isArray(data.tokens)) {
          const mappedTokens: TokenInfo[] = data.tokens
            .filter((t: any) => t && t.address && t.pool_id)
            .map((t: any) => {
              let poolIdHex: string = t.pool_id;
              if (typeof poolIdHex === 'string') {
                if (poolIdHex.startsWith('\\x')) {
                  poolIdHex = '0x' + poolIdHex.slice(2);
                } else if (!poolIdHex.startsWith('0x')) {
                  poolIdHex = '0x' + poolIdHex;
                }
              }
              return {
                address: t.address as `0x${string}`,
                symbol: t.symbol || 'UNKNOWN',
                name: t.name || 'Unknown Token',
                poolId: poolIdHex as `0x${string}`,
                chain: (t.chain || 'base') as SupportedChain,
                image_url: t.image_url,
              };
            });
          
          setTokens(mappedTokens);
          if (mappedTokens.length > 0 && !selectedToken) {
            setSelectedToken(mappedTokens[0]);
          }
        }
      } catch (e) {
        console.error('Failed to fetch tokens:', e);
        setError('Failed to load tokens');
      }
      setIsLoadingTokens(false);
    };
    fetchTokens();
  }, []);

  // Auto-switch chain when token is selected
  useEffect(() => {
    if (!selectedToken || !isConnected) return;
    const targetChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
    if (chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  }, [selectedToken, isConnected, chainId, switchChain]);

  // Load token balance
  useEffect(() => {
    const loadBalance = async () => {
      if (!publicClient || !address || !selectedToken) {
        setTokenBalance(0n);
        return;
      }
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
        setTokenBalance(0n);
      }
    };
    loadBalance();
  }, [publicClient, address, selectedToken, chainId, txHash]);

  // Check approval for sell
  useEffect(() => {
    const checkApproval = async () => {
      if (swapDirection !== 'sell' || !publicClient || !address || !selectedToken || !inputAmount) {
        setNeedsApproval(false);
        return;
      }
      const tokenChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
      if (chainId !== tokenChainId) {
        setNeedsApproval(false);
        return;
      }
      try {
        const amountIn = parseEther(inputAmount || '0');
        if (amountIn <= 0n) {
          setNeedsApproval(false);
          return;
        }
        const allowance = await publicClient.readContract({
          address: selectedToken.address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, chainContracts.PERMIT2],
        });
        setNeedsApproval((allowance as bigint) < amountIn);
      } catch (e) {
        setNeedsApproval(false);
      }
    };
    checkApproval();
  }, [publicClient, address, selectedToken, inputAmount, swapDirection, chainContracts, chainId, txHash]);

  // Calculate quote
  const calculateQuote = useCallback(async () => {
    if (!publicClient || !selectedToken?.poolId || !inputAmount || parseFloat(inputAmount) <= 0) {
      setQuoteAmount(null);
      return;
    }
    const tokenChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
    if (chainId !== tokenChainId) {
      setQuoteAmount(null);
      return;
    }
    setIsLoadingQuote(true);
    setError(null);
    try {
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
      console.error('Quote error:', e);
      setError('Failed to get quote');
      setQuoteAmount(null);
    }
    setIsLoadingQuote(false);
  }, [publicClient, selectedToken, inputAmount, swapDirection, chainContracts, chainId]);

  useEffect(() => {
    const timer = setTimeout(() => calculateQuote(), 500);
    return () => clearTimeout(timer);
  }, [calculateQuote]);

  // Handle MAX
  const handleMax = () => {
    if (swapDirection === 'buy') {
      if (ethBalanceData) {
        const maxEth = ethBalanceData.value - parseEther('0.001');
        if (maxEth > 0n) setInputAmount(formatEther(maxEth));
      }
    } else {
      if (tokenBalance > 0n) setInputAmount(formatEther(tokenBalance));
    }
  };

  // Handle approval
  const handleApprove = async () => {
    if (!selectedToken) return;
    setError(null);
    try {
      writeContract({
        address: selectedToken.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [chainContracts.PERMIT2, maxUint256],
      });
    } catch (e: any) {
      setError(e.message || 'Approval failed');
    }
  };

  // Handle swap
  const handleSwap = async () => {
    if (!address || !selectedToken || !quoteAmount) return;
    const tokenChainId = selectedToken.chain === 'base' ? base.id : mainnet.id;
    if (chainId !== tokenChainId) {
      setError('Please switch to the correct chain');
      return;
    }
    setError(null);
    setSuccess(null);
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
        // BUY: ETH → Token
        const wrapEthInput = encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }],
          [ADDRESS_THIS, amountIn]
        );
        const actions = '0x060b0f' as `0x${string}`;
        const swapParams = encodeExactInputSingleParams(poolKey, false, amountIn, minAmountOut, hookData);
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
        // SELL: Token → ETH (simplified - requires prior approval)
        const unwrapWethInput = encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }],
          [address, 0n]
        );
        const actions = '0x060c0e' as `0x${string}`;
        const swapParams = encodeExactInputSingleParams(poolKey, true, amountIn, minAmountOut, hookData);
        const settleParams = encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }, { type: 'bool' }],
          [poolKey.currency0, amountIn, false]
        );
        const takeParams = encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }],
          [poolKey.currency1, 0n]
        );
        const v4SwapInput = encodeAbiParameters(
          [{ type: 'bytes' }, { type: 'bytes[]' }],
          [actions, [swapParams, settleParams, takeParams]]
        );
        const commands = '0x100c' as `0x${string}`;
        const inputs = [v4SwapInput, unwrapWethInput];
        writeContract({
          address: chainContracts.UNIVERSAL_ROUTER,
          abi: UNIVERSAL_ROUTER_ABI,
          functionName: 'execute',
          args: [commands, inputs],
          chainId,
        });
      }
    } catch (e: any) {
      console.error('Swap error:', e);
      setError(e.message || 'Swap failed');
    }
  };

  // Handle tx success
  useEffect(() => {
    if (txHash) {
      setSuccess(`Transaction submitted: ${txHash.slice(0, 10)}...`);
    }
  }, [txHash]);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl font-bold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black tracking-tight mb-1">SWAP</h1>
        <p className="text-neutral-500 text-sm">Trade cc0 tokens</p>
      </div>

      {/* Connect Wallet */}
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

          {/* Token Selector */}
          <div>
            <label className="block text-xs font-bold tracking-widest text-neutral-500 mb-2">
              SELECT TOKEN
            </label>
            {isLoadingTokens ? (
              <div className="border-2 border-neutral-800 p-4 text-center text-neutral-500">
                Loading tokens...
              </div>
            ) : tokens.length === 0 ? (
              <div className="border-2 border-neutral-800 p-4 text-center text-neutral-500">
                No tokens available
              </div>
            ) : (
              <select
                value={selectedToken?.address || ''}
                onChange={(e) => {
                  const token = tokens.find(t => t.address === e.target.value);
                  if (token) setSelectedToken(token);
                }}
                className="w-full bg-black border-2 border-white p-3 font-mono text-sm"
              >
                {tokens.map(token => (
                  <option key={token.address} value={token.address}>
                    ${token.symbol} ({token.chain.toUpperCase()})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Direction Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSwapDirection('buy')}
              className={`flex-1 py-3 font-bold border-2 transition-colors ${
                swapDirection === 'buy' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
              }`}
            >
              BUY
            </button>
            <button
              onClick={() => setSwapDirection('sell')}
              className={`flex-1 py-3 font-bold border-2 transition-colors ${
                swapDirection === 'sell' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
              }`}
            >
              SELL
            </button>
          </div>

          {/* Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold tracking-widest text-neutral-500">
                {swapDirection === 'buy' ? 'PAY (ETH)' : `PAY (${selectedToken?.symbol || 'TOKEN'})`}
              </label>
              <button onClick={handleMax} className="text-xs text-neutral-500 hover:text-white">
                MAX
              </button>
            </div>
            <input
              type="number"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              placeholder="0.0"
              className="w-full bg-black border-2 border-white p-4 font-mono text-xl placeholder-neutral-600"
            />
            <div className="text-xs text-neutral-500 mt-1 font-mono">
              Balance: {swapDirection === 'buy' 
                ? `${ethBalanceData ? parseFloat(formatEther(ethBalanceData.value)).toFixed(4) : '0'} ETH`
                : `${parseFloat(formatEther(tokenBalance)).toFixed(4)} ${selectedToken?.symbol || ''}`
              }
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="border border-neutral-700 p-2">
              <svg className="w-6 h-6 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>

          {/* Output */}
          <div>
            <label className="block text-xs font-bold tracking-widest text-neutral-500 mb-2">
              {swapDirection === 'buy' ? `RECEIVE (${selectedToken?.symbol || 'TOKEN'})` : 'RECEIVE (ETH)'}
            </label>
            <div className="w-full bg-neutral-900 border-2 border-neutral-700 p-4 font-mono text-xl text-neutral-400">
              {isLoadingQuote ? 'Loading...' : quoteAmount ? parseFloat(quoteAmount).toFixed(6) : '0.0'}
            </div>
          </div>

          {/* Action Button */}
          {swapDirection === 'sell' && needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isPending}
              className={`w-full py-4 font-black text-lg border-2 border-white transition-colors ${
                isPending ? 'bg-neutral-900 text-neutral-600' : 'hover:bg-white hover:text-black'
              }`}
            >
              {isPending ? 'APPROVING...' : 'APPROVE'}
            </button>
          ) : (
            <button
              onClick={handleSwap}
              disabled={isPending || !quoteAmount || parseFloat(quoteAmount) === 0}
              className={`w-full py-4 font-black text-lg transition-colors ${
                isPending || !quoteAmount ? 'bg-neutral-900 text-neutral-600 border-2 border-neutral-800' : 'bg-white text-black hover:bg-neutral-200'
              }`}
            >
              {isPending ? 'SWAPPING...' : 'SWAP'}
            </button>
          )}

          {/* Messages */}
          {error && (
            <div className="border-2 border-red-500 p-3 text-red-400 text-sm font-mono break-all">
              {error}
            </div>
          )}
          {success && (
            <div className="border-2 border-green-500 p-3 text-green-400 text-sm font-mono break-all">
              {success}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
