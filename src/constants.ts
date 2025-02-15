import { Balance } from '@polkadot/types/interfaces';
import BN from 'bn.js';

export const ZeroBN = new BN(0);
export const ZeroBalance = ZeroBN as Balance;
export const CacheDelay = 3000 //3 seconds
export const DelayBalanceIncrease = 2500 
export const DelayBalanceDecrease = 5000 
