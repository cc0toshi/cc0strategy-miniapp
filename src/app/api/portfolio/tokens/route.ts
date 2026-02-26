import { NextRequest, NextResponse } from 'next/server';

interface TokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

interface AlchemyTokenBalancesResponse {
  jsonrpc: string;
  id: number;
  result: {
    address: string;
    tokenBalances: TokenBalance[];
  };
}

// Alchemy RPC endpoint - Base only
const ALCHEMY_ENDPOINT = 'https://base-mainnet.g.alchemy.com/v2/';

/**
 * Fetch token balances for a wallet on Base using Alchemy
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const tokensParam = searchParams.get('tokens');
  
  if (!address) {
    return NextResponse.json({ error: 'address parameter required' }, { status: 400 });
  }
  
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Alchemy API not configured' }, { status: 503 });
  }
  
  try {
    const tokenAddresses = tokensParam ? tokensParam.split(',').map(t => t.trim().toLowerCase()) : null;
    
    const requestBody: Record<string, unknown> = {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenBalances',
      params: tokenAddresses 
        ? [address, tokenAddresses]
        : [address, 'erc20'],
    };
    
    const response = await fetch(`${ALCHEMY_ENDPOINT}${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch token balances' }, { status: 502 });
    }
    
    const data: AlchemyTokenBalancesResponse = await response.json();
    
    if (data.result && data.result.tokenBalances) {
      const balances = data.result.tokenBalances
        .filter(tb => tb.tokenBalance && tb.tokenBalance !== '0x0' && tb.tokenBalance !== '0x')
        .map(tb => ({
          address: tb.contractAddress.toLowerCase(),
          balance: tb.tokenBalance,
          balanceDecimal: BigInt(tb.tokenBalance).toString(),
        }));
      
      return NextResponse.json({ address: data.result.address, chain: 'base', balances });
    }
    
    return NextResponse.json({ address, chain: 'base', balances: [] });
    
  } catch (error) {
    console.error('Portfolio tokens API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST: Fetch balances for specified tokens on Base
 */
export async function POST(request: NextRequest) {
  try {
    const { address, tokens } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: 'address required' }, { status: 400 });
    }
    
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Alchemy API not configured' }, { status: 503 });
    }
    
    const baseTokens = tokens && Array.isArray(tokens)
      ? tokens.filter((t: { chain?: string; address: string }) => !t.chain || t.chain === 'base').map((t: { address: string }) => t.address.toLowerCase())
      : null;
    
    const requestBody: Record<string, unknown> = {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenBalances',
      params: baseTokens && baseTokens.length > 0 ? [address, baseTokens] : [address, 'erc20'],
    };
    
    const response = await fetch(`${ALCHEMY_ENDPOINT}${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    
    const allBalances: Record<string, { balance: string; balanceDecimal: string; chain: string }> = {};
    
    if (response.ok) {
      const data: AlchemyTokenBalancesResponse = await response.json();
      
      if (data.result && data.result.tokenBalances) {
        for (const tb of data.result.tokenBalances) {
          if (tb.tokenBalance && tb.tokenBalance !== '0x0' && tb.tokenBalance !== '0x') {
            allBalances[tb.contractAddress.toLowerCase()] = {
              balance: tb.tokenBalance,
              balanceDecimal: BigInt(tb.tokenBalance).toString(),
              chain: 'base',
            };
          }
        }
      }
    }
    
    return NextResponse.json({ address, balances: allBalances });
    
  } catch (error) {
    console.error('Portfolio tokens POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
