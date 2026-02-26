'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from '@/config/wagmi'
import { useState, useEffect, ReactNode } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'

const queryClient = new QueryClient()

export function Providers({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        await sdk.actions.ready()
      } catch (e) {
        console.log('SDK ready failed (not in Farcaster?)', e)
      }
      setIsReady(true)
    }
    init()
  }, [])

  if (!isReady) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">cc0strategy</div>
          <div className="text-gray-400">loading...</div>
        </div>
      </div>
    )
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
