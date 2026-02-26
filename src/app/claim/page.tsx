// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, usePublicClient, useSwitchChain, useChainId, useWaitForTransactionReceipt } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatEther } from 'viem';
import { CONTRACTS, CHAIN_ID, BLOCK_EXPLORER } from '@/config/contracts';
import Image from 'next/image';

const FEE_DISTRIBUTOR_ABI = [
  { name: 'claimable', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [{ name: 'amount', type: 'uint256' }], stateMutability: 'view' },
  { name: 'claim', type: 'function', inputs: [{ name: 'token', type: 'address' }, { name: 'tokenIds', type: 'uint256[]' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

interface Token {
  address: string;
  symbol: string;
  name: string;
  nft_collection: string;
  nft_collection_name: string;
}

interface NFTData {
  id: string;
  image?: string;
  claimable: string;
}

function NFTCard({ nft, selected, onToggle }: { nft: NFTData; selected: boolean; onToggle: () => void }) {
  const hasClaimable = parseFloat(nft.claimable) > 0;
  return (
    <button onClick={onToggle} className={`border-2 p-3 transition-all ${selected ? 'border-white bg-white/5' : 'border-neutral-700 hover:border-neutral-500'} ${!hasClaimable ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        {nft.image ? (
          <div className="w-12 h-12 relative flex-shrink-0 bg-neutral-900">
            <Image src={nft.image} alt={`#${nft.id}`} fill className="object-cover" unoptimized />
          </div>
        ) : (
          <div className="w-12 h-12 bg-neutral-900 flex items-center justify-center text-xs text-neutral-500">#{nft.id}</div>
        )}
        <div className="flex-1 text-left min-w-0">
          <div className="font-mono text-sm truncate">#{nft.id}</div>
          <div className={`text-[10px] font-mono break-all leading-tight ${hasClaimable ? 'text-green-500' : 'text-neutral-600'}`}>
            {nft.claimable} WETH
          </div>
        </div>
        <div className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-white bg-white' : 'border-neutral-600'}`}>
          {selected && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
      </div>
    </button>
  );
}

export default function ClaimPage() {
  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [totalClaimable, setTotalClaimable] = useState('0');
  const [loading, setLoading] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualIds, setManualIds] = useState('');

  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const isOnWrongChain = chainId !== CHAIN_ID;

  // Fetch tokens
  useEffect(() => {
    const fetchTokens = async () => {
      setLoadingTokens(true);
      try {
        const response = await fetch('/api/tokens');
        const data = await response.json();
        if (data.tokens) {
          const filtered = data.tokens.filter((t: any) => t.nft_collection);
          setTokens(filtered);
          if (filtered.length > 0) setSelectedToken(filtered[0]);
        }
      } catch (e) { console.error('Failed to fetch tokens:', e); }
      setLoadingTokens(false);
    };
    fetchTokens();
  }, []);

  // Auto-fetch NFTs when wallet connects and token selected
  useEffect(() => {
    if (isConnected && address && selectedToken && !manualMode && !isOnWrongChain) {
      fetchNFTs();
    }
  }, [isConnected, address, selectedToken, manualMode, isOnWrongChain]);

  const fetchNFTs = async () => {
    if (!address || !publicClient || !selectedToken) return;
    
    setLoading(true);
    setError(null);
    setNfts([]);
    setSelectedNfts(new Set());
    
    try {
      const response = await fetch(`/api/nfts?address=${address}&collection=${selectedToken.nft_collection}&includeImages=true`);
      
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
      
      // Fetch claimable amounts
      const nftData: NFTData[] = [];
      let total = BigInt(0);
      
      for (const id of tokenIds) {
        try {
          const amount = await publicClient.readContract({
            address: CONTRACTS.FEE_DISTRIBUTOR,
            abi: FEE_DISTRIBUTOR_ABI,
            functionName: 'claimable',
            args: [selectedToken.address as `0x${string}`, BigInt(id)],
          });
          nftData.push({ id, image: images[id], claimable: formatEther(amount) });
          total += amount;
        } catch (e) {
          nftData.push({ id, image: images[id], claimable: '0' });
        }
      }
      
      // Sort by claimable (highest first)
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

  // Manual mode: check claimable for entered IDs
  const checkManualIds = async () => {
    if (!publicClient || !selectedToken || !manualIds.trim()) return;
    
    setLoading(true);
    setError(null);
    setNfts([]);
    
    const ids = manualIds.split(',').map(s => s.trim()).filter(s => s && !isNaN(Number(s)));
    if (ids.length === 0) { setError('Enter valid NFT IDs'); setLoading(false); return; }
    
    const nftData: NFTData[] = [];
    let total = BigInt(0);
    
    for (const id of ids) {
      try {
        const amount = await publicClient.readContract({
          address: CONTRACTS.FEE_DISTRIBUTOR,
          abi: FEE_DISTRIBUTOR_ABI,
          functionName: 'claimable',
          args: [selectedToken.address as `0x${string}`, BigInt(id)],
        });
        nftData.push({ id, claimable: formatEther(amount) });
        total += amount;
      } catch (e) {
        nftData.push({ id, claimable: '0' });
      }
    }
    
    setNfts(nftData);
    setTotalClaimable(formatEther(total));
    const withBalance = new Set(nftData.filter(n => parseFloat(n.claimable) > 0).map(n => n.id));
    setSelectedNfts(withBalance);
    setLoading(false);
  };

  const toggleNft = (id: string) => {
    setSelectedNfts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedNfts(new Set(nfts.filter(n => parseFloat(n.claimable) > 0).map(n => n.id)));
  };

  const deselectAll = () => {
    setSelectedNfts(new Set());
  };

  // Calculate selected claimable as string (full precision)
  const selectedClaimableNum = nfts.filter(n => selectedNfts.has(n.id)).reduce((sum, n) => sum + parseFloat(n.claimable), 0);
  const selectedClaimableStr = nfts
    .filter(n => selectedNfts.has(n.id))
    .reduce((sum, n) => sum + BigInt(Math.floor(parseFloat(n.claimable) * 1e18)), BigInt(0));
  const selectedClaimableFormatted = formatEther(selectedClaimableStr);

  const handleClaim = async () => {
    if (!selectedToken || selectedNfts.size === 0 || isOnWrongChain) return;
    setError(null);
    
    try {
      const ids = Array.from(selectedNfts).map(id => BigInt(id));
      await writeContractAsync({
        address: CONTRACTS.FEE_DISTRIBUTOR,
        abi: FEE_DISTRIBUTOR_ABI,
        functionName: 'claim',
        args: [selectedToken.address as `0x${string}`, ids],
        chainId: CHAIN_ID,
      });
    } catch (e: any) {
      setError(e.message || 'Claim failed');
    }
  };

  // Refresh after successful claim
  useEffect(() => {
    if (isSuccess && !manualMode) {
      setTimeout(() => fetchNFTs(), 2000);
    }
  }, [isSuccess]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-4 pt-6 pb-8">
        <div className="mb-6">
          <div className="text-xs text-neutral-500 mb-2 tracking-widest">BASE</div>
          <h1 className="font-editorial text-2xl mb-1">CLAIM</h1>
          <p className="text-neutral-500 text-sm">Collect WETH rewards for your NFTs</p>
        </div>

        {!isConnected ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-neutral-500 mb-6">Connect wallet to claim</p>
            <button onClick={() => connect({ connector: injected() })} className="btn-primary">Connect Wallet</button>
          </div>
        ) : (
          <div className="space-y-4">
            {isOnWrongChain && (
              <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-400">
                ⚠️ Switch to Base <button onClick={() => switchChain({ chainId: CHAIN_ID })} className="ml-2 underline">Switch</button>
              </div>
            )}

            <div className="border border-neutral-800 p-3 flex justify-between items-center">
              <span className="font-mono text-sm text-neutral-400">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <button onClick={() => disconnect()} className="text-neutral-500 hover:text-white text-xs uppercase">Disconnect</button>
            </div>

            {/* Token Selector */}
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">TOKEN</label>
              <select
                value={selectedToken?.address || ''}
                onChange={(e) => { const t = tokens.find(t => t.address === e.target.value); if (t) { setSelectedToken(t); setNfts([]); setManualMode(false); } }}
                className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none"
                disabled={loadingTokens}
              >
                {tokens.map(t => <option key={t.address} value={t.address}>{t.symbol} - {t.nft_collection_name || 'NFT'}</option>)}
              </select>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-2">
              <button onClick={() => { setManualMode(false); if (selectedToken) fetchNFTs(); }} className={`flex-1 py-2 text-xs uppercase tracking-wider border-2 ${!manualMode ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'}`}>Auto-detect</button>
              <button onClick={() => setManualMode(true)} className={`flex-1 py-2 text-xs uppercase tracking-wider border-2 ${manualMode ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'}`}>Manual</button>
            </div>

            {manualMode && (
              <div className="space-y-3">
                <input type="text" placeholder="NFT IDs: 1, 2, 3..." value={manualIds} onChange={(e) => setManualIds(e.target.value)} className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none" />
                <button onClick={checkManualIds} disabled={loading || !manualIds.trim()} className="btn-primary w-full disabled:opacity-50">{loading ? 'Checking...' : 'Check Claimable'}</button>
              </div>
            )}

            {error && <div className="border-2 border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

            {loading && <div className="text-center py-8 text-neutral-500">Loading your NFTs...</div>}

            {!loading && !manualMode && nfts.length === 0 && selectedToken && (
              <div className="text-center py-8 text-neutral-500">No NFTs found for this collection</div>
            )}

            {nfts.length > 0 && (
              <>
                {/* Select controls */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">{nfts.length} NFT{nfts.length !== 1 ? 's' : ''} found</span>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-neutral-400 hover:text-white">Select all</button>
                    <button onClick={deselectAll} className="text-xs text-neutral-400 hover:text-white">Deselect</button>
                  </div>
                </div>

                {/* NFT Grid */}
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                  {nfts.map(nft => (
                    <NFTCard key={nft.id} nft={nft} selected={selectedNfts.has(nft.id)} onToggle={() => toggleNft(nft.id)} />
                  ))}
                </div>

                {/* Summary & Claim */}
                <div className="border-t border-neutral-800 pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">Selected</span>
                    <span className="font-mono">{selectedNfts.size} NFT{selectedNfts.size !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-neutral-500 text-sm">CLAIMABLE</span>
                    <span className="text-green-500 font-mono text-[11px] break-all leading-tight">{selectedClaimableFormatted} WETH</span>
                  </div>
                  {selectedClaimableNum > 0 && (
                    <button onClick={handleClaim} disabled={isPending || isConfirming || isOnWrongChain} className="btn-primary w-full disabled:opacity-50">
                      {isPending || isConfirming ? 'Claiming...' : 'Claim WETH'}
                    </button>
                  )}
                </div>

                {isSuccess && txHash && (
                  <div className="text-center">
                    <a href={`${BLOCK_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:underline">✓ Claimed! View on BaseScan →</a>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
