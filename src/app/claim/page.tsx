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
  opensea_collection_name?: string;
}

interface WalletNFT {
  identifier: string;
  name: string;
  image_url: string | null;
  collection: string;
  claimable?: string;
  selected?: boolean;
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
  const [walletNFTs, setWalletNFTs] = useState<WalletNFT[]>([]);
  const [loadingNFTs, setLoadingNFTs] = useState(false);
  const [loadingClaimable, setLoadingClaimable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const isOnWrongChain = chainId !== CHAIN_ID;

  // Fetch available tokens
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const response = await fetch('/api/tokens');
        const data = await response.json();
        if (data.tokens) {
          const filtered = data.tokens.filter((t: any) => t.nft_collection);
          setTokens(filtered);
          if (filtered.length > 0) setSelectedToken(filtered[0]);
        }
      } catch (e) { console.error('Failed to fetch tokens:', e); }
    };
    fetchTokens();
  }, []);

  // Auto-detect NFTs when token or wallet changes
  useEffect(() => {
    if (!address || !selectedToken?.opensea_collection_name) {
      setWalletNFTs([]);
      return;
    }
    
    const fetchWalletNFTs = async () => {
      setLoadingNFTs(true);
      setError(null);
      try {
        const response = await fetch(`/api/nfts?wallet=${address}&collection=${selectedToken.opensea_collection_name}`);
        const data = await response.json();
        if (data.nfts && data.nfts.length > 0) {
          setWalletNFTs(data.nfts.map((nft: any) => ({ ...nft, selected: true })));
        } else {
          setWalletNFTs([]);
        }
      } catch (e) {
        console.error('Failed to fetch NFTs:', e);
        setWalletNFTs([]);
      }
      setLoadingNFTs(false);
    };
    
    fetchWalletNFTs();
  }, [address, selectedToken]);

  // Check claimable amounts for detected NFTs
  useEffect(() => {
    if (!publicClient || !selectedToken || walletNFTs.length === 0 || isOnWrongChain) return;
    
    const checkClaimable = async () => {
      setLoadingClaimable(true);
      const updated = await Promise.all(walletNFTs.map(async (nft) => {
        try {
          const claimable = await publicClient.readContract({
            address: CONTRACTS.FEE_DISTRIBUTOR,
            abi: FEE_DISTRIBUTOR_ABI,
            functionName: 'claimable',
            args: [selectedToken.address as `0x${string}`, BigInt(nft.identifier)],
          });
          return { ...nft, claimable: formatEther(claimable as bigint) };
        } catch (e) {
          return { ...nft, claimable: '0' };
        }
      }));
      setWalletNFTs(updated);
      setLoadingClaimable(false);
    };
    
    checkClaimable();
  }, [publicClient, selectedToken, walletNFTs.length, isOnWrongChain]);

  const toggleNFT = (id: string) => {
    setWalletNFTs(prev => prev.map(nft => nft.identifier === id ? { ...nft, selected: !nft.selected } : nft));
  };

  const handleClaim = async () => {
    if (!selectedToken || isOnWrongChain) return;
    const claimableIds = walletNFTs
      .filter(n => n.selected && parseFloat(n.claimable || '0') > 0)
      .map(n => BigInt(n.identifier));
    if (claimableIds.length === 0) { setError('No claimable rewards selected'); return; }
    setError(null);
    try {
      writeContract({
        address: CONTRACTS.FEE_DISTRIBUTOR,
        abi: FEE_DISTRIBUTOR_ABI,
        functionName: 'claim',
        args: [selectedToken.address as `0x${string}`, claimableIds],
        chainId: CHAIN_ID,
      });
    } catch (e: any) { setError(e.message || 'Claim failed'); }
  };

  const selectedNFTs = walletNFTs.filter(n => n.selected);
  const totalClaimable = selectedNFTs.reduce((sum, n) => sum + parseFloat(n.claimable || '0'), 0);

  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('ipfs://')) return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
    return url;
  };

  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-6">
        <div className="text-xs text-neutral-500 mb-2 tracking-widest">BASE</div>
        <h1 className="font-editorial text-3xl md:text-4xl">CLAIM</h1>
        <p className="text-neutral-500 text-sm mt-1">Collect WETH rewards for your NFTs</p>
      </div>

      {!isConnected ? (
        <div className="border-2 border-white p-8 text-center">
          <p className="text-neutral-500 mb-6">Connect your wallet to claim rewards</p>
          <button onClick={() => connect({ connector: injected() })} className="btn-primary">Connect Wallet</button>
        </div>
      ) : (
        <div className="space-y-4">
          {isOnWrongChain && (
            <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-4 text-yellow-400">
              ⚠️ Please switch to Base
              <button onClick={() => switchChain({ chainId: CHAIN_ID })} className="ml-2 underline hover:no-underline">Switch now</button>
            </div>
          )}

          <div className="border-2 border-white p-4 flex justify-between items-center">
            <span className="font-mono text-sm text-neutral-400">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
            <button onClick={() => disconnect()} className="text-neutral-500 hover:text-white text-xs uppercase tracking-wider">Disconnect</button>
          </div>

          <div className="border-2 border-white p-4">
            <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">SELECT TOKEN</label>
            <select
              value={selectedToken?.address || ''}
              onChange={(e) => { const t = tokens.find(t => t.address === e.target.value); if (t) { setSelectedToken(t); setWalletNFTs([]); }}}
              className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none"
            >
              {tokens.map(t => <option key={t.address} value={t.address}>{t.symbol} - {t.nft_collection_name || 'NFT Collection'}</option>)}
            </select>
          </div>

          {loadingNFTs ? (
            <div className="border-2 border-white p-8 text-center text-neutral-500">Detecting NFTs in your wallet...</div>
          ) : walletNFTs.length > 0 ? (
            <div className="border-2 border-white">
              <div className="border-b-2 border-white p-4 flex justify-between items-center">
                <span className="text-xs text-neutral-500 uppercase tracking-wider">YOUR NFTS ({walletNFTs.length})</span>
                <span className="text-xs text-neutral-500">{loadingClaimable ? 'Checking...' : `${totalClaimable.toFixed(6)} WETH claimable`}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2">
                {walletNFTs.map(nft => (
                  <button
                    key={nft.identifier}
                    onClick={() => toggleNFT(nft.identifier)}
                    className={`border-2 p-2 text-left transition-colors ${nft.selected ? 'border-white bg-white/5' : 'border-neutral-700 opacity-50'}`}
                  >
                    {nft.image_url && (
                      <div className="aspect-square bg-neutral-900 mb-2 overflow-hidden">
                        <img src={getImageUrl(nft.image_url) || ''} alt={nft.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="text-xs truncate">{nft.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{nft.claimable ? `${parseFloat(nft.claimable).toFixed(6)} WETH` : '...'}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : selectedToken?.opensea_collection_name ? (
            <div className="border-2 border-white p-8 text-center text-neutral-500">No NFTs found in your wallet for this collection</div>
          ) : (
            <div className="border-2 border-white p-8 text-center text-neutral-500">This token does not have NFT detection configured</div>
          )}

          {(error || writeError) && (
            <div className="border-2 border-red-500/50 bg-red-500/10 p-4 text-red-400 text-sm">{error || writeError?.message}</div>
          )}

          {isSuccess && (
            <div className="border-2 border-green-500/50 bg-green-500/10 p-4 text-green-400 text-sm">
              Claimed successfully!{' '}
              <a href={`${BLOCK_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">View tx →</a>
            </div>
          )}

          <button
            onClick={handleClaim}
            disabled={isPending || isConfirming || totalClaimable === 0 || isOnWrongChain}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending || isConfirming ? 'Confirming...' : totalClaimable > 0 ? `Claim ${totalClaimable.toFixed(6)} WETH` : 'Nothing to claim'}
          </button>
        </div>
      )}
    </div>
  );
}
