// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, usePublicClient, useSwitchChain, useChainId, useWaitForTransactionReceipt } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { formatEther } from 'viem';
import { CONTRACTS, CHAIN_ID, BLOCK_EXPLORER } from '@/config/contracts';

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

interface NFTData {
  id: string;
  claimable: string;
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
  const [nftIds, setNftIds] = useState<string>('');
  const [nftData, setNftData] = useState<NFTData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const isOnWrongChain = chainId !== CHAIN_ID;

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

  const checkClaimable = async () => {
    if (!publicClient || !selectedToken || !nftIds.trim() || isOnWrongChain) return;
    setLoading(true);
    setError(null);
    setNftData([]);

    const ids = nftIds.split(',').map(s => s.trim()).filter(s => s && !isNaN(Number(s)));
    if (ids.length === 0) { setError('Enter valid NFT IDs'); setLoading(false); return; }

    try {
      const results: NFTData[] = [];
      for (const id of ids) {
        try {
          const claimable = await publicClient.readContract({
            address: CONTRACTS.FEE_DISTRIBUTOR,
            abi: FEE_DISTRIBUTOR_ABI,
            functionName: 'claimable',
            args: [selectedToken.address as `0x${string}`, BigInt(id)],
          });
          results.push({ id, claimable: formatEther(claimable as bigint) });
        } catch (e) { results.push({ id, claimable: '0' }); }
      }
      setNftData(results);
    } catch (e: any) { setError(e.message || 'Failed to check claimable'); }
    setLoading(false);
  };

  const handleClaim = async () => {
    if (!selectedToken || nftData.length === 0 || isOnWrongChain) return;
    const claimableIds = nftData.filter(n => parseFloat(n.claimable) > 0).map(n => BigInt(n.id));
    if (claimableIds.length === 0) { setError('No claimable rewards'); return; }
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

  const totalClaimable = nftData.reduce((sum, n) => sum + parseFloat(n.claimable), 0);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container-editorial pt-16 pb-8">
        <div className="mb-6">
          <div className="text-xs text-neutral-500 mb-2 tracking-widest">BASE</div>
          <h1 className="headline-lg font-editorial mb-1">CLAIM</h1>
          <p className="text-neutral-500 text-sm">Collect WETH rewards for your NFTs</p>
        </div>

        {!isConnected ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-neutral-500 mb-6">Connect your wallet to claim rewards</p>
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

            <div className="card-brutal p-6 space-y-4">
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">SELECT TOKEN</label>
                <select
                  value={selectedToken?.address || ''}
                  onChange={(e) => { const t = tokens.find(t => t.address === e.target.value); if (t) setSelectedToken(t); setNftData([]); }}
                  className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none"
                >
                  {tokens.map(t => <option key={t.address} value={t.address}>{t.symbol} - {t.nft_collection_name || 'NFT Collection'}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">NFT IDS (comma separated)</label>
                <input
                  type="text"
                  placeholder="1, 2, 3..."
                  value={nftIds}
                  onChange={(e) => setNftIds(e.target.value)}
                  className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none"
                />
              </div>

              <button onClick={checkClaimable} disabled={loading || !nftIds.trim() || isOnWrongChain} className="btn-primary w-full disabled:opacity-50">
                {loading ? 'Checking...' : 'Check Claimable'}
              </button>

              {error && <div className="border-2 border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
              {writeError && <div className="border-2 border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">{writeError.message}</div>}

              {nftData.length > 0 && (
                <div className="border-t border-neutral-800 pt-4 space-y-3">
                  {nftData.map(n => (
                    <div key={n.id} className="flex justify-between items-center text-sm">
                      <span className="font-mono">NFT #{n.id}</span>
                      <span className={parseFloat(n.claimable) > 0 ? 'text-green-500' : 'text-neutral-500'}>{parseFloat(n.claimable).toFixed(6)} WETH</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-neutral-800 font-bold">
                    <span>TOTAL</span>
                    <span className="text-green-500">{totalClaimable.toFixed(6)} WETH</span>
                  </div>
                  {totalClaimable > 0 && (
                    <button onClick={handleClaim} disabled={isPending || isConfirming || isOnWrongChain} className="btn-primary w-full">
                      {isPending || isConfirming ? 'Claiming...' : `Claim ${totalClaimable.toFixed(4)} WETH`}
                    </button>
                  )}
                </div>
              )}

              {isSuccess && txHash && (
                <div className="text-center pt-2">
                  <a href={`${BLOCK_EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:underline">✓ Claimed! View on BaseScan →</a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
