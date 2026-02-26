export const CONTRACTS = {
  base: {
    FACTORY: '0x70b17db500Ce1746BB34f908140d0279C183f3eb' as `0x${string}`,
    FEE_DISTRIBUTOR: '0x9Ce2AB2769CcB547aAcE963ea4493001275CD557' as `0x${string}`,
    HOOK: '0x18aD8c9b72D33E69d8f02fDA61e3c7fAe4e728cc' as `0x${string}`,
    LP_LOCKER: '0x45e1D9bb68E514565710DEaf2567B73EF86638e0' as `0x${string}`,
    MEV_MODULE: '0xDe6DBe5957B617fda4b2dcA4dd45a32B87a54BfE' as `0x${string}`,
    POOL_MANAGER: '0x498581ff718922c3f8e6a244956af099b2652b2b' as `0x${string}`,
    UNIVERSAL_ROUTER: '0x6ff5693b99212da76ad316178a184ab56d299b43' as `0x${string}`,
    PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`,
    WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  },
  ethereum: {
    FACTORY: '0xBbeBcC4aa7DDb4BeA65C86A2eB4147A6f39F10d3' as `0x${string}`,
    FEE_DISTRIBUTOR: '0xF8bFB6aED4A5Bd1c7E4ADa231c0EdDeB49618989' as `0x${string}`,
    HOOK: '0x9bEbE14d85375634c723EB5DC7B7E07C835dE8CC' as `0x${string}`,
    LP_LOCKER: '0xb43aaEe744c46822C7f9209ECD5468C97B937030' as `0x${string}`,
    MEV_MODULE: '0x1cfEd8302B995De1254e4Ff08623C516f8B36Bf6' as `0x${string}`,
    POOL_MANAGER: '0x000000000004444c5dc75cB358380D2e3dE08A90' as `0x${string}`,
    UNIVERSAL_ROUTER: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af' as `0x${string}`,
    PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`,
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as `0x${string}`,
  },
} as const

export type SupportedChain = 'base' | 'ethereum'

export const CHAIN_IDS = {
  base: 8453,
  ethereum: 1,
} as const

export const BLOCK_EXPLORERS = {
  base: 'https://basescan.org',
  ethereum: 'https://etherscan.io',
} as const

export const OPENSEA_CHAIN_SLUGS = {
  base: 'base',
  ethereum: 'ethereum',
} as const

export function getContracts(chain: SupportedChain) {
  return CONTRACTS[chain]
}

export function getChainFromId(chainId: number): SupportedChain | null {
  if (chainId === 8453) return 'base'
  if (chainId === 1) return 'ethereum'
  return null
}

export function hasDeployedContracts(chain: SupportedChain): boolean {
  return true
}

export const INDEXER_API = 'https://indexer-production-812c.up.railway.app'
