import { ApiPromise } from '@polkadot/api';
import { Logger } from '@w3f/logger';
import {
    TransactionData, TransactionType, Notifier, FreeBalance, SubscriberConfig
} from '../types';
import { asyncForEach, delay, getSubscriptionNotificationConfig } from '../utils';
import { DelayBalanceDecrease, DelayBalanceIncrease, ZeroBalance } from '../constants';
import { ISubscriptionModule, SubscriptionModuleConstructorParams } from './ISubscribscriptionModule';

interface InitializedMap {
  [name: string]: boolean;
}

export class BalanceChangeBased implements ISubscriptionModule{

    private initializedBalanceSubscriptions: InitializedMap = {};
    private readonly api: ApiPromise
    private readonly networkId: string
    private readonly notifier: Notifier
    private readonly config: SubscriberConfig
    private readonly logger: Logger
    
    constructor(params: SubscriptionModuleConstructorParams) {
      this.api = params.api
      this.networkId = params.networkId
      this.notifier = params.notifier
      this.config = params.config
      this.logger = params.logger
      
      this._initBalanceChangeSubscriptions()
    }

    private _initBalanceChangeSubscriptions = (): void => {
      for (const subscription of this.config.subscriptions) {
        this.initializedBalanceSubscriptions[subscription.name] = false;
      }
    }

    public subscribe = async (): Promise<void> => {
        await this._handleAccountBalanceSubscription()
        this.logger.info(`Balance Change Based Module subscribed...`)
    }

    private async _handleAccountBalanceSubscription(): Promise<void> {
        const freeBalance: FreeBalance = {};
        await asyncForEach(this.config.subscriptions, async (subscription) => {
            const { data: { free: previousFree } } = await this.api.query.system.account(subscription.address);
            freeBalance[subscription.address] = previousFree;
            await this.api.query.system.account(subscription.address, async (acc) => {
                
              const currentFree = acc.data.free;

                if (this.initializedBalanceSubscriptions[subscription.name]) {
                    const data: TransactionData = {
                        name: subscription.name,
                        address: subscription.address,
                        networkId: this.networkId
                    };

                    const notificationConfig = getSubscriptionNotificationConfig(this.config.modules?.balanceChange,subscription.balanceChange)

                    // check if the action was performed by the account or externally
                    const change = currentFree.sub(freeBalance[subscription.address]);
                    freeBalance[subscription.address] = currentFree;
                    if (change.lt(ZeroBalance)) {
                        if(notificationConfig.sent){
                          this.logger.info(`Balances Change Decrease on account ${subscription.name} detected`)
                          data.txType = TransactionType.Sent;
                          /**** to fix a bug on the receiver side, the matrixbot... ***/
                          await delay(DelayBalanceDecrease)
                          /************************************************************/
                          await this._notifyNewBalanceChange(data)
                        }
                        else{
                          this.logger.debug(`Balances Change Decrease on account ${subscription.name} detected. Notification SUPPRESSED`)
                        }
                    } else if(change.gt(ZeroBalance)) {
                        if(notificationConfig.received){
                          this.logger.info(`Balances Change Increase on account ${subscription.name} detected`);
                          data.txType = TransactionType.Received;
                          /**** to fix a bug on the receiver side, the matrixbot... ***/
                          await delay(DelayBalanceIncrease)
                          /************************************************************/
                          await this._notifyNewBalanceChange(data)        
                        }
                        else{
                          this.logger.debug(`Balances Change Increase on account ${subscription.name} detected. Notification SUPPRESSED`)
                        }
                    }
                } else {
                    this.initializedBalanceSubscriptions[subscription.name] = true;
                }
            });
        });
    }

    private _notifyNewBalanceChange = async (data: TransactionData): Promise<void> => {
      try {
        this.logger.info(`Sending New Balance Change notification...`)
        this.logger.debug(JSON.stringify(data))
        await this.notifier.newBalanceChange(data);
      } catch (e) {
          this.logger.error(`could not notify balance change: ${e.message}`);
      }
    }

 
}
