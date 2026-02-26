// @ts-nocheck
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain, useChainId } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseAbi, Address, isAddress, decodeEventLog, encodeAbiParameters, parseAbiParameters } from 'viem';

import { CONTRACTS, getContracts, getChainFromId, CHAIN_IDS, hasDeployedContracts, type SupportedChain } from '@/config/contracts';
import { base, mainnet } from '@/config/wagmi';
import { mineSalt, SaltMiningProgress } from '@/utils/saltMining';

// Sanitize URL helper
const sanitizeUrl = (url: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  try { new URL(trimmed); return trimmed; } catch { return null; }
};

// ABIs
const factoryAbi = parseAbi([
  'function deployToken(((address tokenAdmin, string name, string symbol, bytes32 salt, string image, string metadata, string context, uint256 originatingChainId) tokenConfig, (address hook, address pairedToken, int24 tickIfToken0IsClanker, int24 tickSpacing, bytes poolData) poolConfig, (address locker, address[] rewardAdmins, address[] rewardRecipients, uint16[] rewardBps, int24[] tickLower, int24[] tickUpper, uint16[] positionBps, bytes lockerData) lockerConfig, (address mevModule, bytes mevModuleData) mevModuleConfig, (address extension, uint256 msgValue, uint16 extensionBps, bytes extensionData)[] extensionConfigs, address nftCollection) deploymentConfig) external payable returns (address)',
  'event TokenCreated(address msgSender, address indexed tokenAddress, address indexed tokenAdmin, string tokenImage, string tokenName, string tokenSymbol, string tokenMetadata, string tokenContext, int24 startingTick, address poolHook, bytes32 poolId, address pairedToken, address locker, address mevModule, uint256 extensionsSupply, address[] extensions)',
]);

const erc721EnumerableAbi = parseAbi([
  'function totalSupply() external view returns (uint256)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
]);

const ownableAbi = parseAbi([
  'function renounceOwnership() external',
  'function owner() external view returns (address)',
]);

const feeDistributorAbi = parseAbi([
  'function register(address token, address nftCollection) external',
]);

type DeployStep = 'idle' | 'uploading' | 'validating' | 'mining' | 'deploying' | 'confirming' | 'saving' | 'done' | 'error';

export default function DeployPage() {
  const chainId = useChainId();
  const { isConnected, address } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  
  const currentChain = getChainFromId(chainId);
  
  const [selectedNetwork, setSelectedNetwork] = useState<SupportedChain>('base');
  const chainContracts = getContracts(selectedNetwork);
  
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    nftCollection: '',
    description: '',
    websiteUrl: '',
    twitterUrl: '',
    telegramUrl: '',
    discordUrl: '',
  });
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ipfsUrl, setIpfsUrl] = useState<string | null>(null);
  
  const [step, setStep] = useState<DeployStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [deployedToken, setDeployedToken] = useState<string | null>(null);
  const [deployedPoolId, setDeployedPoolId] = useState<string | null>(null);
  const [nftInfo, setNftInfo] = useState<{ name: string; symbol: string; supply: bigint } | null>(null);
  
  // Salt mining state
  const [miningProgress, setMiningProgress] = useState<SaltMiningProgress | null>(null);
  const [minedSalt, setMinedSalt] = useState<`0x${string}` | null>(null);
  const [minedAddress, setMinedAddress] = useState<string | null>(null);
  
  // Network mismatch state
  const [networkMismatch, setNetworkMismatch] = useState<{ expected: SupportedChain; expectedChainId: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { writeContract, data: deployHash, isPending: isDeploying, error: deployError } = useWriteContract();
  
  const { isLoading: isWaitingDeploy, isSuccess: isDeploySuccess, data: deployReceipt } = useWaitForTransactionReceipt({
    hash: deployHash,
  });

  const { data: nftSupply, isError: isSupplyError, refetch: refetchSupply } = useReadContract({
    address: isAddress(formData.nftCollection) ? formData.nftCollection as Address : undefined,
    abi: erc721EnumerableAbi,
    functionName: 'totalSupply',
    query: {
      enabled: isAddress(formData.nftCollection),
    }
  });

  const { data: nftName } = useReadContract({
    address: isAddress(formData.nftCollection) ? formData.nftCollection as Address : undefined,
    abi: erc721EnumerableAbi,
    functionName: 'name',
    query: {
      enabled: isAddress(formData.nftCollection),
    }
  });

  const { data: nftSymbol } = useReadContract({
    address: isAddress(formData.nftCollection) ? formData.nftCollection as Address : undefined,
    abi: erc721EnumerableAbi,
    functionName: 'symbol',
    query: {
      enabled: isAddress(formData.nftCollection),
    }
  });

  const handleNetworkSelect = (network: SupportedChain) => {
    setSelectedNetwork(network);
    setNetworkMismatch(null);
    const targetChainId = network === 'base' ? base.id : mainnet.id;
    if (chainId !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  };

  useEffect(() => {
    if (isDeploySuccess && deployReceipt && step === 'confirming') {
      const factoryAddr = chainContracts.FACTORY?.toLowerCase();
      const tokenCreatedLog = deployReceipt.logs.find(log => {
        try {
          return log.address.toLowerCase() === factoryAddr && log.topics.length >= 3;
        } catch {
          return false;
        }
      });

      if (tokenCreatedLog && tokenCreatedLog.topics[1]) {
        const tokenAddr = `0x${tokenCreatedLog.topics[1].slice(26)}` as Address;
        setDeployedToken(tokenAddr);
        
        setStep('saving');
        
        let eventPoolId: string | null = null;
        try {
          const decoded = decodeEventLog({
            abi: factoryAbi,
            data: tokenCreatedLog.data,
            topics: tokenCreatedLog.topics,
          });
          if (decoded.args && 'poolId' in decoded.args) {
            eventPoolId = decoded.args.poolId as string;
            setDeployedPoolId(eventPoolId as `0x${string}`);
          }
        } catch (e) {
          console.error('Failed to decode poolId:', e);
        }
        
        fetch('/api/tokens/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: tokenAddr,
            name: formData.name,
            symbol: formData.symbol,
            nftCollection: formData.nftCollection,
            deployer: address,
            deployTxHash: deployHash,
            imageUrl: ipfsUrl,
            description: formData.description,
            chain: selectedNetwork,
            poolId: eventPoolId,
            websiteUrl: sanitizeUrl(formData.websiteUrl),
            twitterUrl: sanitizeUrl(formData.twitterUrl),
            telegramUrl: sanitizeUrl(formData.telegramUrl),
            discordUrl: sanitizeUrl(formData.discordUrl),
          }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              console.error('Failed to save token:', data.error);
            }
            setStep('done');
          })
          .catch(err => {
            console.error('Failed to save token:', err);
            setStep('done');
          });
      } else {
        setError('Could not find deployed token address');
        setStep('error');
      }
    }
  }, [isDeploySuccess, deployReceipt, step, formData, chainContracts, address, deployHash, ipfsUrl, selectedNetwork]);

  useEffect(() => {
    if (deployError) {
      setError(deployError.message);
      setStep('error');
    }
  }, [deployError]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setIpfsUrl(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadToIPFS = async (): Promise<string> => {
    if (!imageFile) throw new Error('No image selected');
    
    const uploadData = new FormData();
    uploadData.append('file', imageFile);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: uploadData,
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to upload image');
    }
    
    const result = await response.json();
    return result.ipfsUrl;
  };

  const validateNFTCollection = async (): Promise<boolean> => {
    if (!isAddress(formData.nftCollection)) {
      throw new Error('Invalid NFT collection address');
    }
    
    await refetchSupply();
    
    if (isSupplyError || nftSupply === undefined) {
      throw new Error('NFT collection must implement ERC721Enumerable (totalSupply)');
    }
    
    if (nftSupply === 0n) {
      throw new Error('NFT collection has no tokens minted');
    }
    
    return true;
  };

  const handleDeploy = async () => {
    const expectedChainId = selectedNetwork === 'base' ? 8453 : 1;
    if (chainId !== expectedChainId) {
      setNetworkMismatch({ expected: selectedNetwork, expectedChainId });
      return;
    }
    setNetworkMismatch(null);
    setError(null);
    setMiningProgress(null);
    setMinedSalt(null);
    setMinedAddress(null);
    
    if (!formData.name || !formData.symbol || !formData.nftCollection) {
      setError('Please fill all required fields');
      return;
    }
    
    if (!imageFile) {
      setError('Please upload a token image');
      return;
    }
    
    if (!address) {
      setError('Wallet not connected');
      return;
    }
    
    if (!chainContracts.FACTORY) {
      setError('Factory contract not deployed on this network yet');
      return;
    }
    
    try {
      setStep('uploading');
      const imageUrl = await uploadToIPFS();
      setIpfsUrl(imageUrl);
      
      setStep('validating');
      await validateNFTCollection();
      
      if (nftName && nftSymbol && nftSupply) {
        setNftInfo({ name: nftName, symbol: nftSymbol, supply: nftSupply });
      }
      
      let salt: `0x${string}`;
      
      if (selectedNetwork === 'base') {
        setStep('mining');
        console.log('Mining salt for Base deployment (token must be < WETH)...');
        
        const result = await mineSalt(
          chainContracts.FACTORY,
          '0x0000000000000000000000000000000000000000' as Address,
          chainContracts.WETH,
          formData.name,
          formData.symbol,
          imageUrl,
          formData.description || '',
          'cc0strategy',
          BigInt(CHAIN_IDS[selectedNetwork]),
          (progress) => {
            setMiningProgress(progress);
            console.log(`Mining: checked ${progress.checked} salts, ${progress.elapsed}ms elapsed`);
          }
        );
        
        salt = result.salt;
        setMinedSalt(result.salt);
        setMinedAddress(result.address);
        console.log(`Found valid salt after ${result.attempts} attempts (${result.elapsed}ms)`);
        console.log(`Salt: ${result.salt}`);
        console.log(`Predicted address: ${result.address}`);
      } else {
        salt = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
      }
      
      setStep('deploying');
      
      const tokenConfig = {
        tokenAdmin: '0x0000000000000000000000000000000000000000' as Address,
        name: formData.name,
        symbol: formData.symbol,
        salt: salt,
        image: imageUrl,
        metadata: formData.description || '',
        context: 'cc0strategy',
        originatingChainId: BigInt(CHAIN_IDS[selectedNetwork]),
      };
      
      const poolData = encodeAbiParameters(
        // ClankerHookStaticFee expects PoolStaticConfigVars: { uint24 clankerFee, uint24 pairedFee }
        // 69000 = 6.9% fee in V4 (where 1000000 = 100%)
        parseAbiParameters('uint24 clankerFee, uint24 pairedFee'),
        [69000, 69000]  // 6.9% fee for both directions
      );
      
      const TICK_LOWER = -230400;
      const TICK_UPPER = 887200;
      const STARTING_TICK = -230400;
      
      const poolConfig = {
        hook: chainContracts.HOOK as Address,
        pairedToken: chainContracts.WETH as Address,
        tickIfToken0IsClanker: STARTING_TICK as number,
        tickSpacing: 200 as number,
        poolData: poolData,
      };
      
      const lockerConfig = {
        locker: (chainContracts.LP_LOCKER || '0x0000000000000000000000000000000000000000') as Address,
        rewardAdmins: [] as Address[],
        rewardRecipients: [] as Address[],
        rewardBps: [] as number[],
        tickLower: [TICK_LOWER] as number[],
        tickUpper: [TICK_UPPER] as number[],
        positionBps: [10000] as number[],
        lockerData: '0x' as `0x${string}`,
      };
      
      const mevModuleConfig = {
        mevModule: chainContracts.MEV_MODULE as Address,
        mevModuleData: '0x' as `0x${string}`,
      };
      
      const deploymentConfig = {
        tokenConfig,
        poolConfig,
        lockerConfig,
        mevModuleConfig,
        extensionConfigs: [],
        nftCollection: formData.nftCollection as Address,
      };
      
      writeContract({
        address: chainContracts.FACTORY,
        abi: factoryAbi,
        functionName: 'deployToken',
        args: [deploymentConfig],
      });
      
      setStep('confirming');
      
    } catch (err) {
      setStep('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const getStepStatus = (targetStep: DeployStep) => {
    const stepOrder: DeployStep[] = ['idle', 'uploading', 'validating', 'mining', 'deploying', 'confirming', 'saving', 'done'];
    const currentIndex = stepOrder.indexOf(step);
    const targetIndex = stepOrder.indexOf(targetStep);
    
    if (step === 'error') return 'error';
    if (currentIndex > targetIndex) return 'complete';
    if (currentIndex === targetIndex) return 'active';
    return 'pending';
  };

  const StepIndicator = ({ stepName, label, number }: { stepName: DeployStep; label: string; number: string }) => {
    const status = getStepStatus(stepName);
    return (
      <div className={`flex items-center gap-4 p-4 border-b-2 last:border-b-0 ${
        status === 'complete' ? 'border-white bg-white text-black' :
        status === 'active' ? 'border-white' :
        status === 'error' ? 'border-neutral-700 text-neutral-600' :
        'border-neutral-800 text-neutral-600'
      }`}>
        <div className={`w-8 h-8 flex items-center justify-center border-2 font-editorial text-sm ${
          status === 'complete' ? 'border-black bg-black text-white' :
          status === 'active' ? 'border-white animate-pulse' :
          'border-neutral-700'
        }`}>
          {status === 'complete' ? '✓' : number}
        </div>
        <span className="font-mono text-sm uppercase tracking-wider">{label}</span>
      </div>
    );
  };

  const resetForm = () => {
    setStep('idle');
    setSelectedNetwork('base');
    setFormData({ 
      name: '', 
      symbol: '', 
      nftCollection: '', 
      description: '',
      websiteUrl: '',
      twitterUrl: '',
      telegramUrl: '',
      discordUrl: '',
    });
    setImageFile(null);
    setImagePreview(null);
    setIpfsUrl(null);
    setDeployedToken(null);
    setDeployedPoolId(null);
    setNftInfo(null);
    setError(null);
    setMiningProgress(null);
    setMinedSalt(null);
    setMinedAddress(null);
    setNetworkMismatch(null);
  };

  const canDeploy = hasDeployedContracts(selectedNetwork);

  const handleSwitchToCorrectNetwork = () => {
    if (networkMismatch) {
      switchChain({ chainId: networkMismatch.expectedChainId });
      setNetworkMismatch(null);
    }
  };

  const NetworkMismatchWarning = () => {
    if (!networkMismatch) return null;
    
    const networkName = networkMismatch.expected === 'base' ? 'Base' : 'Ethereum';
    return (
      <div className="border-2 border-red-500/50 bg-red-500/10 p-4">
        <div className="flex flex-col gap-3">
          <div className="text-sm text-red-400">
            ⚠️ Please switch to {networkName} network to deploy
          </div>
          <button
            onClick={handleSwitchToCorrectNetwork}
            className="btn-secondary text-sm py-2"
          >
            Switch to {networkName}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="container-editorial py-8 md:py-24">
      <div className="mb-12">
        <div className="caption text-neutral-500 mb-4">TOKEN FACTORY</div>
        <h1 className="font-editorial text-2xl md:headline-lg">DEPLOY TOKEN</h1>
        <p className="text-neutral-400 mt-4 max-w-xl">
          Launch a new ERC-20 token linked to your NFT collection. 
          Trading fees will flow directly to NFT holders.
        </p>
      </div>
      
      <div className="max-w-xl">
        <div className="border-2 border-white">
          {!isConnected ? (
            <div className="p-12 text-center">
              <div className="font-editorial text-xl mb-6">WALLET REQUIRED</div>
              <p className="text-neutral-500 mb-8">Connect your wallet to deploy a token</p>
              <button 
                onClick={() => connect({ connector: injected() })} 
                className="btn-primary w-full"
              >
                Connect Wallet
              </button>
            </div>
          ) : step !== 'idle' ? (
            <div>
              <div className="border-b-2 border-white p-6">
                <h2 className="font-editorial text-xl">DEPLOYMENT PROGRESS</h2>
              </div>
              
              <div>
                <StepIndicator stepName="uploading" label="Upload to IPFS" number="1" />
                <StepIndicator stepName="validating" label="Validate NFT Collection" number="2" />
                <StepIndicator stepName="mining" label="Mine Salt (Base only)" number="3" />
                <StepIndicator stepName="deploying" label="Deploy Contract" number="4" />
                <StepIndicator stepName="confirming" label="Confirm Transaction" number="5" />
                <StepIndicator stepName="saving" label="Save to Database" number="6" />
                <StepIndicator stepName="done" label="Complete" number="✓" />
              </div>
              
              <div className="p-6 space-y-4">
                {ipfsUrl && (
                  <div className="border border-neutral-800 p-4">
                    <div className="caption text-neutral-500 mb-2">IPFS IMAGE</div>
                    <p className="text-xs font-mono break-all text-neutral-400">{ipfsUrl}</p>
                  </div>
                )}
                
                {nftInfo && (
                  <div className="border border-neutral-800 p-4">
                    <div className="caption text-neutral-500 mb-2">NFT COLLECTION</div>
                    <p className="text-sm">
                      {nftInfo.name} ({nftInfo.symbol}) — {nftInfo.supply.toString()} tokens
                    </p>
                  </div>
                )}
                
                {step === 'mining' && miningProgress && (
                  <div className="border border-blue-500/50 bg-blue-500/10 p-4">
                    <div className="caption text-blue-400 mb-2">⛏️ MINING SALT</div>
                    <p className="text-sm text-blue-300">
                      Finding address {'<'} WETH for correct pool ordering...
                    </p>
                    <p className="text-xs font-mono text-blue-400 mt-2">
                      Checked: {miningProgress.checked.toLocaleString()} salts ({(miningProgress.elapsed / 1000).toFixed(1)}s)
                    </p>
                  </div>
                )}
                
                {minedSalt && minedAddress && (
                  <div className="border border-green-500/50 bg-green-500/10 p-4">
                    <div className="caption text-green-400 mb-2">✓ SALT FOUND</div>
                    <p className="text-xs font-mono break-all text-green-300">
                      Predicted: {minedAddress}
                    </p>
                  </div>
                )}
                
                {deployedToken && (
                  <div className="border border-neutral-800 p-4">
                    <div className="caption text-neutral-500 mb-2">TOKEN ADDRESS</div>
                    <p className="text-xs font-mono break-all">{deployedToken}</p>
                  </div>
                )}
                
                {error && step === 'error' && (
                  <div className="border-2 border-neutral-600 p-4 text-neutral-400 text-sm">
                    ERROR: {error}
                  </div>
                )}
                
                {(step === 'done' || step === 'error') && (
                  <div className="pt-4">
                    {step === 'done' && (
                      <div className="text-center mb-6">
                        <div className="font-editorial text-2xl mb-2">✓ SUCCESS</div>
                        <p className="text-neutral-400 text-sm">
                          Token deployed. Ownership renounced. Fully decentralized.
                        </p>
                      </div>
                    )}
                    <button
                      onClick={resetForm}
                      className="btn-secondary w-full"
                    >
                      {step === 'error' ? 'TRY AGAIN' : 'DEPLOY ANOTHER'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="border-b-2 border-white p-4 flex items-center justify-between">
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

              <div className="border-b-2 border-white p-4">
                <label className="caption text-neutral-500 block mb-3">NETWORK</label>
                <div className="flex gap-0">
                  <button
                    onClick={() => hasDeployedContracts('base') && handleNetworkSelect('base')}
                    disabled={!hasDeployedContracts('base')}
                    className={`flex-1 py-3 px-4 border-2 border-r-0 font-mono text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 relative ${
                      !hasDeployedContracts('base')
                        ? 'bg-transparent text-neutral-600 border-neutral-700 cursor-not-allowed opacity-50'
                        : selectedNetwork === 'base'
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-neutral-400 border-neutral-600 hover:border-neutral-400'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 111 111" fill="currentColor">
                      <path d="M54.921 110.034c30.354 0 54.967-24.593 54.967-54.921S85.275.191 54.921.191C26.043.191 2.003 22.567.142 51.031h71.858v7.983H.141c1.858 28.464 25.9 51.02 54.78 51.02Z"/>
                    </svg>
                    BASE
                  </button>
                  <button
                    onClick={() => handleNetworkSelect('ethereum')}
                    className={`flex-1 py-3 px-4 border-2 font-mono text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 relative ${
                      selectedNetwork === 'ethereum'
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-neutral-400 border-neutral-600 hover:border-neutral-400'
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 784 784" fill="currentColor">
                      <path d="M392.07 0L383.5 29.11v517.91l8.57 8.56 392.07-231.75z"/>
                      <path d="M392.07 0L0 323.83l392.07 231.75V0z"/>
                      <path d="M392.07 603.78L387.24 609.68v300.34l4.83 14.08 392.4-552.27z"/>
                      <path d="M392.07 924.1V603.78L0 371.83z"/>
                    </svg>
                    ETH
                    {!hasDeployedContracts('ethereum') && (
                      <span className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[10px] px-2 py-0.5 font-mono rounded">
                        SOON
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {!canDeploy && (
                  <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-4 text-sm text-yellow-400">
                    ⚠️ {selectedNetwork.toUpperCase()} contracts not deployed yet. Deployment coming soon!
                  </div>
                )}

                <NetworkMismatchWarning />

                {error && (
                  <div className="border-2 border-neutral-600 p-4 text-neutral-400 text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="caption text-neutral-500 block mb-3">TOKEN IMAGE *</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-neutral-600 p-8 text-center cursor-pointer hover:border-white transition-colors"
                  >
                    {imagePreview ? (
                      <div className="flex flex-col items-center">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="w-24 h-24 object-cover mb-4 grayscale"
                        />
                        <p className="text-xs text-neutral-400 font-mono">{imageFile?.name}</p>
                      </div>
                    ) : (
                      <div>
                        <div className="font-editorial text-lg mb-2">CLICK TO UPLOAD</div>
                        <p className="text-xs text-neutral-600">PNG, JPG, GIF, WebP</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                <div>
                  <label className="caption text-neutral-500 block mb-3">TOKEN NAME *</label>
                  <input
                    value={formData.name}
                    onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                    placeholder="My Token"
                    className="input-brutal"
                  />
                </div>

                <div>
                  <label className="caption text-neutral-500 block mb-3">SYMBOL *</label>
                  <input
                    value={formData.symbol}
                    onChange={(e) => setFormData(p => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                    placeholder="TKN"
                    className="input-brutal font-mono"
                  />
                </div>

                <div>
                  <label className="caption text-neutral-500 block mb-3">NFT COLLECTION *</label>
                  <input
                    value={formData.nftCollection}
                    onChange={(e) => setFormData(p => ({ ...p, nftCollection: e.target.value }))}
                    placeholder="0x..."
                    className="input-brutal font-mono text-sm"
                  />
                  {isAddress(formData.nftCollection) && nftSupply !== undefined && (
                    <p className="mt-2 text-xs text-neutral-500">
                      ✓ {nftName || 'Collection'} — {nftSupply.toString()} NFTs
                    </p>
                  )}
                  {isAddress(formData.nftCollection) && isSupplyError && (
                    <p className="mt-2 text-xs text-neutral-600">
                      ✗ Must implement ERC721Enumerable (totalSupply)
                    </p>
                  )}
                </div>

                <div>
                  <label className="caption text-neutral-500 block mb-3">DESCRIPTION</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                    placeholder="Optional description..."
                    rows={3}
                    className="input-brutal resize-none"
                  />
                </div>

                {/* Social Links Section */}
                <div className="border border-neutral-800 p-4 space-y-4">
                  <div className="caption text-neutral-500 mb-2">SOCIAL LINKS (OPTIONAL)</div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-neutral-600 block mb-2">Website</label>
                      <input
                        value={formData.websiteUrl}
                        onChange={(e) => setFormData(p => ({ ...p, websiteUrl: e.target.value }))}
                        placeholder="https://..."
                        className="input-brutal text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-600 block mb-2">X (Twitter)</label>
                      <input
                        value={formData.twitterUrl}
                        onChange={(e) => setFormData(p => ({ ...p, twitterUrl: e.target.value }))}
                        placeholder="https://x.com/..."
                        className="input-brutal text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-600 block mb-2">Telegram</label>
                      <input
                        value={formData.telegramUrl}
                        onChange={(e) => setFormData(p => ({ ...p, telegramUrl: e.target.value }))}
                        placeholder="https://t.me/..."
                        className="input-brutal text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-600 block mb-2">Discord</label>
                      <input
                        value={formData.discordUrl}
                        onChange={(e) => setFormData(p => ({ ...p, discordUrl: e.target.value }))}
                        placeholder="https://discord.gg/..."
                        className="input-brutal text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="border border-neutral-800 p-4">
                  <div className="caption text-neutral-500 mb-2">FEE DISTRIBUTION</div>
                  <p className="text-sm text-neutral-400">
                    80% → NFT Holders • 10% → Treasury • 10% → Buyback
                  </p>
                </div>

                <button 
                  onClick={handleDeploy} 
                  disabled={isDeploying || isWaitingDeploy || !canDeploy}
                  className="btn-primary w-full"
                >
                  {!canDeploy ? 'COMING SOON' :
                   isDeploying || isWaitingDeploy ? 'DEPLOYING...' : 'DEPLOY TOKEN'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
