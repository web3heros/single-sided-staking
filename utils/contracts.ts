import { EventLog, Interface, ZeroAddress } from 'ethers';
import { ethers } from 'hardhat';
import { StakingFactory } from '../typechain-types';
import { abi } from '../artifacts/contracts/StakingFactory.sol/StakingFactory.json';

export const templates = [
  'StakingActionFees',
  'StakingCustomReward',
  'StakingOverTimeReward',
  'StakingSimple',
  'StakingTimeLock',
];

export type DeployStakingParams = {
  stakingToken: string;
  deployer: string;
  owner: string;
  args: string;
};

export const deployStaking = async <T extends any>(templateName: string, params: DeployStakingParams): Promise<T> => {
  const iface = new Interface(abi);
  const factory = (await ethers.getContract(`${templateName}Factory`)) as StakingFactory;

  const tx = await factory.createStaking({ ...params });

  const receipt = await tx.wait();
  if (!receipt) throw Error(`Deploying template ${templateName} went wrong`);

  const createdEvent = receipt.logs.find((log) => (log as EventLog).eventName == 'Created') as EventLog;
  if (!createdEvent) throw Error(`Creation of ${templateName} failed`);

  const data = iface.parseLog(createdEvent);
  if (!data) throw Error(`Data for ${templateName} not found in logs`);

  return (await ethers.getContractAt(templateName, data.args[2])) as T;
};
