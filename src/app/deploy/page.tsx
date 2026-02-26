// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain, useChainId } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseAbi, Address, isAddress, decodeEventLog, encodeAbiParameters, parseAbiParameters } from 'viem';
import { CONTRACTS, CHAIN_ID, BLOCK_EXPLORER } from '@/config/contracts';
import { mineSalt, SaltMiningProgress } from '@/utils/saltMining';

const sanitizeUrl = (url: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  try { new URL(trimmed); return trimmed; } catch { return null; }
};

const factoryAbi = parseAbi([
  'function deployToken(((address tokenAdmin, string name, string symbol, bytes32 salt, string image, string metadata, string context, uint256 originatingChainId) tokenConfig, (address hook, address pairedToken, int24 tickIfToken0IsClanker, int24 tickSpacing, bytes poolData) poolConfig, (address locker, address[] rewardAdmins, address[] rewardRecipients, uint16[] rewardBps, int24[] tickLower, int24[] tickUpper, uint16[] positionBps, bytes lockerData) lockerConfig, (address mevModule, bytes mevModuleData) mevModuleConfig, (address extension, uint256 msgValue, uint16 extensionBps, bytes extensionData)[] extensionConfigs, address nftCollection) deploymentConfig) external payable returns (address)',
  'event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)',
]);

const erc721EnumerableAbi = parseAbi([
  'function totalSupply() external view returns (uint256)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
]);

type DeployStep = 'idle' | 'uploading' | 'validating' | 'mining' | 'deploying' | 'confirming' | 'saving' | 'done' | 'error';

export default function DeployPage() {
  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const isOnWrongChain = chainId !== CHAIN_ID;
  
  const [formData, setFormData] = useState({ name: '', symbol: '', nftCollection: '', description: '', websiteUrl: '', twitterUrl: '', telegramUrl: '', discordUrl: '' });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ipfsUrl, setIpfsUrl] = useState<string | null>(null);
  const [step, setStep] = useState<DeployStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [deployedToken, setDeployedToken] = useState<string | null>(null);
  const [deployedPoolId, setDeployedPoolId] = useState<string | null>(null);
  const [nftInfo, setNftInfo] = useState<{ name: string; symbol: string; supply: bigint } | null>(null);
  const [miningProgress, setMiningProgress] = useState<SaltMiningProgress | null>(null);
  const [minedSalt, setMinedSalt] = useState<`0x${string}` | null>(null);
  const [minedAddress, setMinedAddress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { writeContract, data: deployHash, isPending: isDeploying, error: deployError } = useWriteContract();
  const { isLoading: isWaitingDeploy, isSuccess: isDeploySuccess, data: deployReceipt } = useWaitForTransactionReceipt({ hash: deployHash });
  const { data: nftSupply } = useReadContract({ address: isAddress(formData.nftCollection) ? formData.nftCollection as Address : undefined, abi: erc721EnumerableAbi, functionName: 'totalSupply', query: { enabled: isAddress(formData.nftCollection) } });
  const { data: nftName } = useReadContract({ address: isAddress(formData.nftCollection) ? formData.nftCollection as Address : undefined, abi: erc721EnumerableAbi, functionName: 'name', query: { enabled: isAddress(formData.nftCollection) } });
  const { data: nftSymbol } = useReadContract({ address: isAddress(formData.nftCollection) ? formData.nftCollection as Address : undefined, abi: erc721EnumerableAbi, functionName: 'symbol', query: { enabled: isAddress(formData.nftCollection) } });

  useEffect(() => {
    if (isDeploySuccess && deployReceipt && step === 'confirming') {
      const factoryAddr = CONTRACTS.FACTORY?.toLowerCase();
      const tokenCreatedLog = deployReceipt.logs.find(log => { try { return log.address.toLowerCase() === factoryAddr && log.topics.length >= 3; } catch { return false; } });
      if (tokenCreatedLog && tokenCreatedLog.topics[1]) {
        const tokenAddr = `0x${tokenCreatedLog.topics[1].slice(26)}` as Address;
        setDeployedToken(tokenAddr);
        setStep('saving');
        let eventPoolId: string | null = null;
        try { const decoded = decodeEventLog({ abi: factoryAbi, data: tokenCreatedLog.data, topics: tokenCreatedLog.topics }); if (decoded.args && (decoded.args as any).poolId) { eventPoolId = (decoded.args as any).poolId; setDeployedPoolId(eventPoolId); } } catch {}
        const tokenData = { name: formData.name, symbol: formData.symbol, address: tokenAddr, image_url: ipfsUrl || '', pool_id: eventPoolId || '', nft_collection: formData.nftCollection, nft_collection_name: nftInfo?.name || '', website_url: sanitizeUrl(formData.websiteUrl), twitter_url: sanitizeUrl(formData.twitterUrl), telegram_url: sanitizeUrl(formData.telegramUrl), discord_url: sanitizeUrl(formData.discordUrl), chain: 'base' };
        fetch('/api/tokens/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tokenData) }).then(() => setStep('done')).catch(() => setStep('done'));
      }
    }
  }, [isDeploySuccess, deployReceipt, step]);

  useEffect(() => { if (nftSupply !== undefined && nftName && nftSymbol) setNftInfo({ name: nftName as string, symbol: nftSymbol as string, supply: nftSupply as bigint }); }, [nftSupply, nftName, nftSymbol]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); }
  };

  const uploadToIPFS = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/ipfs/upload', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('IPFS upload failed');
    const data = await response.json();
    return data.url;
  };

  const handleDeploy = async () => {
    if (!isConnected || !address || isOnWrongChain) return;
    if (!formData.name || !formData.symbol || !formData.nftCollection || !imageFile) { setError('Fill all required fields'); return; }
    if (!isAddress(formData.nftCollection)) { setError('Invalid NFT collection address'); return; }

    setError(null);
    setStep('uploading');

    try {
      const imageUrl = await uploadToIPFS(imageFile);
      setIpfsUrl(imageUrl);
      setStep('mining');

      const createXFactory = '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed' as `0x${string}`;
      const wethAddress = CONTRACTS.WETH;
      const result = await mineSalt(createXFactory, CONTRACTS.FACTORY, wethAddress, address as `0x${string}`, (progress) => setMiningProgress(progress));
      setMinedSalt(result.salt);
      setMinedAddress(result.address);
      setStep('deploying');

      const metadata = JSON.stringify({ name: formData.name, symbol: formData.symbol, description: formData.description || '', website: sanitizeUrl(formData.websiteUrl) || '', twitter: sanitizeUrl(formData.twitterUrl) || '', telegram: sanitizeUrl(formData.telegramUrl) || '', discord: sanitizeUrl(formData.discordUrl) || '' });
      const mevModuleData = encodeAbiParameters(parseAbiParameters('uint256 fee'), [4000000000000000n]);
      const rewardBps = Array(Number(nftInfo?.supply || 0)).fill(10000 / Number(nftInfo?.supply || 1));
      const adjustedRewardBps = rewardBps.map((_, i) => i === 0 ? rewardBps[i] + (10000 - rewardBps.reduce((a: number, b: number) => a + b, 0)) : rewardBps[i]);
      const tokenIds = Array.from({ length: Number(nftInfo?.supply || 0) }, (_, i) => BigInt(i));
      const tokenIdsBigInt = tokenIds.map(id => BigInt(id));

      const deploymentConfig = {
        tokenConfig: { tokenAdmin: address as `0x${string}`, name: formData.name, symbol: formData.symbol, salt: result.salt, image: imageUrl, metadata, context: 'cc0strategy', originatingChainId: BigInt(CHAIN_ID) },
        poolConfig: { hook: CONTRACTS.HOOK, pairedToken: wethAddress, tickIfToken0IsClanker: -230400, tickSpacing: 200, poolData: '0x' as `0x${string}` },
        lockerConfig: { locker: CONTRACTS.LP_LOCKER, rewardAdmins: [] as `0x${string}`[], rewardRecipients: [] as `0x${string}`[], rewardBps: [] as number[], tickLower: [-887200], tickUpper: [887200], positionBps: [10000], lockerData: '0x' as `0x${string}` },
        mevModuleConfig: { mevModule: CONTRACTS.MEV_MODULE, mevModuleData },
        extensionConfigs: [] as any[],
        nftCollection: formData.nftCollection as `0x${string}`,
      };

      writeContract({ address: CONTRACTS.FACTORY, abi: factoryAbi, functionName: 'deployToken', args: [deploymentConfig], value: 0n, chainId: CHAIN_ID });
      setStep('confirming');
    } catch (e: any) { setError(e.message || 'Deployment failed'); setStep('error'); }
  };

  useEffect(() => { if (deployError) { setError(deployError.message || 'Transaction failed'); setStep('error'); } }, [deployError]);

  const resetForm = () => { setFormData({ name: '', symbol: '', nftCollection: '', description: '', websiteUrl: '', twitterUrl: '', telegramUrl: '', discordUrl: '' }); setImageFile(null); setImagePreview(null); setIpfsUrl(null); setStep('idle'); setError(null); setDeployedToken(null); setDeployedPoolId(null); setNftInfo(null); setMiningProgress(null); setMinedSalt(null); setMinedAddress(null); };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container-editorial pt-16 pb-8">
        <div className="mb-6">
          <div className="text-xs text-neutral-500 mb-2 tracking-widest">BASE</div>
          <h1 className="headline-lg font-editorial mb-1">DEPLOY</h1>
          <p className="text-neutral-500 text-sm">Launch a cc0strategy token on Base</p>
        </div>

        {!isConnected ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-neutral-500 mb-6">Connect your wallet to deploy</p>
            <button onClick={() => connect({ connector: injected() })} className="btn-primary">Connect Wallet</button>
          </div>
        ) : step === 'done' ? (
          <div className="card-brutal p-8 text-center space-y-4">
            <div className="text-4xl">🎉</div>
            <h2 className="font-editorial text-2xl">TOKEN DEPLOYED</h2>
            <p className="text-neutral-500">{deployedToken}</p>
            <div className="flex gap-3 justify-center">
              <a href={`${BLOCK_EXPLORER}/token/${deployedToken}`} target="_blank" rel="noopener noreferrer" className="btn-primary">View on BaseScan</a>
              <a href={`/swap?token=${deployedToken}`} className="btn-primary">Trade</a>
            </div>
            <button onClick={resetForm} className="text-neutral-500 hover:text-white text-sm">Deploy Another</button>
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

            <div className="card-brutal p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">TOKEN NAME *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="My Token" className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none" disabled={step !== 'idle'} />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">SYMBOL *</label>
                  <input type="text" value={formData.symbol} onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })} placeholder="TKN" className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none" disabled={step !== 'idle'} />
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">NFT COLLECTION ADDRESS *</label>
                <input type="text" value={formData.nftCollection} onChange={(e) => setFormData({ ...formData, nftCollection: e.target.value })} placeholder="0x..." className="w-full border-2 border-white bg-black px-4 py-3 font-mono focus:outline-none" disabled={step !== 'idle'} />
                {nftInfo && <div className="mt-2 text-sm text-neutral-500">{nftInfo.name} ({nftInfo.symbol}) · {nftInfo.supply.toString()} NFTs</div>}
              </div>

              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">TOKEN IMAGE *</label>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                <div onClick={() => step === 'idle' && fileInputRef.current?.click()} className={`border-2 border-dashed border-neutral-700 p-8 text-center cursor-pointer hover:border-white transition-colors ${step !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {imagePreview ? <img src={imagePreview} alt="Preview" className="max-h-32 mx-auto" /> : <span className="text-neutral-500">Click to upload image</span>}
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">DESCRIPTION</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="About your token..." rows={3} className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none resize-none" disabled={step !== 'idle'} />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div><label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">WEBSITE</label><input type="url" value={formData.websiteUrl} onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })} placeholder="https://" className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none" disabled={step !== 'idle'} /></div>
                <div><label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">TWITTER</label><input type="url" value={formData.twitterUrl} onChange={(e) => setFormData({ ...formData, twitterUrl: e.target.value })} placeholder="https://x.com/..." className="w-full border-2 border-white bg-black px-4 py-3 focus:outline-none" disabled={step !== 'idle'} /></div>
              </div>

              {step !== 'idle' && step !== 'error' && (
                <div className="border border-neutral-700 p-4">
                  <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">STATUS</div>
                  <div className="font-mono">
                    {step === 'uploading' && '📤 Uploading image to IPFS...'}
                    {step === 'mining' && `⛏️ Mining salt... ${miningProgress?.attempts || 0} attempts`}
                    {step === 'deploying' && '🚀 Confirm in wallet...'}
                    {step === 'confirming' && '⏳ Waiting for confirmation...'}
                    {step === 'saving' && '💾 Saving to indexer...'}
                  </div>
                </div>
              )}

              {error && <div className="border-2 border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

              <button onClick={handleDeploy} disabled={step !== 'idle' || isOnWrongChain || !formData.name || !formData.symbol || !formData.nftCollection || !imageFile} className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
                {step === 'idle' ? 'Deploy Token' : 'Deploying...'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
