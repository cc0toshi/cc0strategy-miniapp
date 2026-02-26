import { keccak256, encodeAbiParameters, parseAbiParameters, concat, Address, Hex, toHex, pad } from 'viem';
import { CLANKER_TOKEN_BYTECODE } from '@/config/clankerTokenBytecode';

// Token supply constant (same as in contracts)
const TOKEN_SUPPLY = BigInt('100000000000000000000000000000'); // 100b with 18 decimals

/**
 * Compute CREATE2 address for a token deployment
 */
export function computeTokenAddress(
  factory: Address,
  tokenAdmin: Address,
  userSalt: Hex,
  name: string,
  symbol: string,
  image: string,
  metadata: string,
  context: string,
  chainId: bigint
): Address {
  // Factory computes: salt = keccak256(abi.encode(tokenAdmin, userSalt))
  const actualSalt = keccak256(
    encodeAbiParameters(
      parseAbiParameters('address, bytes32'),
      [tokenAdmin, userSalt]
    )
  );

  // Encode constructor arguments
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters('string, string, uint256, address, string, string, string, uint256'),
    [name, symbol, TOKEN_SUPPLY, tokenAdmin, image, metadata, context, chainId]
  );

  // initCode = bytecode + constructorArgs
  const initCode = concat([CLANKER_TOKEN_BYTECODE as Hex, constructorArgs]);
  const initCodeHash = keccak256(initCode);

  // CREATE2: address = keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:]
  const data = concat([
    '0xff',
    factory,
    actualSalt,
    initCodeHash
  ]);
  const hash = keccak256(data);
  
  return `0x${hash.slice(26)}` as Address;
}

export interface SaltMiningProgress {
  checked: number;
  currentSalt: Hex;
  elapsed: number;
}

export interface SaltMiningResult {
  salt: Hex;
  address: Address;
  attempts: number;
  elapsed: number;
}

/**
 * Mine a salt that produces a token address less than WETH
 * This ensures the token is currency0 in the pool for correct tick behavior
 */
export async function mineSalt(
  factory: Address,
  tokenAdmin: Address,
  weth: Address,
  name: string,
  symbol: string,
  image: string,
  metadata: string,
  context: string,
  chainId: bigint,
  onProgress?: (progress: SaltMiningProgress) => void,
  maxAttempts: number = 100000
): Promise<SaltMiningResult> {
  const startTime = Date.now();
  const wethLower = weth.toLowerCase();
  
  // Random offset to avoid collisions
  const randomOffset = Math.floor(Math.random() * 1000000);
  
  for (let i = 0; i < maxAttempts; i++) {
    const saltValue = BigInt(i + randomOffset);
    const salt = pad(toHex(saltValue), { size: 32 }) as Hex;
    
    const address = computeTokenAddress(
      factory,
      tokenAdmin,
      salt,
      name,
      symbol,
      image,
      metadata,
      context,
      chainId
    );
    
    if (address.toLowerCase() < wethLower) {
      return {
        salt,
        address,
        attempts: i + 1,
        elapsed: Date.now() - startTime
      };
    }
    
    // Report progress every 1000 attempts
    if (onProgress && i % 1000 === 0) {
      onProgress({
        checked: i,
        currentSalt: salt,
        elapsed: Date.now() - startTime
      });
    }
    
    // Yield to UI thread every 100 iterations
    if (i % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  throw new Error(`Failed to find valid salt after ${maxAttempts} attempts. Try again.`);
}
