import { createConfig, http } from 'wagmi'
import { base, mainnet } from 'wagmi/chains'
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector'

export const config = createConfig({
  chains: [base, mainnet],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
  },
  connectors: [farcasterFrame()],
})

export { base, mainnet }
