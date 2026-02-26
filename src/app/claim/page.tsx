// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, usePublicClient, useSwitchChain, useChainId } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatEther } from 'viem';
import { CONTRACTS, getContracts, getChainFromId, CHAIN_IDS, OPENSEA_CHAIN_SLUGS, hasDeployedContracts, type SupportedChain } from '@/config/contracts';
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
  nft_collection_name: string;
  opensea_collection_name?: string;
  chain?: string;
}

interface NFTData {
  id: string;
  image?: string;
  claimable: string;
}

// Chain switcher component
function ChainSwitcher({ currentChain, onSwitch }: { currentChain: SupportedChain | null; onSwitch: (chain: SupportedChain) => void }) {
  return (
    <div className="flex gap-4 mb-8">
      <button
        onClick={() => onSwitch('base')}
        className={`flex-1 py-3 font-bold border-2 transition-colors flex items-center justify-center gap-2 ${
          currentChain === 'base'
            ? 'bg-white text-black border-white'
            : 'border-neutral-700 text-neutral-500 hover:border-white hover:text-white'
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 111 111" fill="currentColor">
          <path d="M54.921 110.034c30.354 0 54.967-24.593 54.967-54.921S85.275.191 54.921.191C26.043.191 2.003 22.567.142 51.031h71.858v7.983H.141c1.858 28.464 25.9 51.02 54.78 51.02Z"/>
        </svg>
        BASE
      </button>
      <button
        onClick={() => onSwitch('ethereum')}
        className={`flex-1 py-3 font-bold border-2 transition-colors flex items-center justify-center gap-2 ${
          currentChain === 'ethereum'
            ? 'bg-white text-black border-white'
            : 'border-neutral-700 text-neutral-500 hover:border-white hover:text-white'
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 784 784" fill="currentColor">
          <path d="M392.07 0L383.5 29.11v517.91l8.57 8.56 392.07-231.75z"/>
          <path d="M392.07 0L0 323.83l392.07 231.75V0z"/>
          <path d="M392.07 603.78L387.24 609.68v300.34l4.83 14.08 392.4-552.27z"/>
          <path d="M392.07 924.1V603.78L0 371.83z"/>
        </svg>
        ETH
      </button>
    </div>
  );
}

export default function ClaimPage() {
  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  
  // Determine current chain
  const currentChain = getChainFromId(chainId);
  const chainContracts = currentChain ? getContracts(currentChain) : getContracts('base');
  
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [totalClaimable, setTotalClaimable] = useState('0');
  const [loading, setLoading] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualIds, setManualIds] = useState('');
  
  const { writeContractAsync } = useWriteContract();

  // Handle chain switch
  const handleChainSwitch = (chain: SupportedChain) => {
    const targetChainId = chain === 'base' ? base.id : mainnet.id;
    if (chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  };

  // Fetch tokens from database on mount and when chain changes
  useEffect(() => {
    fetchTokens();
  }, [currentChain]);

  // Auto-fetch NFTs when wallet connects and token selected
  useEffect(() => {
    if (isConnected && address && selectedToken && !manualMode) {
      fetchNFTs();
    }
  }, [isConnected, address, selectedToken, manualMode]);

  // Fetch tokens from API and enrich with OpenSea collection names
  const fetchTokens = async () => {
    setLoadingTokens(true);
    try {
      const response = await fetch('/api/tokens');
      const data = await response.json();
      
      if (data.tokens && data.tokens.length > 0) {
        // Filter by current chain
        const chainTokens = data.tokens.filter((t: Token) => (t.chain || 'base') === (currentChain || 'base'));
        
        // Fetch collection names from OpenSea for each token
        const enrichedTokens = await Promise.all(
          chainTokens.map(async (token: Token) => {
            try {
              const collectionRes = await fetch(`/api/collection?address=${token.nft_collection}&chain=${currentChain || 'base'}`);
              const collectionData = await collectionRes.json();
              return {
                ...token,
                opensea_collection_name: collectionData.name || null,
              };
            } catch {
              return token;
            }
          })
        );
        
        setTokens(enrichedTokens);
        setSelectedToken(enrichedTokens[0] || null);
      } else {
        setTokens([]);
        setSelectedToken(null);
      }
    } catch (e) {
      console.error('Failed to fetch tokens:', e);
      setTokens([]);
      setSelectedToken(null);
    }
    setLoadingTokens(false);
  };

  // Fetch NFTs from OpenSea
  const fetchNFTs = async () => {
    if (!address || !publicClient || !selectedToken || !chainContracts.FEE_DISTRIBUTOR) return;
    
    setLoading(true);
    setError(null);
    setNfts([]);
    setSelectedNfts(new Set());
    
    try {
      // Use chain-specific OpenSea endpoint
      const chainSlug = OPENSEA_CHAIN_SLUGS[currentChain || 'base'];
      const response = await fetch(
        `/api/nfts?address=${address}&collection=${selectedToken.nft_collection}&includeImages=true&chain=${chainSlug}`
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch NFTs');
      }
      
      const data = await response.json();
      const tokenIds: string[] = data.tokenIds || [];
      const images: Record<string, string> = data.images || {};
      
      if (tokenIds.length === 0) {
        setNfts([]);
        setLoading(false);
        return;
      }
      
      // Fetch claimable amounts for each NFT
      const nftData: NFTData[] = [];
      let total = BigInt(0);
      
      for (const id of tokenIds) {
        try {
          const amount = await publicClient.readContract({
            address: chainContracts.FEE_DISTRIBUTOR,
            abi: FEE_DISTRIBUTOR_ABI,
            functionName: 'claimable',
            args: [selectedToken.address as `0x${string}`, BigInt(id)],
          });
          
          nftData.push({
            id,
            image: images[id],
            claimable: formatEther(amount),
          });
          total += amount;
        } catch (e) {
          nftData.push({
            id,
            image: images[id],
            claimable: '0',
          });
        }
      }
      
      // Sort by claimable amount (highest first)
      nftData.sort((a, b) => parseFloat(b.claimable) - parseFloat(a.claimable));
      
      setNfts(nftData);
      setTotalClaimable(formatEther(total));
      
      // Auto-select NFTs with claimable balance
      const withBalance = new Set(nftData.filter(n => parseFloat(n.claimable) > 0).map(n => n.id));
      setSelectedNfts(withBalance);
      
    } catch (e: any) {
      setError(e.message || 'Failed to fetch NFTs');
      setManualMode(true);
    }
    
    setLoading(false);
  };

  // Check claimable for manual IDs
  const checkManualIds = async () => {
    if (!publicClient || !manualIds.trim() || !selectedToken || !chainContracts.FEE_DISTRIBUTOR) return;
    
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

  // Calculate selected total (fixed decimal format, no scientific notation)
  const selectedTotalRaw = nfts
    .filter(n => selectedNfts.has(n.id))
    .reduce((sum, n) => sum + parseFloat(n.claimable), 0);
  
  // Format to avoid scientific notation - use toFixed with enough decimals
  const selectedTotal = selectedTotalRaw === 0 
    ? '0' 
    : selectedTotalRaw.toFixed(18).replace(/\.?0+$/, '');

  // Claim rewards
  const handleClaim = async () => {
    if (selectedNfts.size === 0 || !selectedToken || !chainContracts.FEE_DISTRIBUTOR) return;
    
    setClaiming(true);
    setError(null);
    setSuccess(null);
    
    try {
      const ids = Array.from(selectedNfts).map(id => BigInt(id));
      
      const hash = await writeContractAsync({
        address: chainContracts.FEE_DISTRIBUTOR,
        abi: FEE_DISTRIBUTOR_ABI,
        functionName: 'claim',
        args: [selectedToken.address as `0x${string}`, ids],
      });
      
      setSuccess(`Transaction submitted: ${hash}`);
      
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
        setSuccess(`Claimed successfully! TX: ${hash}`);
        // Refresh
        if (manualMode) {
          await checkManualIds();
        } else {
          await fetchNFTs();
        }
      }
    } catch (e: any) {
      setError(e.message || 'Claim failed');
    }
    
    setClaiming(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero */}
      <div className="border-b-2 border-white">
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-24">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4">
            CLAIM FEES
          </h1>
          <p className="text-xl md:text-2xl text-neutral-400 font-medium max-w-xl">
            Claim your WETH rewards.
          </p>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        {!isConnected ? (
          <div className="border-2 border-white p-12 text-center">
            <h2 className="text-2xl font-black mb-4">CONNECT WALLET</h2>
            <p className="text-neutral-500 mb-8">Connect your wallet to view and claim rewards</p>
            <button 
              onClick={() => connect({ connector: injected() })} 
              className="bg-white text-black px-12 py-4 text-lg font-bold hover:bg-neutral-200 transition-colors"
            >
              CONNECT
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Wallet */}
            <div className="flex items-center justify-between pb-6 border-b border-neutral-800">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 bg-white rounded-full"></div>
                <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </div>
              <button onClick={() => disconnect()} className="text-neutral-500 hover:text-white">
                Disconnect
              </button>
            </div>

            {/* Chain Switcher */}
            <ChainSwitcher currentChain={currentChain} onSwitch={handleChainSwitch} />

            {/* Show warning if Ethereum contracts not deployed */}
            {currentChain === 'ethereum' && !hasDeployedContracts('ethereum') && (
              <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-4 text-sm text-yellow-400">
                ⚠️ Ethereum contracts not deployed yet. Claims coming soon!
              </div>
            )}

            {loadingTokens ? (
              <div className="border-2 border-neutral-800 p-12 text-center">
                <p className="text-xl font-bold">LOADING TOKENS...</p>
              </div>
            ) : tokens.length === 0 ? (
              <div className="border-2 border-neutral-800 p-12 text-center">
                <p className="text-xl font-bold mb-2">NO TOKENS FOUND</p>
                <p className="text-neutral-500">No tokens have been deployed on {currentChain?.toUpperCase() || 'BASE'} yet</p>
              </div>
            ) : (
              <>
                {/* Token Selector */}
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
                    className="w-full bg-black border-2 border-white p-4 font-mono text-lg"
                  >
                    {tokens.map(token => (
                      <option key={token.address} value={token.address}>
                        ${token.symbol} — {token.opensea_collection_name || token.nft_collection_name || 'Unknown Collection'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-4">
                  <button
                    onClick={() => { setManualMode(false); fetchNFTs(); }}
                    className={`flex-1 py-3 font-bold border-2 transition-colors ${
                      !manualMode 
                        ? 'bg-white text-black border-white' 
                        : 'border-neutral-700 text-neutral-500 hover:border-white hover:text-white'
                    }`}
                  >
                    AUTO-DETECT
                  </button>
                  <button
                    onClick={() => setManualMode(true)}
                    className={`flex-1 py-3 font-bold border-2 transition-colors ${
                      manualMode 
                        ? 'bg-white text-black border-white' 
                        : 'border-neutral-700 text-neutral-500 hover:border-white hover:text-white'
                    }`}
                  >
                    MANUAL ENTRY
                  </button>
                </div>

                {/* Manual Entry */}
                {manualMode && (
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
                        className="w-full bg-black border-2 border-white p-4 font-mono text-lg placeholder-neutral-600"
                      />
                    </div>
                    <button
                      onClick={checkManualIds}
                      disabled={loading || !manualIds.trim()}
                      className={`w-full py-4 font-bold text-lg border-2 border-white transition-colors ${
                        loading || !manualIds.trim() 
                          ? 'bg-neutral-900 text-neutral-600 cursor-not-allowed' 
                          : 'hover:bg-white hover:text-black'
                      }`}
                    >
                      {loading ? 'CHECKING...' : 'CHECK CLAIMABLE'}
                    </button>
                  </div>
                )}

                {/* Loading */}
                {loading && !manualMode && (
                  <div className="border-2 border-neutral-800 p-12 text-center">
                    <div className="animate-pulse">
                      <p className="text-xl font-bold">SCANNING WALLET...</p>
                      <p className="text-neutral-500 mt-2">Fetching your NFTs from OpenSea</p>
                    </div>
                  </div>
                )}

                {/* No NFTs Found */}
                {!loading && !manualMode && nfts.length === 0 && selectedToken && (
                  <div className="border-2 border-neutral-800 p-12 text-center">
                    <p className="text-xl font-bold mb-2">NO NFTs FOUND</p>
                    <p className="text-neutral-500 mb-6">
                      No {selectedToken.opensea_collection_name || selectedToken.nft_collection_name || 'eligible'} NFTs detected in your wallet
                    </p>
                    <button
                      onClick={() => setManualMode(true)}
                      className="text-white underline hover:no-underline"
                    >
                      Enter token IDs manually
                    </button>
                  </div>
                )}

                {/* NFT Grid */}
                {nfts.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold tracking-widest text-neutral-500">
                        YOUR NFTs ({nfts.length})
                      </p>
                      <button 
                        onClick={selectAllWithBalance}
                        className="text-sm text-neutral-500 hover:text-white"
                      >
                        Select all with balance
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {nfts.map((nft) => (
                        <button
                          key={nft.id}
                          onClick={() => toggleNft(nft.id)}
                          className={`border-2 p-4 text-left transition-colors ${
                            selectedNfts.has(nft.id)
                              ? 'border-white bg-neutral-900'
                              : 'border-neutral-800 hover:border-neutral-600'
                          }`}
                        >
                          {nft.image && (
                            <img 
                              src={nft.image} 
                              alt={`#${nft.id}`}
                              className="w-full aspect-square object-cover mb-3"
                            />
                          )}
                          <p className="font-mono font-bold">#{nft.id}</p>
                          <p className={`font-mono text-sm ${
                            parseFloat(nft.claimable) > 0 ? 'text-white' : 'text-neutral-600'
                          }`}>
                            {nft.claimable} WETH
                          </p>
                          {selectedNfts.has(nft.id) && (
                            <div className="mt-2 text-xs text-white">✓ Selected</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total & Claim */}
                {nfts.length > 0 && (
                  <div className="border-2 border-white">
                    <div className="p-6 border-b border-neutral-800">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold tracking-widest text-neutral-500 mb-1">
                            SELECTED ({selectedNfts.size} NFTs)
                          </p>
                          <p className="font-mono text-2xl font-black">{selectedTotal} WETH</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold tracking-widest text-neutral-500 mb-1">
                            TOTAL CLAIMABLE
                          </p>
                          <p className="font-mono text-lg text-neutral-400">{totalClaimable} WETH</p>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleClaim}
                      disabled={claiming || selectedNfts.size === 0 || parseFloat(selectedTotal) === 0 || !hasDeployedContracts(currentChain || 'base')}
                      className={`w-full py-5 font-black text-lg transition-colors ${
                        claiming || selectedNfts.size === 0 || parseFloat(selectedTotal) === 0 || !hasDeployedContracts(currentChain || 'base')
                          ? 'bg-neutral-900 text-neutral-600 cursor-not-allowed'
                          : 'bg-white text-black hover:bg-neutral-200'
                      }`}
                    >
                      {claiming ? 'CLAIMING...' : `CLAIM ${selectedTotal} WETH`}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Error/Success */}
            {error && (
              <div className="border-2 border-red-500 p-4">
                <p className="text-red-400 font-mono text-sm break-all">{error}</p>
              </div>
            )}
            {success && (
              <div className="border-2 border-green-500 p-4">
                <p className="text-green-400 font-mono text-sm break-all">{success}</p>
              </div>
            )}

            {/* Info */}
            {selectedToken && (
              <div className="border border-neutral-800 p-6">
                <p className="text-xs font-bold tracking-widest text-neutral-500 mb-4">HOW IT WORKS</p>
                <ol className="space-y-2 text-neutral-400 text-sm">
                  <li>1. Your {selectedToken.opensea_collection_name || selectedToken.nft_collection_name || 'eligible'} NFTs are auto-detected via OpenSea</li>
                  <li>2. Select which NFTs to claim rewards for</li>
                  <li>3. Click "Claim" to receive your WETH</li>
                </ol>
                <p className="text-neutral-600 text-xs mt-4">
                  Fee distribution: 80% to NFT holders, 10% treasury, 10% buyback
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
