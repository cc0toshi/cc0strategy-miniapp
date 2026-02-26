'use client';

import { useState, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount, useConnect, useDisconnect, useWriteContract, usePublicClient, useChainId, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, encodeAbiParameters, isAddress } from 'viem';
import { getContracts, getChainFromId, type SupportedChain } from '@/config/contracts';
import { base, mainnet } from '@/config/wagmi';

const ERC721_ABI = [
  { name: 'name', type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'symbol', type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'totalSupply', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

const FACTORY_ABI = [
  {
    name: 'deployToken',
    type: 'function',
    inputs: [{ name: 'config', type: 'tuple', components: [
      { name: 'tokenAdmin', type: 'address' },
      { name: 'tokenImage', type: 'string' },
      { name: 'tokenName', type: 'string' },
      { name: 'tokenSymbol', type: 'string' },
      { name: 'tokenMetadata', type: 'string' },
      { name: 'tokenContext', type: 'string' },
      { name: 'nftCollection', type: 'address' },
      { name: 'startingTick', type: 'int24' },
      { name: 'poolHook', type: 'address' },
      { name: 'locker', type: 'address' },
      { name: 'mevModule', type: 'address' },
      { name: 'extensionsSupply', type: 'uint256' },
      { name: 'extensions', type: 'address[]' },
    ]}],
    outputs: [{ type: 'address' }],
    stateMutability: 'payable',
  },
] as const;

export default function DeployPage() {
  const [nftCollection, setNftCollection] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenImage, setTokenImage] = useState('');
  const [collectionInfo, setCollectionInfo] = useState<{ name: string; symbol: string; supply: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const currentChain = getChainFromId(chainId);
  const chainContracts = currentChain ? getContracts(currentChain) : getContracts('base');

  // Validate NFT collection
  useEffect(() => {
    const validateCollection = async () => {
      if (!nftCollection || !isAddress(nftCollection) || !publicClient) {
        setCollectionInfo(null);
        return;
      }
      try {
        const [name, symbol, supply] = await Promise.all([
          publicClient.readContract({ address: nftCollection as `0x${string}`, abi: ERC721_ABI, functionName: 'name' }),
          publicClient.readContract({ address: nftCollection as `0x${string}`, abi: ERC721_ABI, functionName: 'symbol' }),
          publicClient.readContract({ address: nftCollection as `0x${string}`, abi: ERC721_ABI, functionName: 'totalSupply' }),
        ]);
        setCollectionInfo({ name: name as string, symbol: symbol as string, supply: supply.toString() });
      } catch (e) {
        setCollectionInfo(null);
      }
    };
    validateCollection();
  }, [nftCollection, publicClient]);

  const handleDeploy = async () => {
    if (!address || !tokenName || !tokenSymbol || !nftCollection) return;
    setError(null);
    setSuccess(null);

    try {
      const config = {
        tokenAdmin: address,
        tokenImage: tokenImage || '',
        tokenName,
        tokenSymbol,
        tokenMetadata: '',
        tokenContext: 'cc0strategy',
        nftCollection: nftCollection as `0x${string}`,
        startingTick: -230400,
        poolHook: chainContracts.HOOK,
        locker: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        mevModule: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        extensionsSupply: 0n,
        extensions: [] as `0x${string}`[],
      };

      writeContract({
        address: chainContracts.FACTORY,
        abi: FACTORY_ABI,
        functionName: 'deployToken',
        args: [config],
        value: parseEther('0.001'),
      });
    } catch (e: any) {
      setError(e.message || 'Deployment failed');
    }
  };

  useEffect(() => {
    if (isSuccess && txHash) {
      setSuccess(`Token deployed! TX: ${txHash.slice(0, 10)}...`);
    }
  }, [isSuccess, txHash]);

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black tracking-tight mb-1">DEPLOY</h1>
        <p className="text-neutral-500 text-sm">Launch a new cc0strategy token</p>
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
              <span className="text-xs text-neutral-500">({currentChain?.toUpperCase() || 'BASE'})</span>
            </div>
            <button onClick={() => disconnect()} className="text-neutral-500 hover:text-white text-sm">
              Disconnect
            </button>
          </div>

          {/* Chain Switcher */}
          <div className="flex gap-2">
            <button
              onClick={() => switchChain({ chainId: base.id })}
              className={`flex-1 py-3 font-bold border-2 transition-colors ${
                currentChain === 'base' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
              }`}
            >
              BASE
            </button>
            <button
              onClick={() => switchChain({ chainId: mainnet.id })}
              className={`flex-1 py-3 font-bold border-2 transition-colors ${
                currentChain === 'ethereum' ? 'bg-white text-black border-white' : 'border-neutral-700 text-neutral-500'
              }`}
            >
              ETHEREUM
            </button>
          </div>

          {/* NFT Collection */}
          <div>
            <label className="block text-xs font-bold tracking-widest text-neutral-500 mb-2">
              NFT COLLECTION ADDRESS
            </label>
            <input
              type="text"
              value={nftCollection}
              onChange={(e) => setNftCollection(e.target.value)}
              placeholder="0x..."
              className="w-full bg-black border-2 border-white p-3 font-mono text-sm placeholder-neutral-600"
            />
            {collectionInfo && (
              <div className="mt-2 p-2 bg-neutral-900 text-xs">
                <span className="text-white">{collectionInfo.name}</span>
                <span className="text-neutral-500"> ({collectionInfo.symbol})</span>
                <span className="text-neutral-600"> • {collectionInfo.supply} supply</span>
              </div>
            )}
          </div>

          {/* Token Name */}
          <div>
            <label className="block text-xs font-bold tracking-widest text-neutral-500 mb-2">
              TOKEN NAME
            </label>
            <input
              type="text"
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              placeholder="My Token"
              className="w-full bg-black border-2 border-white p-3 font-mono text-sm placeholder-neutral-600"
            />
          </div>

          {/* Token Symbol */}
          <div>
            <label className="block text-xs font-bold tracking-widest text-neutral-500 mb-2">
              TOKEN SYMBOL
            </label>
            <input
              type="text"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
              placeholder="TKN"
              className="w-full bg-black border-2 border-white p-3 font-mono text-sm placeholder-neutral-600"
            />
          </div>

          {/* Token Image */}
          <div>
            <label className="block text-xs font-bold tracking-widest text-neutral-500 mb-2">
              TOKEN IMAGE URL (optional)
            </label>
            <input
              type="text"
              value={tokenImage}
              onChange={(e) => setTokenImage(e.target.value)}
              placeholder="https://... or ipfs://..."
              className="w-full bg-black border-2 border-white p-3 font-mono text-sm placeholder-neutral-600"
            />
          </div>

          {/* Deploy Button */}
          <button
            onClick={handleDeploy}
            disabled={isPending || isConfirming || !tokenName || !tokenSymbol || !nftCollection}
            className={`w-full py-4 font-black text-lg transition-colors ${
              isPending || isConfirming || !tokenName || !tokenSymbol || !nftCollection
                ? 'bg-neutral-900 text-neutral-600 border-2 border-neutral-800'
                : 'bg-white text-black hover:bg-neutral-200'
            }`}
          >
            {isPending ? 'CONFIRM IN WALLET...' : isConfirming ? 'DEPLOYING...' : 'DEPLOY TOKEN (0.001 ETH)'}
          </button>

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
          <div className="border border-neutral-800 p-4 mt-4">
            <p className="text-xs font-bold tracking-widest text-neutral-500 mb-2">DEPLOYMENT INFO</p>
            <ul className="space-y-1 text-neutral-400 text-xs">
              <li>• Cost: 0.001 ETH (covers gas)</li>
              <li>• 80% of trading fees go to NFT holders</li>
              <li>• Token is automatically registered</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
