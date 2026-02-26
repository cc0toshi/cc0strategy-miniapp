// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount, useConnect, useDisconnect, useWriteContract, usePublicClient, useSwitchChain, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { CONTRACTS, getContracts, getChainFromId, INDEXER_API, type SupportedChain } from '@/config/contracts';
import { base, mainnet } from '@/config/wagmi';

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
  {
    name: 'claim',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokenIds', type: 'uint256[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

interface Token {
  address: string;
  symbol: string;
  name: string;
  nft_collection: string;
  chain: string;
}

interface NFTData {
  id: string;
  claimable: string;
}

export default function ClaimPage() {
  const [isReady, setIsReady] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [totalClaimable, setTotalClaimable] = useState('0');
  const [loading, setLoading] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [manualIds, setManualIds] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
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

  // Handle chain switch
  const handleChainSwitch = (chain: SupportedChain) => {
    const targetChainId = chain === 'base' ? base.id : mainnet.id;
    if (chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  };

  // Fetch tokens
  useEffect(() => {
    const fetchTokens = async () => {
      setLoadingTokens(true);
      try {
        const response = await fetch(`${INDEXER_API}/tokens`);
        const data = await response.json();
        
        if (data.tokens && data.tokens.length > 0) {
          const chainTokens = data.tokens.filter((t: Token) => (t.chain || 'base') === (currentChain || 'base'));
          setTokens(chainTokens);
          if (chainTokens.length > 0 && !selectedToken) {
            setSelectedToken(chainTokens[0]);
          }
        }
      } catch (e) {
        console.error('Failed to fetch tokens:', e);
      }
      setLoadingTokens(false);
    };
    fetchTokens();
  }, [currentChain]);

  // Check claimable for manual IDs
  const checkManualIds = async () => {
    if (!publicClient || !manualIds.trim() || !selectedToken) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const ids = manualIds.split(',').map(id => id.trim()).filter(id => id);
      const nftData: NFTData[] = [];
      let total = BigInt(0);
      
      for (const id of ids) {
        try {
          const amount = await publicClient.readContract({
            address: chainContracts.FEE_DISTRIBUTOR,
            abi: FEE_DISTRIBUTOR_ABI,
            functionName: 'claimable',
            args: [selectedToken.address as `0x${string}`, BigInt(id)],
          });
          
          nftData.push({
            id,
            claimable: formatEther(amount),
          });
          total += amount;
        } catch (e) {
          nftData.push({
            id,
            claimable: '0',
          });
        }
      }
      
      setNfts(nftData);
      setTotalClaimable(formatEther(total));
      
      const withBalance = new Set(nftData.filter(n => parseFloat(n.claimable) > 0).map(n => n.id));
      setSelectedNfts(withBalance);
    } catch (e: any) {
      setError(e.message || 'Failed to check claimable');
    }
    
    setLoading(false);
  };

  // Toggle NFT selection
  const toggleNft = (id: string) => {
    const newSelected = new Set(selectedNfts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedNfts(newSelected);
  };

  // Select all with balance
  const selectAllWithBalance = () => {
    const withBalance = new Set(nfts.filter(n => parseFloat(n.claimable) > 0).map(n => n.id));
    setSelectedNfts(withBalance);
  };

  // Calculate selected total
  const selectedTotal = nfts
    .filter(n => selectedNfts.has(n.id))
    .reduce((sum, n) => sum + parseFloat(n.claimable), 0)
    .toFixed(8)
    .replace(/\.?0+$/, '');

  // Handle claim
  const handleClaim = async () => {
    if (selectedNfts.size === 0 || !selectedToken) return;
    
    setError(null);
    setSuccess(null);
    
    try {
      const ids = Array.from(selectedNfts).map(id => BigInt(id));
      
      writeContract({
        address: chainContracts.FEE_DISTRIBUTOR,
        abi: FEE_DISTRIBUTOR_ABI,
        functionName: 'claim',
        args: [selectedToken.address as `0x${string}`, ids],
      });
    } catch (e: any) {
      setError(e.message || 'Claim failed');
    }
  };

  // Handle tx success
  useEffect(() => {
    if (txHash) {
      setSuccess(`Transaction submitted: ${txHash.slice(0, 10)}...`);
      // Refresh claimable amounts
      setTimeout(() => checkManualIds(), 3000);
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
        <h1 className="text-3xl font-black tracking-tight mb-1">CLAIM</h1>
        <p className="text-neutral-500 text-sm">Claim WETH rewards for your NFTs</p>
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

          {/* Chain Switcher */}
          <div className="flex gap-2">
            <button
              onClick={() => handleChainSwitch('base')}
              className={`flex-1 py-3 font-bold border-2 transition-colors flex items-center justify-center gap-2 ${
                currentChain === 'base' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 111 111" fill="currentColor">
                <path d="M54.921 110.034c30.354 0 54.967-24.593 54.967-54.921S85.275.191 54.921.191C26.043.191 2.003 22.567.142 51.031h71.858v7.983H.141c1.858 28.464 25.9 51.02 54.78 51.02Z"/>
              </svg>
              BASE
            </button>
            <button
              onClick={() => handleChainSwitch('ethereum')}
              className={`flex-1 py-3 font-bold border-2 transition-colors flex items-center justify-center gap-2 ${
                currentChain === 'ethereum' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 784 784" fill="currentColor">
                <path d="M392 0L0 392l392 392 392-392L392 0zM196 392L392 196l196 196-196 196-196-196z"/>
              </svg>
              ETH
            </button>
          </div>

          {/* Token Selector */}
          {loadingTokens ? (
            <div className="border-2 border-neutral-800 p-4 text-center text-neutral-500">
              Loading tokens...
            </div>
          ) : tokens.length === 0 ? (
            <div className="border-2 border-neutral-800 p-4 text-center text-neutral-500">
              No tokens on {currentChain?.toUpperCase() || 'BASE'}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold tracking-widest text-neutral-500 mb-2">
                SELECT TOKEN
              </label>
              <select
                value={selectedToken?.address || ''}
                onChange={(e) => {
                  const token = tokens.find(t => t.address === e.target.value);
                  if (token) {
                    setSelectedToken(token);
                    setNfts([]);
                    setSelectedNfts(new Set());
                  }
                }}
                className="w-full bg-black border-2 border-white p-3 font-mono text-sm"
              >
                {tokens.map(token => (
                  <option key={token.address} value={token.address}>
                    ${token.symbol}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Manual Entry */}
          {selectedToken && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold tracking-widest text-neutral-500 mb-2">
                  NFT TOKEN IDs (comma separated)
                </label>
                <input
                  type="text"
                  value={manualIds}
                  onChange={(e) => setManualIds(e.target.value)}
                  placeholder="e.g., 1, 42, 69, 420"
                  className="w-full bg-black border-2 border-white p-3 font-mono text-sm placeholder-neutral-600"
                />
              </div>
              <button
                onClick={checkManualIds}
                disabled={loading || !manualIds.trim()}
                className={`w-full py-3 font-bold text-sm border-2 border-white transition-colors ${
                  loading || !manualIds.trim() ? 'bg-neutral-900 text-neutral-600' : 'hover:bg-white hover:text-black'
                }`}
              >
                {loading ? 'CHECKING...' : 'CHECK CLAIMABLE'}
              </button>
            </div>
          )}

          {/* NFT Grid */}
          {nfts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-widest text-neutral-500">
                  NFTs ({nfts.length})
                </p>
                <button 
                  onClick={selectAllWithBalance}
                  className="text-xs text-neutral-500 hover:text-white"
                >
                  Select all with balance
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                {nfts.map((nft) => (
                  <button
                    key={nft.id}
                    onClick={() => toggleNft(nft.id)}
                    className={`border-2 p-3 text-left transition-colors ${
                      selectedNfts.has(nft.id)
                        ? 'border-white bg-neutral-900'
                        : 'border-neutral-800 hover:border-neutral-600'
                    }`}
                  >
                    <p className="font-mono font-bold text-sm">#{nft.id}</p>
                    <p className={`font-mono text-xs ${
                      parseFloat(nft.claimable) > 0 ? 'text-white' : 'text-neutral-600'
                    }`}>
                      {parseFloat(nft.claimable).toFixed(6)} WETH
                    </p>
                    {selectedNfts.has(nft.id) && (
                      <div className="mt-1 text-xs text-white">✓</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Total & Claim */}
          {nfts.length > 0 && (
            <div className="border-2 border-white">
              <div className="p-4 border-b border-neutral-800">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold tracking-widest text-neutral-500 mb-1">
                      SELECTED ({selectedNfts.size})
                    </p>
                    <p className="font-mono text-xl font-black">{selectedTotal} WETH</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold tracking-widest text-neutral-500 mb-1">
                      TOTAL
                    </p>
                    <p className="font-mono text-sm text-neutral-400">{totalClaimable} WETH</p>
                  </div>
                </div>
              </div>
              
              <button
                onClick={handleClaim}
                disabled={isPending || selectedNfts.size === 0 || parseFloat(selectedTotal) === 0}
                className={`w-full py-4 font-black text-lg transition-colors ${
                  isPending || selectedNfts.size === 0 || parseFloat(selectedTotal) === 0
                    ? 'bg-neutral-900 text-neutral-600'
                    : 'bg-white text-black hover:bg-neutral-200'
                }`}
              >
                {isPending ? 'CLAIMING...' : `CLAIM ${selectedTotal} WETH`}
              </button>
            </div>
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

          {/* Info */}
          {selectedToken && (
            <div className="border border-neutral-800 p-4">
              <p className="text-xs font-bold tracking-widest text-neutral-500 mb-2">HOW IT WORKS</p>
              <ol className="space-y-1 text-neutral-400 text-xs">
                <li>1. Enter your NFT token IDs (comma separated)</li>
                <li>2. Click "Check Claimable" to see rewards</li>
                <li>3. Select NFTs and click "Claim" to receive WETH</li>
              </ol>
              <p className="text-neutral-600 text-xs mt-3">
                Fees: 80% to holders, 10% treasury, 10% buyback
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
