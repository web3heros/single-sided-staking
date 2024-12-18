import { deployments, ethers } from 'hardhat';
import { ERC20Mock, StakingFactory, StakingMock } from '../typechain-types';
import { deployStaking } from './contracts';

export const getStakingFactoryFor = async (templateContractName: string) => {
  return (await ethers.getContract(`${templateContractName}Factory`)) as StakingFactory;
};

export const getContract = async (contractName: string) => {
  return await ethers.getContract(contractName);
};

export const deployFixtures = deployments.createFixture(
  async ({ deployments, ethers }, options?: { fixtures: string[] }) => {
    await deployments.fixture(options?.fixtures);
    const accountList = await ethers.getSigners();
    const [wallet, user0, user1, user2, signer0, signer1, signer2] = accountList;

    const erc20MockStaking$: ERC20Mock = await ethers.getContract('ERC20MockStaking');
    const erc20MockReward$: ERC20Mock = await ethers.getContract('ERC20MockReward');
    const stakingMock$: StakingMock = await ethers.getContract('StakingMock');

    return {
      // accounts
      accounts: {
        wallet,
        user0,
        user1,
        user2,
        signer0,
        signer1,
        signer2,
      },
      accountList,

      // contracts
      contracts: {
        erc20MockStaking$,
        erc20MockReward$,
        stakingMock$,
      },

      // functions
      getContract,
      getStakingFactoryFor,
      deployStaking,
    };
  },
);
